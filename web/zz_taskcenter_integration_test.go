package web

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gobackup/gobackup/config"
	"github.com/gobackup/gobackup/runlog"
)

// 这是任务中心的端到端用例：真的跑一次备份（tar + 本地存储），通过 HTTP 接口
// 观察进度、并发互斥和任务日志。
//
// 依赖外部命令 tar：缺少时跳过，因此在没有 tar 的平台上不会失败。
func TestTaskCenterEndToEnd(t *testing.T) {
	if _, err := exec.LookPath("tar"); err != nil {
		t.Skip("需要 tar 命令")
	}

	root := t.TempDir()
	workDir := filepath.Join(root, "work")
	srcDir := filepath.Join(root, "src")
	destDir := filepath.Join(root, "dest")
	stateDir := filepath.Join(root, "state")
	for _, dir := range []string{workDir, srcDir, destDir, stateDir} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
	}

	// 生成足够大的随机数据，让压缩阶段持续 1 秒以上，便于观察进度变化。
	writeRandomFiles(t, srcDir, 6, 4*1024*1024)

	configFile := filepath.Join(root, "gobackup.yml")
	writeFile(t, configFile, fmt.Sprintf(`workdir: %s
web:
  host: 127.0.0.1
  port: "18899"
models:
  e2e-files:
    description: "e2e 任务中心"
    compress_with:
      type: tgz
      filename_format: "2006.01.02.15.04.05"
    storages:
      local:
        type: local
        path: %s
        keep: 2
    archive:
      includes:
        - %s
`, workDir, destDir, srcDir))

	runlog.SetDir(filepath.Join(stateDir, "runs"))
	t.Cleanup(func() { runlog.SetDir("") })

	if err := config.Init(configFile); err != nil {
		t.Fatalf("加载测试配置失败: %v", err)
	}

	// 服务日志：/api/log 的回归用例需要一个真实文件。
	logPath := filepath.Join(stateDir, "gobackup.log")
	config.LogFilePath = logPath
	writeFile(t, logPath, strings.Join(numberedLogLines(0, 20), "\n")+"\n")

	router := setupRouter("test")

	// 1) 启动备份
	if status, body := postPerform(t, router, "e2e-files"); status != http.StatusOK {
		t.Fatalf("启动备份失败: status=%d body=%s", status, body)
	}

	// 2) 同一模型/同一数据库环境不允许并发
	status, body := postPerform(t, router, "e2e-files")
	if status != http.StatusConflict {
		t.Fatalf("并发启动应返回 409，实际 status=%d body=%s", status, body)
	}
	if !strings.Contains(body, "进行中的任务") {
		t.Fatalf("冲突提示不友好: %s", body)
	}

	// 3) 轮询任务列表，收集进度
	type taskSample struct {
		percent float64
		phase   string
		running bool
	}
	samples := make([]taskSample, 0, 64)
	deadline := time.Now().Add(120 * time.Second)

	for {
		tasks := fetchTasks(t, router, false)
		if len(tasks) == 0 {
			// 任务已经结束（成功或失败），结束采样后统一断言。
			break
		}
		if len(tasks) != 1 {
			t.Fatalf("期望 1 条进行中的任务，实际 %d 条", len(tasks))
		}
		task := tasks[0]
		sample := taskSample{running: task.Running}
		if task.Progress != nil {
			sample.percent = task.Progress.Percent
			sample.phase = task.Progress.Phase
		}
		samples = append(samples, sample)

		if !task.Running {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("备份超时未结束，最后进度: %+v", task.Progress)
		}
		time.Sleep(150 * time.Millisecond)
	}

	// 进度必须单调不减。
	for index := 1; index < len(samples); index++ {
		if samples[index].percent < samples[index-1].percent {
			t.Fatalf("进度出现回退: %v -> %v", samples[index-1], samples[index])
		}
	}
	phases := map[string]bool{}
	for _, sample := range samples {
		if sample.phase != "" {
			phases[sample.phase] = true
		}
	}

	// 4) 备份结果与归档文件
	all := fetchTasks(t, router, true)
	if len(all) != 1 {
		t.Fatalf("历史记录应有 1 条，实际 %d", len(all))
	}
	finished := all[0]
	if finished.Status != runlog.StatusSuccess {
		t.Fatalf("备份失败: status=%s error=%s\n日志:\n%s", finished.Status, finished.Error, readRunLog(t, router, finished.ID))
	}
	if finished.Progress == nil || finished.Progress.Percent != 100 {
		t.Fatalf("结束后的进度应为 100：%+v", finished.Progress)
	}
	if len(phases) < 2 {
		t.Fatalf("没有观察到阶段变化: %v", phases)
	}
	t.Logf("观察到 %d 次进度采样，阶段: %v", len(samples), phases)
	if finished.ArchiveName == "" {
		t.Fatal("未记录归档文件名")
	}
	if _, err := os.Stat(filepath.Join(destDir, finished.ArchiveName)); err != nil {
		t.Fatalf("归档文件未上传到本地存储: %v", err)
	}

	// 5) 任务日志：完整日志与流式日志都能读到内容
	status, body = invokeRaw(t, router, http.MethodGet, "/api/runs/"+finished.ID+"/log", nil)
	if status != http.StatusOK || !strings.Contains(body, "备份开始") || !strings.Contains(body, "备份结果") {
		t.Fatalf("任务日志内容不完整: status=%d body=%s", status, body)
	}
	// 除了 runlog 自己写的头尾，还必须包含模型/压缩/存储等包通过全局 logger
	// 输出的内容（它们按 goroutine 关联到本次运行，异步执行时最容易漏掉）。
	for _, marker := range []string{"WorkDir:", "=> Compress", "=> Storage"} {
		if !strings.Contains(body, marker) {
			t.Fatalf("任务日志缺少 %q，说明运行日志没有捕获到内部日志:\n%s", marker, body)
		}
	}

	status, body = invokeRaw(t, router, http.MethodGet, "/api/runs/"+finished.ID+"/log/stream", nil)
	if status != http.StatusOK || !strings.Contains(body, "备份结果") {
		t.Fatalf("流式任务日志内容异常: status=%d body=%s", status, body)
	}

	// 6) 服务日志只回看末尾 N 行（旧实现会因为 SeekLine 失败而重发整个文件）
	writeFile(t, logPath, strings.Join(numberedLogLines(0, 200), "\n")+"\n")
	status, body = invokeRaw(t, router, http.MethodGet, "/api/log?tail=5&follow=0", nil)
	if status != http.StatusOK {
		t.Fatalf("读取服务日志失败: status=%d", status)
	}
	lines := strings.Split(strings.TrimSuffix(body, "\n"), "\n")
	if len(lines) != 5 {
		t.Fatalf("tail=5 应返回 5 行，实际 %d 行: %q", len(lines), body)
	}
	if lines[4] != "log-line-0199" {
		t.Fatalf("tail 内容不是最新的 5 行: %q", lines)
	}
}

