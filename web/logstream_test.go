package web

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

// syncBuffer 是并发安全的收集器，模拟 HTTP 客户端收到的内容。
type syncBuffer struct {
	mu  sync.Mutex
	buf strings.Builder
}

func (b *syncBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *syncBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}

func (b *syncBuffer) lines() []string {
	text := b.String()
	if text == "" {
		return nil
	}
	return strings.Split(strings.TrimSuffix(text, "\n"), "\n")
}

func writeTestFile(t *testing.T, path string, lines []string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(strings.Join(lines, "\n")+"\n"), 0o644); err != nil {
		t.Fatal(err)
	}
}

func appendTestLines(t *testing.T, path string, lines []string) {
	t.Helper()
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	if _, err := file.WriteString(strings.Join(lines, "\n") + "\n"); err != nil {
		t.Fatal(err)
	}
}

func numberedLines(start, count int) []string {
	lines := make([]string, 0, count)
	for i := start; i < start+count; i++ {
		lines = append(lines, fmt.Sprintf("line-%04d", i))
	}
	return lines
}

// waitForLines 轮询等待缓冲区里出现 want 行，返回实际收到的行。
func waitForLines(t *testing.T, buf *syncBuffer, want int, timeout time.Duration) []string {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for {
		got := buf.lines()
		if len(got) >= want {
			return got
		}
		if time.Now().After(deadline) {
			return got
		}
		time.Sleep(20 * time.Millisecond)
	}
}

func TestTailStartOffsetReturnsLastLines(t *testing.T) {
	path := filepath.Join(t.TempDir(), "app.log")
	writeTestFile(t, path, numberedLines(0, 200))

	offset := tailStartOffset(path, 50, defaultTailWindow)

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	got := strings.Split(strings.TrimSuffix(string(data[offset:]), "\n"), "\n")
	if len(got) != 50 {
		t.Fatalf("期望 50 行，实际 %d 行：%v", len(got), got)
	}
	if got[0] != "line-0150" || got[49] != "line-0199" {
		t.Fatalf("回看范围错误：first=%q last=%q", got[0], got[49])
	}
}

// 旧实现在文件行数少于回看行数时会把偏移量丢回 0，导致整份日志重发。
func TestTailStartOffsetSmallFileStartsAtZero(t *testing.T) {
	path := filepath.Join(t.TempDir(), "small.log")
	writeTestFile(t, path, numberedLines(0, 5))

	if offset := tailStartOffset(path, 50, defaultTailWindow); offset != 0 {
		t.Fatalf("小文件应从 0 开始，实际偏移 %d", offset)
	}
}

func TestTailStartOffsetMissingFile(t *testing.T) {
	if offset := tailStartOffset(filepath.Join(t.TempDir(), "missing.log"), 50, defaultTailWindow); offset != 0 {
		t.Fatalf("文件不存在时应返回 0，实际 %d", offset)
	}
}

func TestTailStartOffsetZeroLines(t *testing.T) {
	path := filepath.Join(t.TempDir(), "app.log")
	writeTestFile(t, path, numberedLines(0, 20))

	if offset := tailStartOffset(path, 0, defaultTailWindow); offset != 0 {
		t.Fatalf("tail=0 应从头开始，实际 %d", offset)
	}
}

// 文件很长时只应回扫末尾窗口，并且窗口内的行数不足时要退回到窗口起点。
func TestTailStartOffsetLargeFileWindow(t *testing.T) {
	path := filepath.Join(t.TempDir(), "big.log")
	lines := make([]string, 0, 20000)
	for i := 0; i < 20000; i++ {
		lines = append(lines, fmt.Sprintf("line-%05d-%s", i, strings.Repeat("x", 80)))
	}
	writeTestFile(t, path, lines)

	offset := tailStartOffset(path, 100, defaultTailWindow)
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	got := strings.Split(strings.TrimSuffix(string(data[offset:]), "\n"), "\n")
	if len(got) != 100 {
		t.Fatalf("期望 100 行，实际 %d 行", len(got))
	}
	if got[len(got)-1] != lines[len(lines)-1] {
		t.Fatalf("最后一行不匹配：%q", got[len(got)-1])
	}
}

func TestStreamFileTailAndFollow(t *testing.T) {
	path := filepath.Join(t.TempDir(), "app.log")
	writeTestFile(t, path, numberedLines(0, 100))

	buf := &syncBuffer{}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	done := make(chan error, 1)
	go func() {
		done <- streamFile(ctx, buf, nil, logStreamOptions{
			Path:      path,
			TailLines: 10,
			Follow:    true,
		})
	}()

	got := waitForLines(t, buf, 10, 2*time.Second)
	if len(got) != 10 {
		t.Fatalf("期望先收到 10 行，实际 %d 行", len(got))
	}
	if got[0] != "line-0090" {
		t.Fatalf("回看起点错误：%q", got[0])
	}

	appendTestLines(t, path, []string{"appended-1", "appended-2"})
	got = waitForLines(t, buf, 12, 2*time.Second)
	if len(got) != 12 || got[11] != "appended-2" {
		t.Fatalf("未跟随到新增行：%v", got)
	}

	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("取消后应正常返回，实际 %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("取消后 streamFile 没有退出")
	}
}

func TestStreamFileWithoutFollowStopsAtEOF(t *testing.T) {
	path := filepath.Join(t.TempDir(), "app.log")
	writeTestFile(t, path, numberedLines(0, 10))

	buf := &syncBuffer{}
	err := streamFile(context.Background(), buf, nil, logStreamOptions{
		Path:   path,
		Follow: false,
	})
	if err != nil {
		t.Fatalf("非跟随模式应正常结束：%v", err)
	}
	if got := buf.lines(); len(got) != 10 {
		t.Fatalf("期望 10 行，实际 %d 行", len(got))
	}
}

