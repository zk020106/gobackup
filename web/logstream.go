package web

import (
	"context"
	"errors"
	"io"
	"os"
	"time"
)

// 日志流式输出。
//
// 之前的实现直接复用启动时打开的那个 *os.File，并且依赖 fls.SeekLine 定位
// 「最后 50 行」。这带来三个问题：
//
//  1. 同一个文件句柄被所有连接共享，任何一个连接重新 Seek 都会把其他连接的
//     读取位置一起挪走，多个页面同时看日志时会互相丢行/重复行；
//  2. 文件不足 50 行时 SeekLine 会返回 EOF，并把偏移量留在文件开头，于是
//     客户端拿到的是「整个文件」而不是最后若干行，日志文件很大时会把浏览器
//     直接打满（页面看起来就是一直没有渲染）；
//  3. 客户端断开后读取 goroutine 会永久阻塞在 channel 上，泄漏 goroutine，
//     而且每个泄漏的 reader 还会再吞掉一行日志。
//
// 这里改成：每个连接自己打开文件、自己定位到「末尾 N 行」的起始偏移，然后
// 在请求的 context 里轮询读取新增内容并立即 Flush。连接断开即退出，不留
// 后台 goroutine。

const (
	// logPollInterval 是跟随日志时的轮询间隔。
	logPollInterval = 200 * time.Millisecond
	// logStatInterval 是检查文件是否被轮转/截断的间隔。
	logStatInterval = time.Second
	// logHeartbeatInterval 是空闲时发送空行的间隔，用于让反向代理保持连接，
	// 同时也可以让前端知道连接仍然存活。
	logHeartbeatInterval = 15 * time.Second

	// DefaultLogTailLines 是建立连接时默认回看的行数。
	DefaultLogTailLines = 200
	// MaxLogTailLines 是回看行数的上限。
	MaxLogTailLines = 5000
	// defaultTailWindow / maxTailWindow 限制为了找「最后 N 行」而读取的字节数，
	// 避免在一个巨大的日志文件里回扫。
	defaultTailWindow = 512 * 1024
	maxTailWindow     = 4 * 1024 * 1024
)

// logStreamOptions 描述一次文件流式输出。
type logStreamOptions struct {
	// Path 要跟随的文件路径。
	Path string
	// Offset 起始字节偏移；为 0 且 TailLines > 0 时按 TailLines 回看。
	Offset int64
	// TailLines 建立连接时回看的行数，0 表示从头开始。
	TailLines int
	// Follow 为 true 时持续跟随新增内容，为 false 时读到文件末尾就结束。
	Follow bool
	// MaxBytes 限制单次连接最多发送的字节数，0 表示不限制。
	MaxBytes int64
	// Done 在读到文件末尾时被调用，返回 true 表示可以结束本次输出。
	Done func() bool
}

// tailStartOffset 计算「最后 maxLines 行」的起始字节偏移。
//
// 只在文件末尾的 window 字节内回扫，因此对超大日志文件也是常数级开销。
// 文件比 window 更小时从头开始扫描；任何错误都退化为 0（从头开始），
// 这样即使日志异常也不会让页面完全没有输出。
func tailStartOffset(path string, maxLines int, window int64) int64 {
	if maxLines <= 0 {
		return 0
	}
	if window <= 0 || window > maxTailWindow {
		window = maxTailWindow
	}

	file, err := os.Open(path)
	if err != nil {
		return 0
	}
	defer file.Close()

	info, err := file.Stat()
	if err != nil || info.Size() <= 0 {
		return 0
	}

	size := info.Size()
	start := size - window
	if start < 0 {
		start = 0
	}
	if _, err := file.Seek(start, io.SeekStart); err != nil {
		return 0
	}

	buf := make([]byte, size-start)
	n, err := io.ReadFull(file, buf)
	if err != nil && !errors.Is(err, io.ErrUnexpectedEOF) && !errors.Is(err, io.EOF) {
		return 0
	}
	buf = buf[:n]

	// 从后往前数 newline，找到第 maxLines+1 个换行符之后的位置。
	seen := 0
	for i := len(buf) - 1; i >= 0; i-- {
		if buf[i] != '\n' {
			continue
		}
		seen++
		if seen > maxLines {
			return start + int64(i) + 1
		}
	}

	return start
}

