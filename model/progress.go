package model

import (
	"io/fs"
	"math"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/dustin/go-humanize"

	"github.com/gobackup/gobackup/config"
	"github.com/gobackup/gobackup/runlog"
)

// 备份流程被拆成若干阶段，每个阶段带一个权重（合计 100），整体进度 =
// 已完成阶段权重 + 当前阶段完成度 × 当前阶段权重。没有配置的阶段会被跳过，
// 此时按实际参与阶段的总权重归一化，保证进度条最终能走到 100%。
type stage struct {
	name   string
	weight float64
	detail string
}

// stages 根据模型配置推导出本次备份会经过的阶段。
//
// detail 是阶段说明，界面上的展示形式是「阶段 · 说明」，所以说明里不要再重复
// 阶段名；只有导出阶段需要指出具体是哪些数据库。
func (m Model) stages() []stage {
	stages := []stage{{name: "准备", weight: 2, detail: "初始化运行环境"}}

	if len(m.Config.Databases) > 0 {
		stages = append(stages, stage{name: "导出数据库", weight: 45, detail: databaseSummary(m.Config)})
	}
	if m.Config.Archive != nil {
		stages = append(stages, stage{name: "打包文件", weight: 4})
	}
	if m.Config.CompressWith.Type != "" {
		stages = append(stages, stage{name: "压缩", weight: 16})
	}
	if m.Config.EncryptWith.Type != "" {
		stages = append(stages, stage{name: "加密", weight: 2})
	}
	if m.Config.Splitter != nil {
		stages = append(stages, stage{name: "分卷", weight: 1})
	}

	stages = append(stages,
		stage{name: "上传归档", weight: 29},
		stage{name: "清理", weight: 1},
	)

	return stages
}

// databaseSummary 汇总模型下的数据库，例如 "mysql/venus, postgresql/report"。
func databaseSummary(mc config.ModelConfig) string {
	if len(mc.Databases) == 0 {
		return ""
	}

	names := make([]string, 0, len(mc.Databases))
	for _, db := range mc.Databases {
		name := db.Name
		if db.Type != "" && !strings.HasPrefix(name, db.Type+"/") {
			name = db.Type + "/" + name
		}
		names = append(names, name)
	}
	sort.Strings(names)

	return strings.Join(names, ", ")
}

// progressTracker 把流水线阶段换算成百分比，并实现 internal/progress.Sink，
// 让 helper / storage 等包可以在不知道任务上下文的情况下上报字节进度。
type progressTracker struct {
	run   *runlog.Run
	total float64

	mu           sync.Mutex
	stages       []stage
	index        int
	completed    float64
	phaseStarted time.Time
	bytesDone    int64
	bytesTotal   int64
	detail       string
}

func newProgressTracker(run *runlog.Run, stages []stage) *progressTracker {
	tracker := &progressTracker{
		run:    run,
		stages: stages,
		index:  -1,
	}
	for _, item := range stages {
		tracker.total += item.weight
	}
	if tracker.total <= 0 {
		tracker.total = 1
	}
	return tracker
}

// enter 进入下一个阶段。
func (t *progressTracker) enter() {
	if t == nil {
		return
	}

	t.mu.Lock()
	if t.index >= 0 && t.index < len(t.stages) {
		t.completed += t.stages[t.index].weight
	}
	t.index++
	if t.index >= len(t.stages) {
		t.mu.Unlock()
		return
	}
	current := t.stages[t.index]
	t.phaseStarted = time.Now()
	t.bytesDone, t.bytesTotal = 0, 0
	t.detail = current.detail
	t.mu.Unlock()

	t.flush()
}

// setDetail 更新当前阶段的说明文字。
func (t *progressTracker) setDetail(detail string) {
	if t == nil {
		return
	}

	t.mu.Lock()
	t.detail = detail
	t.mu.Unlock()

	t.flush()
}

