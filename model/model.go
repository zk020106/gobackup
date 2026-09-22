package model

import (
	"fmt"
	"os"
	"time"

	"github.com/spf13/viper"

	"github.com/gobackup/gobackup/archive"
	"github.com/gobackup/gobackup/compressor"
	"github.com/gobackup/gobackup/config"
	"github.com/gobackup/gobackup/database"
	"github.com/gobackup/gobackup/encryptor"
	"github.com/gobackup/gobackup/helper"
	"github.com/gobackup/gobackup/internal/progress"
	"github.com/gobackup/gobackup/logger"
	"github.com/gobackup/gobackup/metrics"
	"github.com/gobackup/gobackup/notifier"
	"github.com/gobackup/gobackup/runlog"
	"github.com/gobackup/gobackup/splitter"
	"github.com/gobackup/gobackup/storage"
)

// Model class
type Model struct {
	Config config.ModelConfig
}

// Perform model with the default manual trigger
func (m Model) Perform() error {
	return m.PerformWithTrigger("manual")
}

// PerformWithTrigger performs the model and records a detailed per-run log.
// trigger is one of manual, api, cli or schedule and is stored with the run.
//
// 同一时间只允许一个任务操作同一个数据库环境或同一个模型：冲突时直接返回
// 错误（不会生成运行记录），调度器会跳过本次，网页端会提示用户稍后再试。
func (m Model) PerformWithTrigger(trigger string) error {
	handle, err := m.Start(trigger)
	if err != nil {
		return err
	}

	return handle.Run()
}

// runHandle 表示一次已经占用资源、并且已经登记好运行记录的备份。
type runHandle struct {
	model   Model
	trigger string
	run     *runlog.Run

	release func()
	tracker *progressTracker
}

// Start 同步完成「占用资源 + 创建运行记录」两步，因此并发冲突能立刻返回，
// 不会出现「先返回成功、随后在后台失败」的情况。调用方必须保证随后调用
// Run（异步执行时放到 goroutine 里）或 Release。
func (m Model) Start(trigger string) (*runHandle, error) {
	release, bindRun, err := acquireRunLock(m.Config)
	if err != nil {
		return nil, err
	}

	// 运行日志要在下面的 logger 变量遮蔽 logger 包之前挂上。
	run, runErr := runlog.Begin(m.Config, trigger)

	handle := &runHandle{
		model:   m,
		trigger: trigger,
		run:     run,
		release: release,
	}

	if run != nil {
		bindRun(run.ID)
	}
	handle.tracker = newProgressTracker(run, m.stages())
	// 立刻进入「准备」阶段：任务一出现在任务中心就有进度可展示，
	// 不会出现短暂的「进度为空」状态。
	handle.tracker.enter()

	if runErr != nil {
		logger.Tag(fmt.Sprintf("Model: %s", m.Config.Name)).Warnf("Failed to create run log: %v", runErr)
	}

	return handle, nil
}

// Release 释放占用，可以安全地重复调用。
func (h *runHandle) Release() {
	if h == nil {
		return
	}

	if h.release != nil {
		h.release()
		h.release = nil
	}
}

