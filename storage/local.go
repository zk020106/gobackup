package storage

import (
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gobackup/gobackup/config"
	"github.com/gobackup/gobackup/helper"
	"github.com/gobackup/gobackup/internal/progress"
	"github.com/gobackup/gobackup/logger"
)

// Local storage
//
// type: local
// path: /data/backups
type Local struct {
	Base
	path string
}

func (s *Local) open() error {
	s.path = s.viper.GetString("path")
	root, err := s.root()
	if err != nil {
		return err
	}
	s.path = root
	return helper.MkdirP(root)
}

func (s *Local) close() {}

// root 返回存储根目录的绝对路径。
//
// 统一在这里解析，避免 upload / list / delete 各自用不同的基准：
// upload 之前会把相对路径拼到 WorkDir 上，而 list / delete 直接拿原始值，
// 进程工作目录和 WorkDir 不一致时就会读到别的地方。
func (s *Local) root() (string, error) {
	root := s.path
	if root == "" {
		root = s.viper.GetString("path")
	}
	if root == "" {
		return "", fmt.Errorf("local 存储缺少 path 配置")
	}

	// 必须用 filepath 而不是 path：path.IsAbs 只认以 "/" 开头的路径，
	// 在 Windows 上会把 "C:\data\backup" 当成相对路径再拼一次 WorkDir。
	if !filepath.IsAbs(root) {
		root = filepath.Join(s.model.WorkDir, root)
	}

	return filepath.Abs(root)
}

// targetPath 把 fileKey 解析成存储根目录下的绝对路径。
//
// fileKey 可能来自接口参数（下载 / 删除），所以这里挡掉跳出根目录的路径。
func (s *Local) targetPath(fileKey string) (string, error) {
	root, err := s.root()
	if err != nil {
		return "", err
	}

	// 先明确拒绝 ".."，而不是靠 Clean 把它抹平：抹平之后路径仍在根目录内，
	// 但用户传 "../../etc/passwd" 会静默变成 "<root>/etc/passwd"，
	// 排查问题时非常费解。这里直接报错，语义更清楚。
	normalized := filepath.ToSlash(fileKey)
	for _, segment := range strings.Split(normalized, "/") {
		if segment == ".." {
			return "", fmt.Errorf("非法的文件路径: %s", fileKey)
		}
	}

	target := filepath.Join(root, filepath.FromSlash(filepath.Clean("/"+normalized)))

	// 兜底：任何情况下都不能越过根目录。
	if target != root && !strings.HasPrefix(target, root+string(os.PathSeparator)) {
		return "", fmt.Errorf("非法的文件路径: %s", fileKey)
	}
	return target, nil
}

func (s *Local) upload(fileKey string) (err error) {
	logger := logger.Tag("Local")

	targetPath, err := s.targetPath(fileKey)
	if err != nil {
		return err
	}

	targetDir := filepath.Dir(targetPath)
	if err := helper.MkdirP(targetDir); err != nil {
		logger.Errorf("failed to mkdir %q, %v", targetDir, err)
	}

	// 用 Go 原生复制代替 `cp -a`：Windows 上没有 cp 命令，而且这样可以把
	// 实时字节进度上报给任务中心。分卷后的归档是目录，这里会递归复制。
	if err := copyPath(s.archivePath, targetPath); err != nil {
		return err
	}

	logger.Info("Store succeeded", targetPath)
	return nil
}

func (s *Local) delete(fileKey string) (err error) {
	targetPath, err := s.targetPath(fileKey)
	if err != nil {
		return err
	}
	logger.Info("Deleting", targetPath)

	info, err := os.Lstat(targetPath)
	if err != nil {
		return err
	}
	if info.IsDir() {
		// 分卷归档是以目录形式保存的，递归删除才不会失败。
		return os.RemoveAll(targetPath)
	}

	return os.Remove(targetPath)
}

// List all files
func (s *Local) list(parent string) ([]FileItem, error) {
	remotePath, err := s.targetPath(parent)
	if err != nil {
		return nil, err
	}
	var items = []FileItem{}

	files, err := os.ReadDir(remotePath)
	if err != nil {
		return nil, err
	}

	for _, file := range files {
		if file.IsDir() {
			continue
		}

		info, statErr := file.Info()
		if statErr != nil {
			continue
		}

		items = append(items, FileItem{
			Filename:     file.Name(),
			Size:         info.Size(),
			LastModified: info.ModTime(),
		})
	}

	return items, nil
}