// ReportBytes 接收字节进度（实现 internal/progress.Sink）。total 为 0 表示
// 总量未知，此时界面展示为不确定进度 + 已处理字节数。
func (t *progressTracker) ReportBytes(done, total int64) {
	if t == nil {
		return
	}

	t.mu.Lock()
	t.bytesDone = done
	if total > 0 {
		t.bytesTotal = total
	}
	t.mu.Unlock()

	t.flush()
}

// finish 把进度推到 100%。
func (t *progressTracker) finish() {
	if t == nil || t.run == nil {
		return
	}

	t.run.Report(runlog.ProgressUpdate{
		Phase:        "已完成",
		Detail:       "备份完成",
		Percent:      100,
		PhasePercent: 100,
	})
}

// flush 计算当前进度并上报。
func (t *progressTracker) flush() {
	if t == nil || t.run == nil {
		return
	}

	t.mu.Lock()
	if t.index < 0 || t.index >= len(t.stages) {
		t.mu.Unlock()
		return
	}

	current := t.stages[t.index]
	phasePercent, indeterminate := t.phasePercentLocked()
	percent := (t.completed + current.weight*phasePercent/100) / t.total * 100

	detail := t.detail
	// 总量未知的阶段（导出、压缩等）把已处理字节数写进说明里；
	// 上传阶段总量已知，界面会自己显示「已完成 / 总量」，这里不重复。
	if t.bytesTotal == 0 && t.bytesDone > 0 {
		detail = joinDetail(detail, humanize.Bytes(uint64(t.bytesDone)))
	}

	update := runlog.ProgressUpdate{
		Phase:         current.name,
		Detail:        detail,
		Percent:       percent,
		PhasePercent:  phasePercent,
		Indeterminate: indeterminate,
		BytesDone:     t.bytesDone,
		BytesTotal:    t.bytesTotal,
	}
	t.mu.Unlock()

	t.run.Report(update)
}

// phasePercentLocked 计算当前阶段的完成度。调用方必须持有 t.mu。
func (t *progressTracker) phasePercentLocked() (float64, bool) {
	if t.bytesTotal > 0 {
		percent := float64(t.bytesDone) / float64(t.bytesTotal) * 100
		return clamp(percent, 0, 100), false
	}

	// 总量未知（数据库导出、压缩等）：按时间缓慢爬升，最多到 95%，
	// 阶段真正结束时由 enter() 一次性补齐，避免进度条卡在 100% 不动。
	elapsed := time.Since(t.phaseStarted).Seconds()
	percent := 95 * (1 - math.Exp(-elapsed/25))
	return clamp(percent, 0, 95), true
}

func clamp(value, min, max float64) float64 {
	switch {
	case value < min:
		return min
	case value > max:
		return max
	default:
		return value
	}
}

// joinDetail 用「 · 」拼接阶段说明，空片段会被忽略。
func joinDetail(parts ...string) string {
	kept := make([]string, 0, len(parts))
	for _, part := range parts {
		if strings.TrimSpace(part) != "" {
			kept = append(kept, part)
		}
	}
	return strings.Join(kept, " · ")
}

// watchSize 周期性把 size() 的结果作为字节进度上报，返回停止函数。
//
// 回调耗时较长时会自动拉长间隔，避免在大目录上反复遍历拖慢备份本身。
func watchSize(tracker *progressTracker, interval time.Duration, size func() int64) func() {
	done := make(chan struct{})
	var once sync.Once

	go func() {
		for {
			start := time.Now()
			value := size()
			tracker.ReportBytes(value, 0)

			wait := interval
			if elapsed := time.Since(start); elapsed*3 > wait {
				wait = elapsed * 3
			}

			select {
			case <-done:
				return
			case <-time.After(wait):
			}
		}
	}()

	return func() { once.Do(func() { close(done) }) }
}

// dirSize 统计目录下所有文件的总大小，出错的部分按 0 处理。
func dirSize(root string) int64 {
	var total int64
	_ = filepath.WalkDir(root, func(_ string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return nil
		}
		if info, statErr := entry.Info(); statErr == nil {
			total += info.Size()
		}
		return nil
	})
	return total
}
