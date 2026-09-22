// Package runlog 记录每一次备份的元数据与详细日志。
//
// 每次备份在状态目录的 runs/ 子目录下生成一对文件：
//
//	<id>.json  运行结果（模型、触发方式、状态、耗时、归档大小、错误信息……）
//	<id>.log   该次备份的完整日志输出
//
// 只保留最近 MaxRuns 条记录，旧的会在新任务开始时自动清理。
package runlog

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gobackup/gobackup/config"
)

// MaxRuns 是保留的运行记录数量。
const MaxRuns = 100

const (
	StatusRunning = "running"
	StatusSuccess = "success"
	StatusFailure = "failure"
)

var (
	mu sync.Mutex

	// 便于测试时覆盖。
	runsDirOverride string
)

// ProviderInfo 描述参与本次备份的数据库或存储。
type ProviderInfo struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

// Run 是一次备份的完整记录。它同时实现 io.Writer，日志会写入 <id>.log。
type Run struct {
	ID          string         `json:"id"`
	Model       string         `json:"model"`
	Description string         `json:"description,omitempty"`
	Trigger     string         `json:"trigger"`
	Status      string         `json:"status"`
	StartedAt   time.Time      `json:"started_at"`
	FinishedAt  *time.Time     `json:"finished_at,omitempty"`
	DurationMS  int64          `json:"duration_ms"`
	Error       string         `json:"error,omitempty"`
	Databases   []ProviderInfo `json:"databases,omitempty"`
	Storages    []ProviderInfo `json:"storages,omitempty"`
	ArchiveName string         `json:"archive_name,omitempty"`
	ArchiveSize int64          `json:"archive_size,omitempty"`
	LogSize     int64          `json:"log_size,omitempty"`
	// Progress 是实时进度快照，运行中的任务由内存提供，结束后保留最后一次状态。
	Progress *Progress `json:"progress,omitempty"`
	// Running 表示该记录当前是否仍在进行中。
	Running bool `json:"running"`

	file   *os.File
	fileMu sync.Mutex
	closed bool

	progressMu  sync.Mutex
	lastPersist time.Time
}

// Dir 返回运行记录目录。
func Dir() string {
	if dir := os.Getenv("GOBACKUP_RUNS_DIR"); dir != "" {
		return dir
	}
	if runsDirOverride != "" {
		return runsDirOverride
	}
	// 测试环境把记录写进仓库的 log/ 目录，避免污染用户状态目录。
	if os.Getenv("GO_ENV") == "test" {
		return filepath.Join("..", "log", "runs")
	}
	return filepath.Join(config.GoBackupDir, "runs")
}

// SetDir 覆盖运行记录目录，主要供测试使用；传空字符串恢复默认。
func SetDir(dir string) {
	runsDirOverride = dir
}

// Begin 创建一条运行记录并打开它的日志文件。返回的记录可以挂到 logger 上，
// 也可以直接作为 io.Writer 使用。
func Begin(model config.ModelConfig, trigger string) (*Run, error) {
	if err := os.MkdirAll(Dir(), 0o755); err != nil {
		return nil, fmt.Errorf("创建运行记录目录失败: %w", err)
	}

	startedAt := time.Now()
	id := buildID(startedAt, model.Name)

	filePath := filepath.Join(Dir(), id+".log")
	file, err := os.OpenFile(filePath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return nil, fmt.Errorf("创建运行日志失败: %w", err)
	}

	run := &Run{
		ID:          id,
		Model:       model.Name,
		Description: model.Description,
		Trigger:     normalizeTrigger(trigger),
		Status:      StatusRunning,
		StartedAt:   startedAt,
		Databases:   providerInfos(model.Databases),
		Storages:    providerInfos(model.Storages),
		Running:     true,
		file:        file,
	}

	header := fmt.Sprintf(
		"================ GoBackup 备份开始 ================\n模型: %s\n触发方式: %s\n开始时间: %s\n数据库: %s\n存储: %s\n==================================================\n",
		model.Name,
		run.Trigger,
		startedAt.Format("2006-01-02 15:04:05"),
		describeProviders(run.Databases),
		describeProviders(run.Storages),
	)
	_, _ = run.Write([]byte(header))

	mu.Lock()
	_ = writeMetaLocked(run)
	pruneLocked()
	mu.Unlock()

	registerLive(run)

	return run, nil
}

