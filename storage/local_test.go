package storage

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/spf13/viper"

	"github.com/gobackup/gobackup/config"
)

// localTestModel 组装一个使用本地存储的模型配置。
func localTestModel(t *testing.T, workDir, path string) config.ModelConfig {
	t.Helper()

	storageViper := viper.New()
	storageViper.Set("type", "local")
	storageViper.Set("path", path)

	return config.ModelConfig{
		Name:    "local_test",
		WorkDir: workDir,
		Storages: map[string]config.SubConfig{
			"local": {Name: "local", Type: "local", Viper: storageViper},
		},
		DefaultStorage: "local",
	}
}

func newLocalStorage(t *testing.T, model config.ModelConfig) *Local {
	t.Helper()

	base, err := newBase(model, "", model.Storages["local"])
	if err != nil {
		t.Fatalf("newBase: %v", err)
	}

	local := &Local{Base: base, path: model.Storages["local"].Viper.GetString("path")}
	if err := local.open(); err != nil {
		t.Fatalf("open: %v", err)
	}
	return local
}

// TestLocalRelativePathUsesWorkDir 是回归用例：相对 path 必须相对 WorkDir 解析，
// 而且 upload / list / delete 要用同一个基准（以前 upload 拼 WorkDir，
// list / delete 直接拿原始值，进程工作目录一变就读到了别处）。
func TestLocalRelativePathUsesWorkDir(t *testing.T) {
	workDir := t.TempDir()
	model := localTestModel(t, workDir, "backups")
	local := newLocalStorage(t, model)

	root, err := local.root()
	if err != nil {
		t.Fatalf("root: %v", err)
	}
	if root != filepath.Join(workDir, "backups") {
		t.Fatalf("root = %q, 期望 %q", root, filepath.Join(workDir, "backups"))
	}

	// open() 会把解析结果写回 s.path，后续 list / delete 才能用同一份绝对路径。
	if local.path != root {
		t.Fatalf("open() 之后 s.path = %q, 期望 %q", local.path, root)
	}
}

// TestLocalAbsolutePathKept 覆盖 Windows 上的回归：C:\... 不能被当成相对路径
// 再拼一次 WorkDir（path.IsAbs 只认 "/" 开头，这正是以前的 bug）。
func TestLocalAbsolutePathKept(t *testing.T) {
	dir := t.TempDir()
	model := localTestModel(t, t.TempDir(), dir)
	local := newLocalStorage(t, model)

	root, err := local.root()
	if err != nil {
		t.Fatalf("root: %v", err)
	}
	// t.TempDir 在 Windows 上会是 8.3 短名（RUNNER~1），用 os.SameFile 比较。
	expected, err := os.Stat(dir)
	if err != nil {
		t.Fatal(err)
	}
	actual, err := os.Stat(root)
	if err != nil {
		t.Fatal(err)
	}
	if !os.SameFile(expected, actual) {
		t.Fatalf("root = %q, 期望 %q", root, dir)
	}
}

// TestLocalTargetPathRejectsTraversal 保证下载 / 删除接口传进来的路径不能跳出存储根目录。
func TestLocalTargetPathRejectsTraversal(t *testing.T) {
	dir := t.TempDir()
	model := localTestModel(t, t.TempDir(), dir)
	local := newLocalStorage(t, model)

	inside := map[string]string{
		"archive.tar.gz":     filepath.Join(dir, "archive.tar.gz"),
		"/archive.tar.gz":    filepath.Join(dir, "archive.tar.gz"),
		"./archive.tar.gz":   filepath.Join(dir, "archive.tar.gz"),
		"sub/archive.tar.gz": filepath.Join(dir, "sub", "archive.tar.gz"),
	}
	for key, expected := range inside {
		got, err := local.targetPath(key)
		if err != nil {
			t.Fatalf("targetPath(%q) 不应报错: %v", key, err)
		}
		if got != expected {
			t.Fatalf("targetPath(%q) = %q, 期望 %q", key, got, expected)
		}
	}

	outside := []string{
		"../secret.txt",
		"../../secret.txt",
		"sub/../../secret.txt",
		"/../secret.txt",
		`..\secret.txt`,
	}
	for _, key := range outside {
		if got, err := local.targetPath(key); err == nil {
			t.Fatalf("targetPath(%q) 应当被拒绝，实际得到 %q", key, got)
		}
	}
}

// TestLocalPathReportsNonLocalStorage 确认非本地存储会明确告诉调用方改用 Download。
func TestLocalPathReportsNonLocalStorage(t *testing.T) {
	s3Viper := viper.New()
	s3Viper.Set("type", "s3")
	s3Viper.Set("bucket", "demo")

	model := config.ModelConfig{
		Name: "s3_test",
		Storages: map[string]config.SubConfig{
			"s3": {Name: "s3", Type: "s3", Viper: s3Viper},
		},
		DefaultStorage: "s3",
	}

	if _, isLocal, err := LocalPath(model, "archive.tar.gz"); isLocal || err != nil {
		t.Fatalf("S3 存储不应被判定为本地存储: isLocal=%v err=%v", isLocal, err)
	}
}

// TestLocalPathReturnsFile 覆盖 web 层直接下发文件所依赖的解析结果。
func TestLocalPathReturnsFile(t *testing.T) {
	dir := t.TempDir()
	model := localTestModel(t, t.TempDir(), dir)

	content := []byte("archive bytes")
	target := filepath.Join(dir, "archive.tar.gz")
	if err := os.WriteFile(target, content, 0o644); err != nil {
		t.Fatal(err)
	}

	got, isLocal, err := LocalPath(model, "archive.tar.gz")
	if err != nil || !isLocal {
		t.Fatalf("LocalPath 失败: isLocal=%v err=%v", isLocal, err)
	}
	if got != target {
		t.Fatalf("LocalPath = %q, 期望 %q", got, target)
	}

	// 文件不存在时应当报错（web 层会转成 404），而不是给一个空路径。
	if _, _, err := LocalPath(model, "missing.tar.gz"); err == nil {
		t.Fatal("文件不存在时应当返回错误")
	}

	// 目录（分卷归档）不能当文件下载。
	if err := os.Mkdir(filepath.Join(dir, "split"), 0o755); err != nil {
		t.Fatal(err)
	}
	if _, _, err := LocalPath(model, "split"); err == nil {
		t.Fatal("目录不应作为文件下载")
	}
}
