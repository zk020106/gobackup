package helper

import (
	"fmt"
	"io"
	"os"
	"sync"
	"time"

	"github.com/cheggaaa/pb/v3"
	"github.com/dustin/go-humanize"
	"github.com/gobackup/gobackup/internal/progress"
	"github.com/gobackup/gobackup/logger"
	"github.com/hako/durafmt"
)

const (
	progressbarTemplate = `{{string . "time"}} {{string . "prefix"}}{{bar . "[" "=" "=" "-" "]"}} {{percent .}} ({{speed .}})`
)

type ProgressBar struct {
	bar        *pb.ProgressBar
	FileLength int64
	Reader     io.Reader
	logger     logger.Logger
	startTime  time.Time
	stopOnce   sync.Once
	stop       chan struct{}
}

func NewProgressBar(myLogger logger.Logger, reader *os.File) *ProgressBar {
	info, _ := reader.Stat()
	fileLength := info.Size()

	bar := pb.ProgressBarTemplate(progressbarTemplate).Start64(fileLength)
	bar.SetWidth(100)
	bar.Set("time", time.Now().Format(logger.TimeFormat))
	bar.Set("prefix", myLogger.Prefix())

	multiReader := bar.NewProxyReader(reader)

	progressBar := &ProgressBar{
		bar:        bar,
		FileLength: fileLength,
		Reader:     multiReader,
		logger:     myLogger,
		startTime:  time.Now(),
		stop:       make(chan struct{}),
	}
	progressBar.start()

	return progressBar
}

func (p *ProgressBar) start() {
	logger := p.logger

	logger.Infof("-> Uploading (%s)...", humanize.Bytes(uint64(p.FileLength)))

	// 上传由各个存储的 SDK 在自己的 goroutine 里读取文件，goroutine 关联的
	// 进度接收端在这里（备份 goroutine）取出后直接持有。
	if sink := progress.Current(); sink != nil {
		go p.report(sink)
	}
}

// report 周期性把当前上传字节数上报给本次备份任务，让任务中心能看到实时进度。
func (p *ProgressBar) report(sink progress.Sink) {
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	// 兜底：即使某个存储实现漏掉了 Done/Errorf，上报协程也不会永久存活。
	deadline := time.After(24 * time.Hour)

	for {
		select {
		case <-p.stop:
			sink.ReportBytes(p.FileLength, p.FileLength)
			return
		case <-deadline:
			return
		case <-ticker.C:
			sink.ReportBytes(p.bar.Current(), p.FileLength)
		}
	}
}

// Stop 结束进度上报，可以安全地重复调用。
func (p *ProgressBar) Stop() {
	p.stopOnce.Do(func() { close(p.stop) })
}

func (p *ProgressBar) Errorf(format string, err ...any) error {
	p.bar.Finish()
	p.Stop()

	return fmt.Errorf(format, err...)
}

func (p *ProgressBar) Done(url string) {
	logger := p.logger

	p.bar.Finish()
	p.Stop()

	t := time.Now()
	elapsed := t.Sub(p.startTime)

	logger.Info(fmt.Sprintf("Uploaded: %s (Duration %v)", url, durafmt.Parse(elapsed).LimitFirstN(2).String()))
}
