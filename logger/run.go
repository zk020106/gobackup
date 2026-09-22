package logger

import (
	"io"
	"sync"

	"github.com/gobackup/gobackup/internal/goroutineid"
)

// 运行日志分流：备份任务希望把「这一次执行」产生的日志完整落盘，而
// database / storage / compressor 等包都直接使用全局 logger，没有地方
// 注入 per-run logger。
//
// 这里的做法是按 goroutine 挂载 writer：一次 Perform 从头到尾都在同一个
// goroutine 里执行，所以在开始时挂上本次运行的日志文件，结束时摘掉即可。
// 调度任务、Web 手动触发、CLI perform 都走同一条路径，互不干扰。

type runWriterEntry struct {
	id uint64
	w  io.Writer
}

var runWriters = struct {
	sync.Mutex
	entries map[uint64][]runWriterEntry
	nextID  uint64
}{entries: map[uint64][]runWriterEntry{}}

// AttachRunWriter 把 w 挂到当前 goroutine 上：此后该 goroutine 写出的日志
// 除了照常输出到 stdout / 日志文件外，还会复制一份给 w。返回的函数用于
// 解除挂载，可以安全地重复调用。
func AttachRunWriter(w io.Writer) func() {
	if w == nil {
		return func() {}
	}

	goid := goroutineid.Current()
	runWriters.Lock()
	runWriters.nextID++
	entry := runWriterEntry{id: runWriters.nextID, w: w}
	runWriters.entries[goid] = append(runWriters.entries[goid], entry)
	runWriters.Unlock()

	var once sync.Once
	return func() {
		once.Do(func() {
			runWriters.Lock()
			defer runWriters.Unlock()

			list := runWriters.entries[goid]
			for index, item := range list {
				if item.id == entry.id {
					runWriters.entries[goid] = append(list[:index], list[index+1:]...)
					break
				}
			}
			if len(runWriters.entries[goid]) == 0 {
				delete(runWriters.entries, goid)
			}
		})
	}
}

func currentRunWriters(goid uint64) []io.Writer {
	runWriters.Lock()
	defer runWriters.Unlock()

	entries := runWriters.entries[goid]
	if len(entries) == 0 {
		return nil
	}
	writers := make([]io.Writer, len(entries))
	for index, entry := range entries {
		writers[index] = entry.w
	}
	return writers
}

// runAwareWriter 是全局日志 writer 的最外层：先按原有方式输出，再把同一份
// 内容复制给当前 goroutine 上的运行日志 writer。
type runAwareWriter struct {
	base io.Writer
}

func (w runAwareWriter) Write(b []byte) (int, error) {
	n, err := w.base.Write(b)

	if goid := goroutineid.Current(); goid != 0 {
		for _, writer := range currentRunWriters(goid) {
			_, _ = writer.Write(b)
		}
	}

	return n, err
}
