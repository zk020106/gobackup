package logger

import (
	"bytes"
	"log"
	"strings"
	"sync"
	"testing"
)

// capture 把日志输出重定向到一个内存 buffer，返回读取函数与恢复函数。
func capture(t *testing.T) (*bytes.Buffer, func()) {
	t.Helper()

	var (
		mu  sync.Mutex
		buf bytes.Buffer
	)

	original := sharedLogger
	sharedLogger = Logger{
		logFlag: _logFlag,
		myLog:   log.New(&lockedWriter{mu: &mu, buf: &buf}, "", 0),
	}

	return &buf, func() { sharedLogger = original }
}

type lockedWriter struct {
	mu  *sync.Mutex
	buf *bytes.Buffer
}

func (w *lockedWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.buf.Write(p)
}

// Tag 必须只作用于返回值，不能改到全局 logger。旧实现用 SetPrefix 修改共享的
// log.Logger，导致多个备份任务并发时前缀互相串台，标签也会一直粘在后续日志上。
func TestTagDoesNotLeakToOtherLoggers(t *testing.T) {
	buf, restore := capture(t)
	defer restore()

	tagged := Tag("Model: venus")
	tagged.Info("tagged line")
	Info("plain line")

	output := buf.String()
	if !strings.Contains(output, "[Model: venus] tagged line") {
		t.Fatalf("带标签的日志前缀不正确: %q", output)
	}
	if strings.Contains(output, "[Model: venus] plain line") {
		t.Fatalf("标签泄漏到了全局 logger: %q", output)
	}
	if !strings.Contains(output, "plain line") {
		t.Fatalf("全局日志丢失: %q", output)
	}
}

func TestTagComposes(t *testing.T) {
	buf, restore := capture(t)
	defer restore()

	// 包级 Tag 会加方括号和颜色，方法 Tag 只是追加原文（用于 Tag("Scheduler") 这类用法）。
	tagged := Tag("A")
	tagged.Tag("B").Info("hello")

	expected := tagged.Prefix() + "Bhello"
	if output := buf.String(); !strings.Contains(output, expected) {
		t.Fatalf("标签没有按顺序拼接: %q（期望包含 %q）", output, expected)
	}
}

func TestPrefixReturnsTag(t *testing.T) {
	tagged := Tag("Storage")
	if !strings.Contains(tagged.Prefix(), "Storage") {
		t.Fatalf("Prefix() = %q", tagged.Prefix())
	}
	if sharedLogger.Prefix() != "" {
		t.Fatalf("全局 logger 不应带标签: %q", sharedLogger.Prefix())
	}
}
