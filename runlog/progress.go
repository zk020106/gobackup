package runlog

import (
	"time"
)

// 进度持久化的节流间隔：运行中的任务在内存里实时更新，落盘则按此间隔节流，
// 避免每个字节都写一次 JSON。
const progressPersistInterval = time.Second

// Progress 是一次备份对外的实时进度快照。
type Progress struct {
	// Phase 当前阶段名，例如「导出数据库」。
	Phase string `json:"phase,omitempty"`
	// Detail 当前阶段的补充说明，例如「已导出 1.2 GB」。
	Detail string `json:"detail,omitempty"`
	// Percent 整体进度 0-100。
	Percent float64 `json:"percent"`
	// PhasePercent 当前阶段进度 0-100。
	PhasePercent float64 `json:"phase_percent"`
	// Indeterminate 为 true 时表示当前阶段总量未知（例如导出数据库），
	// 界面应展示为不确定进度。
	Indeterminate bool `json:"indeterminate,omitempty"`
	// BytesDone / BytesTotal 当前阶段的字节进度，用于展示传输量。
	BytesDone  int64 `json:"bytes_done,omitempty"`
	BytesTotal int64 `json:"bytes_total,omitempty"`
	// UpdatedAt 最后一次进度更新时间。
	UpdatedAt time.Time `json:"updated_at"`
}

// ProgressUpdate 是上报给 Run 的进度内容。
type ProgressUpdate struct {
	Phase         string
	Detail        string
	Percent       float64
	PhasePercent  float64
	Indeterminate bool
	BytesDone     int64
	BytesTotal    int64
}

// Report 更新运行进度。进度在内存里实时生效，落盘按 progressPersistInterval
// 节流；阶段变化会立即落盘，保证刷新页面后仍能看到大致位置。
//
// 锁顺序固定为 mu -> progressMu，其他位置不得反向获取。
func (run *Run) Report(update ProgressUpdate) {
	if run == nil {
		return
	}

	mu.Lock()
	defer mu.Unlock()

	run.progressMu.Lock()
	previous := run.Progress
	phaseChanged := previous == nil || previous.Phase != update.Phase
	now := time.Now()

	run.Progress = &Progress{
		Phase:         update.Phase,
		Detail:        update.Detail,
		Percent:       clampPercent(update.Percent),
		PhasePercent:  clampPercent(update.PhasePercent),
		Indeterminate: update.Indeterminate,
		BytesDone:     update.BytesDone,
		BytesTotal:    update.BytesTotal,
		UpdatedAt:     now,
	}

	shouldPersist := phaseChanged || now.Sub(run.lastPersist) >= progressPersistInterval
	if shouldPersist {
		run.lastPersist = now
	}
	run.progressMu.Unlock()

	if shouldPersist {
		_ = writeMetaLocked(run)
	}
}

// finishProgress 写入结束时的最终进度。
//
// 成功时进度补到 100%；失败时保留失败前的位置，只把阶段改成「已失败」——
// 否则一条失败的备份会显示成满格的「已完成」，比成功的备份还好看。
func (run *Run) finishProgress() {
	if run == nil {
		return
	}

	phase := "已完成"
	detail := "备份成功"
	percent, phasePercent := 100.0, 100.0

	if run.Status == StatusFailure {
		phase = "已失败"
		detail = "备份失败"
		if run.Error != "" {
			detail = "备份失败：" + run.Error
		}
		if run.Progress != nil {
			percent = run.Progress.Percent
			phasePercent = run.Progress.PhasePercent
		}
	}

	run.progressMu.Lock()
	run.Progress = &Progress{
		Phase:        phase,
		Detail:       detail,
		Percent:      percent,
		PhasePercent: phasePercent,
		UpdatedAt:    time.Now(),
	}
	run.progressMu.Unlock()
}

// ProgressSnapshot 返回当前进度的副本，供 API 实时展示。
func (run *Run) ProgressSnapshot() *Progress {
	if run == nil {
		return nil
	}
	run.progressMu.Lock()
	defer run.progressMu.Unlock()

	if run.Progress == nil {
		return nil
	}
	snapshot := *run.Progress
	return &snapshot
}

// Snapshot 返回运行记录的副本（含内存中的实时进度），可直接序列化为 JSON。
func (run *Run) Snapshot() *Run {
	if run == nil {
		return nil
	}

	run.progressMu.Lock()
	var progress *Progress
	if run.Progress != nil {
		copied := *run.Progress
		progress = &copied
	}
	run.progressMu.Unlock()

	run.fileMu.Lock()
	closed := run.closed
	run.fileMu.Unlock()

	// 逐字段复制而不是整体赋值：Run 里带有互斥锁，整体复制会触发 vet 告警，
	// 也容易把内部句柄一起带出去。
	return &Run{
		ID:          run.ID,
		Model:       run.Model,
		Description: run.Description,
		Trigger:     run.Trigger,
		Status:      run.Status,
		StartedAt:   run.StartedAt,
		FinishedAt:  run.FinishedAt,
		DurationMS:  run.DurationMS,
		Error:       run.Error,
		Databases:   run.Databases,
		Storages:    run.Storages,
		ArchiveName: run.ArchiveName,
		ArchiveSize: run.ArchiveSize,
		LogSize:     run.LogSize,
		Progress:    progress,
		Running:     run.Running,
		closed:      closed,
	}
}

func clampPercent(value float64) float64 {
	switch {
	case value < 0:
		return 0
	case value > 100:
		return 100
	default:
		return value
	}
}