// readRunLog 读取任务日志，用于失败时输出诊断信息。
func readRunLog(t *testing.T, router http.Handler, id string) string {
	t.Helper()

	status, body := invokeRaw(t, router, http.MethodGet, "/api/runs/"+id+"/log", nil)
	if status != http.StatusOK {
		return fmt.Sprintf("(读取日志失败: status=%d)", status)
	}
	return body
}

func numberedLogLines(start, count int) []string {
	lines := make([]string, 0, count)
	for i := start; i < start+count; i++ {
		lines = append(lines, fmt.Sprintf("log-line-%04d", i))
	}
	return lines
}

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func writeRandomFiles(t *testing.T, dir string, count, size int) {
	t.Helper()

	buf := make([]byte, size)
	if _, err := rand.Read(buf); err != nil {
		t.Fatal(err)
	}

	for index := 0; index < count; index++ {
		name := filepath.Join(dir, fmt.Sprintf("data-%02d.bin", index))
		if err := os.WriteFile(name, buf, 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

func postPerform(t *testing.T, router http.Handler, modelName string) (int, string) {
	t.Helper()

	payload, err := json.Marshal(map[string]string{"model": modelName})
	if err != nil {
		t.Fatal(err)
	}

	return invokeRaw(t, router, http.MethodPost, "/api/perform", payload)
}

func invokeRaw(t *testing.T, router http.Handler, method, path string, body []byte) (int, string) {
	t.Helper()

	request, err := http.NewRequest(method, path, strings.NewReader(string(body)))
	if err != nil {
		t.Fatal(err)
	}
	if len(body) > 0 {
		request.Header.Set("Content-Type", "application/json")
	}

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	return recorder.Code, recorder.Body.String()
}

// fetchTasks 读取任务中心接口并解析成 runlog.Run。
func fetchTasks(t *testing.T, router http.Handler, includeFinished bool) []*runlog.Run {
	t.Helper()

	path := "/api/tasks?include_finished=0"
	if includeFinished {
		path = "/api/tasks?include_finished=1"
	}

	status, body := invokeRaw(t, router, http.MethodGet, path, nil)
	if status != http.StatusOK {
		t.Fatalf("读取任务列表失败: status=%d body=%s", status, body)
	}

	var response struct {
		Tasks []*runlog.Run `json:"tasks"`
	}
	if err := json.Unmarshal([]byte(body), &response); err != nil {
		t.Fatalf("解析任务列表失败: %v body=%s", err, body)
	}

	return response.Tasks
}