// SetArchive 记录归档文件信息。临时目录会在备份收尾时被清理，所以必须在
// 文件还存在的时候（storage 上传成功后）调用。
func (run *Run) SetArchive(archivePath string) {
	if run == nil || archivePath == "" {
		return
	}
	if info, err := os.Stat(archivePath); err == nil {
		run.ArchiveName = filepath.Base(archivePath)
		run.ArchiveSize = info.Size()
	}
}

// End 结束一次运行记录：写入结束状态、错误信息与归档文件大小。
func End(run *Run, err error, archivePath string) {
	if run == nil {
		return
	}

	finishedAt := time.Now()
	status := StatusSuccess
	message := "备份成功"
	if err != nil {
		status = StatusFailure
		message = err.Error()
	}

	footer := fmt.Sprintf(
		"==================================================\n备份结果: %s\n结束时间: %s\n耗时: %s\n",
		message,
		finishedAt.Format("2006-01-02 15:04:05"),
		finishedAt.Sub(run.StartedAt).Round(time.Millisecond),
	)
	if err != nil {
		footer += fmt.Sprintf("错误信息: %v\n", err)
	}
	footer += "==================================================\n"
	_, _ = run.Write([]byte(footer))

	run.fileMu.Lock()
	if !run.closed {
		_ = run.file.Sync()
		if info, statErr := run.file.Stat(); statErr == nil {
			run.LogSize = info.Size()
		}
		_ = run.file.Close()
		run.closed = true
	}
	run.fileMu.Unlock()

	run.FinishedAt = &finishedAt
	run.Status = status
	run.Running = false
	run.DurationMS = finishedAt.Sub(run.StartedAt).Milliseconds()
	if err != nil {
		run.Error = err.Error()
	}
	if run.ArchiveName == "" && archivePath != "" {
		if info, statErr := os.Stat(archivePath); statErr == nil {
			run.ArchiveName = filepath.Base(archivePath)
			run.ArchiveSize = info.Size()
		}
	}

	mu.Lock()
	run.finishProgress()
	_ = writeMetaLocked(run)
	mu.Unlock()

	unregisterLive(run.ID)
}

// Write 把日志内容写入本次运行的日志文件。
func (run *Run) Write(p []byte) (int, error) {
	if run == nil {
		return len(p), nil
	}

	run.fileMu.Lock()
	defer run.fileMu.Unlock()

	if run.closed {
		return len(p), nil
	}
	return run.file.Write(p)
}

// ValidID 判断 id 是否可以安全地用于拼接文件路径。
func ValidID(id string) bool {
	if id == "" || len(id) > 160 {
		return false
	}
	for _, character := range id {
		switch {
		case character >= 'a' && character <= 'z':
		case character >= 'A' && character <= 'Z':
		case character >= '0' && character <= '9':
		case character == '-' || character == '_' || character == '.':
		default:
			return false
		}
	}
	return !strings.Contains(id, "..")
}

// LogPath 返回指定运行记录的日志文件路径。
func LogPath(id string) (string, error) {
	if !ValidID(id) {
		return "", fmt.Errorf("非法的记录 ID: %q", id)
	}
	return filepath.Join(Dir(), id+".log"), nil
}

func metaPath(id string) string {
	return filepath.Join(Dir(), id+".json")
}

// List 返回运行记录，按开始时间倒序排列。
func List(modelName string, limit int) ([]*Run, error) {
	entries, err := os.ReadDir(Dir())
	if err != nil {
		if os.IsNotExist(err) {
			return []*Run{}, nil
		}
		return nil, err
	}

	runs := make([]*Run, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		id := strings.TrimSuffix(entry.Name(), ".json")
		if !ValidID(id) {
			continue
		}
		run, err := Get(id)
		if err != nil {
			continue
		}
		if modelName != "" && run.Model != modelName {
			continue
		}
		runs = append(runs, run)
	}

	sort.Slice(runs, func(i, j int) bool {
		if runs[i].StartedAt.Equal(runs[j].StartedAt) {
			return runs[i].ID > runs[j].ID
		}
		return runs[i].StartedAt.After(runs[j].StartedAt)
	})

	if limit > 0 && len(runs) > limit {
		runs = runs[:limit]
	}
	return runs, nil
}