// streamFile 从 opts 指定的位置开始，把文件内容持续写给 w。
//
// flush 在每次成功写入后调用（HTTP 场景传 ResponseWriter.Flush），
// 保证内容立即到达客户端而不是留在缓冲区里。ctx 结束时立即返回。
func streamFile(ctx context.Context, w io.Writer, flush func(), opts logStreamOptions) error {
	var (
		file     *os.File
		fileInfo os.FileInfo
		offset   int64
		sent     int64
		lastStat = time.Time{}
		idleAt   = time.Now()
	)

	closeFile := func() {
		if file != nil {
			_ = file.Close()
			file = nil
			fileInfo = nil
		}
	}
	defer closeFile()

	// open 打开（或重新打开）文件并定位到 offset；reset 为 true 时强制从 0 开始。
	open := func(reset bool) error {
		handle, err := os.Open(opts.Path)
		if err != nil {
			return err
		}
		info, err := handle.Stat()
		if err != nil {
			_ = handle.Close()
			return err
		}

		if reset || offset > info.Size() || offset < 0 {
			offset = 0
		}
		if _, err := handle.Seek(offset, io.SeekStart); err != nil {
			_ = handle.Close()
			return err
		}

		closeFile()
		file, fileInfo = handle, info
		lastStat = time.Now()
		return nil
	}

	if opts.Offset > 0 {
		offset = opts.Offset
	} else if opts.TailLines > 0 {
		offset = tailStartOffset(opts.Path, opts.TailLines, defaultTailWindow)
	}

	// 文件可能还没创建（例如日志文件刚被轮转），此时先等待再重试。
	_ = open(false)

	buf := make([]byte, 64*1024)
	for {
		if err := ctx.Err(); err != nil {
			return nil
		}

		if file == nil {
			if err := open(false); err != nil {
				if !sleepContext(ctx, logPollInterval) {
					return nil
				}
				continue
			}
		}

		// 定期检查轮转（inode 变化）与截断（文件变小）。
		if time.Since(lastStat) >= logStatInterval {
			lastStat = time.Now()
			if info, err := os.Stat(opts.Path); err == nil {
				if fileInfo == nil || !os.SameFile(fileInfo, info) {
					if err := open(true); err != nil {
						closeFile()
						continue
					}
					continue
				}
				if info.Size() < offset {
					if _, err := file.Seek(0, io.SeekStart); err == nil {
						offset = 0
					}
					continue
				}
			}
		}

		n, readErr := file.Read(buf)
		if n > 0 {
			if opts.MaxBytes > 0 && sent+int64(n) > opts.MaxBytes {
				n = int(opts.MaxBytes - sent)
			}
			if n > 0 {
				if _, err := w.Write(buf[:n]); err != nil {
					return err
				}
				if flush != nil {
					flush()
				}
				offset += int64(n)
				sent += int64(n)
				idleAt = time.Now()
				if opts.MaxBytes > 0 && sent >= opts.MaxBytes {
					return nil
				}
			}
			continue
		}

		if readErr != nil && !errors.Is(readErr, io.EOF) {
			// 文件可能被替换或删除，下一轮重新打开。
			closeFile()
			if !sleepContext(ctx, logPollInterval) {
				return nil
			}
			continue
		}

		// 已读到文件末尾。
		if opts.Done != nil && opts.Done() {
			return nil
		}
		if !opts.Follow {
			return nil
		}
		if time.Since(idleAt) >= logHeartbeatInterval {
			// 空行心跳：前端会忽略空行，代理层则不会因为长时间无数据断开。
			if _, err := w.Write([]byte("\n")); err != nil {
				return err
			}
			if flush != nil {
				flush()
			}
			idleAt = time.Now()
		}

		if !sleepContext(ctx, logPollInterval) {
			return nil
		}
	}
}

// sleepContext 等待 d，若 ctx 提前结束则返回 false。
func sleepContext(ctx context.Context, d time.Duration) bool {
	timer := time.NewTimer(d)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}
