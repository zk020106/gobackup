package runlog

import (
	"sort"
	"sync"
)

// live 保存正在进行的运行记录（内存态），用于实时展示任务中心。
//
// 持久化的 JSON 只按秒级节流写入，实时的进度和状态一律以这里为准。
var live = struct {
	sync.RWMutex
	runs map[string]*Run
}{runs: map[string]*Run{}}

func registerLive(run *Run) {
	if run == nil {
		return
	}
	live.Lock()
	defer live.Unlock()
	live.runs[run.ID] = run
}

func unregisterLive(id string) {
	live.Lock()
	defer live.Unlock()
	delete(live.runs, id)
}

// Running 返回所有正在进行的运行记录快照，按开始时间升序。
func Running() []*Run {
	live.RLock()
	defer live.RUnlock()

	runs := make([]*Run, 0, len(live.runs))
	for _, run := range live.runs {
		runs = append(runs, run.Snapshot())
	}
	sort.Slice(runs, func(i, j int) bool {
		return runs[i].StartedAt.Before(runs[j].StartedAt)
	})
	return runs
}

// RunningCount 返回正在进行的任务数量。
func RunningCount() int {
	live.RLock()
	defer live.RUnlock()
	return len(live.runs)
}

// IsActive 判断指定记录是否仍在进行中。任务日志流用它来决定何时结束跟随。
func IsActive(id string) bool {
	live.RLock()
	defer live.RUnlock()
	_, ok := live.runs[id]
	return ok
}

// LiveSnapshot 返回指定记录的实时快照；记录不在进行中时返回 nil。
func LiveSnapshot(id string) *Run {
	live.RLock()
	run, ok := live.runs[id]
	live.RUnlock()
	if !ok {
		return nil
	}
	return run.Snapshot()
}

// ActiveLogSize 返回正在进行的运行日志当前大小；记录已结束时返回 0 和 false。
func ActiveLogSize(id string) (int64, bool) {
	live.RLock()
	run, ok := live.runs[id]
	live.RUnlock()
	if !ok {
		return 0, false
	}

	run.fileMu.Lock()
	defer run.fileMu.Unlock()
	if run.file == nil {
		return 0, true
	}
	if info, err := run.file.Stat(); err == nil {
		return info.Size(), true
	}
	return 0, true
}