// Get 读取单条运行记录。
func Get(id string) (*Run, error) {
	if !ValidID(id) {
		return nil, fmt.Errorf("非法的记录 ID: %q", id)
	}
	data, err := os.ReadFile(metaPath(id))
	if err != nil {
		return nil, err
	}
	var run Run
	if err := json.Unmarshal(data, &run); err != nil {
		return nil, err
	}
	normalizeInterrupted(&run)
	return &run, nil
}

// normalizeInterrupted 修正进程重启后残留在磁盘上的「进行中」记录。
//
// 只有内存里登记过的任务才算真的在进行中：GoBackup 重启（或崩溃）后，
// 上次没跑完的记录会一直显示为进行中，这里把它标记为失败并给出原因，
// 避免任务中心出现永远不动的进度条。
func normalizeInterrupted(run *Run) {
	if run == nil || !run.Running {
		return
	}
	if IsActive(run.ID) {
		return
	}

	run.Running = false
	if run.Status == StatusRunning {
		run.Status = StatusFailure
		run.Error = "任务被中断：GoBackup 在任务结束前退出或重启"
	}
}

// Delete 删除一条运行记录及其日志文件。
func Delete(id string) error {
	if !ValidID(id) {
		return fmt.Errorf("非法的记录 ID: %q", id)
	}
	mu.Lock()
	defer mu.Unlock()

	var firstErr error
	for _, path := range []string{metaPath(id), filepath.Join(Dir(), id+".log")} {
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			firstErr = err
		}
	}
	return firstErr
}

func writeMetaLocked(run *Run) error {
	data, err := json.MarshalIndent(run, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(metaPath(run.ID), data, 0o644)
}

// pruneLocked 只保留最近的 MaxRuns 条记录，调用方必须已经持有 mu。
func pruneLocked() {
	entries, err := os.ReadDir(Dir())
	if err != nil {
		return
	}

	ids := make([]string, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		id := strings.TrimSuffix(entry.Name(), ".json")
		if ValidID(id) {
			ids = append(ids, id)
		}
	}
	if len(ids) <= MaxRuns {
		return
	}

	// ID 以时间戳开头，按字典序排序即按时间排序。
	sort.Strings(ids)
	for _, id := range ids[:len(ids)-MaxRuns] {
		_ = os.Remove(metaPath(id))
		_ = os.Remove(filepath.Join(Dir(), id+".log"))
	}
}

func buildID(startedAt time.Time, modelName string) string {
	slug := sanitizeModelName(modelName)
	suffix := make([]byte, 3)
	if _, err := rand.Read(suffix); err != nil {
		return fmt.Sprintf("%s-%s", startedAt.Format("20060102-150405"), slug)
	}
	return fmt.Sprintf("%s-%s-%s", startedAt.Format("20060102-150405"), slug, hex.EncodeToString(suffix))
}

func sanitizeModelName(name string) string {
	var builder strings.Builder
	for _, character := range name {
		switch {
		case character >= 'a' && character <= 'z',
			character >= 'A' && character <= 'Z',
			character >= '0' && character <= '9',
			character == '-', character == '_':
			builder.WriteRune(character)
		default:
			builder.WriteByte('-')
		}
	}
	slug := strings.Trim(builder.String(), "-")
	if slug == "" {
		return "model"
	}
	if len(slug) > 40 {
		slug = slug[:40]
	}
	return slug
}

func normalizeTrigger(trigger string) string {
	switch trigger {
	case "schedule", "cli", "manual", "api":
		return trigger
	default:
		return "manual"
	}
}

func providerInfos(providers map[string]config.SubConfig) []ProviderInfo {
	if len(providers) == 0 {
		return nil
	}
	names := make([]string, 0, len(providers))
	for name := range providers {
		names = append(names, name)
	}
	sort.Strings(names)

	infos := make([]ProviderInfo, 0, len(names))
	for _, name := range names {
		infos = append(infos, ProviderInfo{Name: name, Type: providers[name].Type})
	}
	return infos
}

func describeProviders(providers []ProviderInfo) string {
	if len(providers) == 0 {
		return "（无）"
	}
	parts := make([]string, 0, len(providers))
	for _, provider := range providers {
		parts = append(parts, fmt.Sprintf("%s(%s)", provider.Name, provider.Type))
	}
	return strings.Join(parts, ", ")
}