// Run 执行备份流水线并写入结束记录，返回备份错误。
//
// 日志与进度的挂载必须发生在真正执行备份的 goroutine 里：二者都按 goroutine
// 关联（见 logger.AttachRunWriter / internal/progress），异步启动时调用方是在
// 另一个 goroutine 里跑 Run 的，所以不能在 Start 里挂。
func (h *runHandle) Run() (err error) {
	m := h.model
	run := h.run
	tracker := h.tracker
	archivePath := ""

	detachProgress := progress.Attach(tracker)
	detachRun := logger.AttachRunWriter(run)

	// 最先注册、最后执行：等下面的清理与通知都写完之后再落运行记录。
	defer func() {
		detachProgress()
		detachRun()
		runlog.End(run, err, archivePath)
		h.Release()
	}()

	logger := logger.Tag(fmt.Sprintf("Model: %s", m.Config.Name))
	startTime := time.Now()

	// 「准备」阶段已经在 Start 里进入，这里直接执行 before 脚本。
	m.before()

	defer func() {
		duration := time.Since(startTime).Seconds()
		metrics.DuractionSeconds.WithLabelValues(m.Config.Name).Observe(duration)

		if err != nil {
			logger.Error(err)
			notifier.Failure(m.Config, err.Error())
			metrics.TotalAttempts.WithLabelValues(m.Config.Name, "failure").Inc()
			metrics.LastTimestamp.WithLabelValues(m.Config.Name, "failure").Set(float64(time.Now().Unix()))
		} else {
			notifier.Success(m.Config)
			metrics.TotalAttempts.WithLabelValues(m.Config.Name, "success").Inc()
			metrics.LastTimestamp.WithLabelValues(m.Config.Name, "success").Set(float64(time.Now().Unix()))

			// Record backup file size if available
			if archivePath != "" {
				if fi, statErr := os.Stat(archivePath); statErr == nil {
					metrics.FileSizes.WithLabelValues(m.Config.Name).Set(float64(fi.Size()))
				}
			}
		}
	}()

	logger.Info("WorkDir:", m.Config.DumpPath)

	defer func() {
		if r := recover(); r != nil {
			// 把 panic 转成错误：否则命名返回值 err 仍是 nil，运行记录会被写成
			// 「成功」，通知也会误报成功。after() 只跑一次（以前 panic 时会跑两次，
			// after_script 会被执行两遍）。
			logger.Errorf("Recovered from panic: %v", r)
			if err == nil {
				err = fmt.Errorf("执行备份时发生异常: %v", r)
			}
		}

		m.after()
	}()

	if len(m.Config.Databases) > 0 {
		tracker.enter() // 导出数据库
		stopWatch := watchSize(tracker, time.Second, func() int64 { return dirSize(m.Config.DumpPath) })
		err = database.Run(m.Config)
		stopWatch()
		if err != nil {
			return
		}
	}

	if m.Config.Archive != nil {
		tracker.enter() // 打包
		err = archive.Run(m.Config)
		if err != nil {
			return
		}
	}

	if m.Config.CompressWith.Type != "" {
		tracker.enter() // 压缩
		// 归档文件与导出目录都在 TempPath 下，二者之差近似为压缩产出。
		stopWatch := watchSize(tracker, time.Second, func() int64 {
			return clampBytes(dirSize(m.Config.TempPath) - dirSize(m.Config.DumpPath))
		})
		archivePath, err = compressor.Run(m.Config)
		stopWatch()
		if err != nil {
			return
		}
	} else {
		logger.Tag("Compressor").Info("=> Compress | skipped (no compression type specified)")
		archivePath = m.Config.DumpPath
	}

	if m.Config.EncryptWith.Type != "" {
		tracker.enter() // 加密
		archivePath, err = encryptor.Run(archivePath, m.Config)
		if err != nil {
			return
		}
	}

	if m.Config.Splitter != nil {
		tracker.enter() // 分卷
		archivePath, err = splitter.Run(archivePath, m.Config)
		if err != nil {
			return
		}
	}

	tracker.enter() // 上传归档
	err = storage.Run(m.Config, archivePath)
	if err != nil {
		return
	}

	// 归档文件所在的临时目录会在回收阶段被删除，趁现在记下文件信息。
	run.SetArchive(archivePath)

	tracker.enter() // 清理
	tracker.finish()

	return nil
}

func (m Model) before() {
	// Execute before_script
	if len(m.Config.BeforeScript) > 0 {
		logger.Info("Executing before_script...")
		_, err := helper.ExecScriptWithStdio(m.Config.BeforeScript, true)
		if err != nil {
			logger.Error(err)
		}
	}
}

// Cleanup model temp files
func (m Model) after() {
	logger := logger.Tag("Model")

	tempDir := m.Config.TempPath
	if viper.GetBool("useTempWorkDir") {
		tempDir = viper.GetString("workdir")
	}
	logger.Infof("Cleanup temp: %s/", tempDir)
	if err := os.RemoveAll(tempDir); err != nil {
		logger.Errorf("Cleanup temp dir %s error: %v", tempDir, err)
	}

	// Execute after_script
	if len(m.Config.AfterScript) > 0 {
		logger.Info("Executing after_script...")
		_, err := helper.ExecScriptWithStdio(m.Config.AfterScript, true)
		if err != nil {
			logger.Error(err)
		}
	}
}

// GetModelByName get model by name
func GetModelByName(name string) *Model {
	modelConfig := config.GetModelConfigByName(name)
	if modelConfig == nil {
		return nil
	}
	return &Model{
		Config: *modelConfig,
	}
}

// GetModels get models
func GetModels() (models []*Model) {
	for _, modelConfig := range config.Models {
		m := Model{
			Config: modelConfig,
		}
		models = append(models, &m)
	}
	return
}