// download 只对「能给出 URL」的存储有意义。本地存储没有可跳转的地址，
// 由 web 层用 LocalPath 直接把文件发给浏览器，所以这里返回明确提示。
func (s *Local) download(fileKey string) (string, error) {
	return "", fmt.Errorf("本地存储没有下载链接，请通过文件浏览页面下载")
}

// LocalPath 解析「本地存储」里 fileKey 对应的绝对路径，供 web 层直接下发文件。
//
// 返回值 isLocal 表示该模型的默认存储是不是本地存储：为 false 时调用方应当
// 改用 Download 拿远端 URL。
func LocalPath(model config.ModelConfig, fileKey string) (path string, isLocal bool, err error) {
	storageConfig, ok := model.Storages[model.DefaultStorage]
	if !ok || storageConfig.Type != "local" {
		return "", false, nil
	}

	local := &Local{
		Base: Base{model: model, viper: storageConfig.Viper},
		path: storageConfig.Viper.GetString("path"),
	}

	target, err := local.targetPath(fileKey)
	if err != nil {
		return "", true, err
	}

	info, err := os.Stat(target)
	if err != nil {
		return "", true, err
	}
	if info.IsDir() {
		return "", true, fmt.Errorf("%s 是目录（分卷归档），暂不支持打包下载", fileKey)
	}

	return target, true, nil
}

// progressWriter 把写入字节数按固定间隔上报给当前备份任务，避免每个小块都
// 触发一次进度更新。
type progressWriter struct {
	writer     io.Writer
	total      int64
	done       int64
	lastReport time.Time
}

func (w *progressWriter) Write(p []byte) (int, error) {
	n, err := w.writer.Write(p)
	w.done += int64(n)

	if w.total > 0 {
		if w.done >= w.total || time.Since(w.lastReport) >= 200*time.Millisecond {
			w.lastReport = time.Now()
			progress.Bytes(w.done, w.total)
		}
	}

	return n, err
}

// copyPath 复制文件或目录（等价于 `cp -a`）。目录会递归复制并保留权限位。
func copyPath(src, dst string) error {
	info, err := os.Stat(src)
	if err != nil {
		return err
	}

	if !info.IsDir() {
		return copyFile(src, dst, info.Size(), info.Mode())
	}

	total := pathSize(src)
	var copied int64

	return filepath.WalkDir(src, func(currentPath string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}

		relative, relErr := filepath.Rel(src, currentPath)
		if relErr != nil {
			return relErr
		}
		target := filepath.Join(dst, relative)

		if entry.IsDir() {
			return os.MkdirAll(target, 0o755)
		}

		entryInfo, infoErr := entry.Info()
		if infoErr != nil {
			return infoErr
		}

		if copyErr := copyFile(currentPath, target, entryInfo.Size(), entryInfo.Mode()); copyErr != nil {
			return copyErr
		}

		copied += entryInfo.Size()
		if total > 0 {
			progress.Bytes(copied, total)
		}
		return nil
	})
}

// copyFile 复制单个文件并上报字节进度。
func copyFile(src, dst string, size int64, mode os.FileMode) error {
	if err := helper.MkdirP(filepath.Dir(dst)); err != nil {
		return err
	}

	source, err := os.Open(src)
	if err != nil {
		return err
	}
	defer source.Close()

	target, err := os.OpenFile(dst, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, mode.Perm())
	if err != nil {
		return err
	}

	writer := &progressWriter{writer: target, total: size}
	if _, err := io.Copy(writer, source); err != nil {
		target.Close()
		return err
	}

	if size > 0 {
		progress.Bytes(size, size)
	}

	return target.Close()
}

// pathSize 统计文件或目录的总字节数，用于进度展示。
func pathSize(root string) int64 {
	info, err := os.Stat(root)
	if err != nil {
		return 0
	}
	if !info.IsDir() {
		return info.Size()
	}

	var total int64
	_ = filepath.WalkDir(root, func(_ string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return nil
		}
		if fileInfo, statErr := entry.Info(); statErr == nil {
			total += fileInfo.Size()
		}
		return nil
	})
	return total
}