func TestStreamFileDoneCallback(t *testing.T) {
	path := filepath.Join(t.TempDir(), "app.log")
	writeTestFile(t, path, numberedLines(0, 3))

	buf := &syncBuffer{}
	done := func() bool { return true }
	if err := streamFile(context.Background(), buf, nil, logStreamOptions{
		Path:   path,
		Follow: true,
		Done:   done,
	}); err != nil {
		t.Fatalf("Done 返回 true 时应结束：%v", err)
	}
	if got := buf.lines(); len(got) != 3 {
		t.Fatalf("期望 3 行，实际 %d 行", len(got))
	}
}

// 日志被轮转（重命名 + 新建）后，流应自动切换到新文件。
func TestStreamFileRotation(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "app.log")
	writeTestFile(t, path, []string{"old-1", "old-2"})

	buf := &syncBuffer{}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	done := make(chan error, 1)
	go func() {
		done <- streamFile(ctx, buf, nil, logStreamOptions{Path: path, Follow: true})
	}()

	if got := waitForLines(t, buf, 2, 2*time.Second); len(got) != 2 {
		t.Fatalf("期望读到 2 行旧内容，实际 %v", got)
	}

	if err := os.Rename(path, path+".1"); err != nil {
		// Windows 不允许重命名仍被打开的文件（logrotate 的 rename 模式只在
		// Unix 上可用），这种情况下跳过轮转用例。
		t.Skipf("当前平台不支持重命名被打开的文件: %v", err)
	}
	writeTestFile(t, path, []string{"new-1"})

	got := waitForLines(t, buf, 3, 3*time.Second)
	if len(got) != 3 || got[2] != "new-1" {
		t.Fatalf("轮转后未切换到新文件：%v", got)
	}

	cancel()
	<-done
}

// 日志被截断（例如 > 重定向覆盖）后，流应从新文件开头继续。
func TestStreamFileTruncation(t *testing.T) {
	path := filepath.Join(t.TempDir(), "app.log")
	writeTestFile(t, path, numberedLines(0, 50))

	buf := &syncBuffer{}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	done := make(chan error, 1)
	go func() {
		done <- streamFile(ctx, buf, nil, logStreamOptions{Path: path, TailLines: 10, Follow: true})
	}()

	if got := waitForLines(t, buf, 10, 2*time.Second); len(got) != 10 {
		t.Fatalf("期望读到 10 行，实际 %v", got)
	}

	writeTestFile(t, path, []string{"after-truncate"})
	got := waitForLines(t, buf, 11, 3*time.Second)
	if len(got) != 11 || got[10] != "after-truncate" {
		t.Fatalf("截断后未从新内容继续：%v", got)
	}

	cancel()
	<-done
}

func TestStreamFileMaxBytes(t *testing.T) {
	path := filepath.Join(t.TempDir(), "app.log")
	writeTestFile(t, path, numberedLines(0, 500))

	buf := &syncBuffer{}
	if err := streamFile(context.Background(), buf, nil, logStreamOptions{
		Path:     path,
		Follow:   true,
		MaxBytes: 32,
	}); err != nil {
		t.Fatalf("达到字节上限后应正常结束：%v", err)
	}
	if got := buf.String(); len(got) != 32 {
		t.Fatalf("期望只发送 32 字节，实际 %d", len(got))
	}
}

// 文件还不存在时不应报错退出，而应等待文件出现。
func TestStreamFileWaitsForFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "later.log")

	buf := &syncBuffer{}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	done := make(chan error, 1)
	go func() {
		done <- streamFile(ctx, buf, nil, logStreamOptions{Path: path, Follow: true})
	}()

	time.Sleep(150 * time.Millisecond)
	writeTestFile(t, path, []string{"created-later"})

	if got := waitForLines(t, buf, 1, 2*time.Second); len(got) != 1 || got[0] != "created-later" {
		t.Fatalf("文件出现后未开始输出：%v", got)
	}

	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("取消后没有退出")
	}
}

// 多个连接必须互不影响：旧实现共享同一个文件句柄，第二个连接 Seek 会让
// 第一个连接丢掉后续新增的行。
func TestStreamFileConcurrentClients(t *testing.T) {
	path := filepath.Join(t.TempDir(), "app.log")
	writeTestFile(t, path, numberedLines(0, 100))

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	first, second := &syncBuffer{}, &syncBuffer{}
	doneFirst, doneSecond := make(chan error, 1), make(chan error, 1)

	go func() {
		doneFirst <- streamFile(ctx, first, nil, logStreamOptions{Path: path, TailLines: 10, Follow: true})
	}()
	waitForLines(t, first, 10, 2*time.Second)

	go func() {
		doneSecond <- streamFile(ctx, second, nil, logStreamOptions{Path: path, TailLines: 10, Follow: true})
	}()
	waitForLines(t, second, 10, 2*time.Second)

	appendTestLines(t, path, []string{"shared-1", "shared-2"})

	if got := waitForLines(t, first, 12, 2*time.Second); len(got) != 12 {
		t.Fatalf("第一个连接丢失了新增行：%v", got)
	}
	if got := waitForLines(t, second, 12, 2*time.Second); len(got) != 12 {
		t.Fatalf("第二个连接丢失了新增行：%v", got)
	}

	cancel()
	<-doneFirst
	<-doneSecond
}
