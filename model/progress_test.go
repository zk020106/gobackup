package model

import (
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/spf13/viper"

	"github.com/gobackup/gobackup/config"
	"github.com/gobackup/gobackup/runlog"
)

// newStageModel 按配置片段构造模型，用来推导备份阶段。
func newStageModel(setup func(*config.ModelConfig)) Model {
	model := config.ModelConfig{Name: "stage-model"}
	if setup != nil {
		setup(&model)
	}
	return Model{Config: model}
}

// sampleDatabases 返回一份 mysql 数据库配置，供多个用例共用。
func sampleDatabases() map[string]config.SubConfig {
	settings := viper.New()
	settings.Set("host", "127.0.0.1")
	settings.Set("port", 3306)
	settings.Set("database", "venus")

	return map[string]config.SubConfig{
		"venus": {Name: "venus", Type: "mysql", Viper: settings},
	}
}

// fullStageModel 返回包含所有阶段的模型。
func fullStageModel() Model {
	return newStageModel(func(model *config.ModelConfig) {
		model.Databases = sampleDatabases()
		model.Archive = viper.New()
		model.CompressWith = config.SubConfig{Type: "tgz"}
		model.EncryptWith = config.SubConfig{Type: "openssl"}
		model.Splitter = viper.New()
	})
}

// newProgressRun 创建一条运行记录，测试结束时恢复默认目录。
func newProgressRun(t *testing.T) *runlog.Run {
	t.Helper()

	runlog.SetDir(t.TempDir())
	t.Cleanup(func() { runlog.SetDir("") })

	run, err := runlog.Begin(config.ModelConfig{Name: "progress-test"}, "api")
	if err != nil {
		t.Fatal(err)
	}
	return run
}

func TestStagesFollowModelConfig(t *testing.T) {
	tests := []struct {
		name  string
		model Model
		want  []string
	}{
		{
			name: "仅压缩",
			model: newStageModel(func(model *config.ModelConfig) {
				model.CompressWith = config.SubConfig{Type: "tar"}
			}),
			want: []string{"准备", "压缩", "上传归档", "清理"},
		},
		{
			name: "数据库与压缩",
			model: newStageModel(func(model *config.ModelConfig) {
				model.Databases = sampleDatabases()
				model.CompressWith = config.SubConfig{Type: "tgz"}
			}),
			want: []string{"准备", "导出数据库", "压缩", "上传归档", "清理"},
		},
		{
			name:  "全部阶段",
			model: fullStageModel(),
			want:  []string{"准备", "导出数据库", "打包文件", "压缩", "加密", "分卷", "上传归档", "清理"},
		},
		{
			name: "归档与加密",
			model: newStageModel(func(model *config.ModelConfig) {
				model.Archive = viper.New()
				model.EncryptWith = config.SubConfig{Type: "openssl"}
			}),
			want: []string{"准备", "打包文件", "加密", "上传归档", "清理"},
		},
		{
			name: "仅分卷",
			model: newStageModel(func(model *config.ModelConfig) {
				model.Splitter = viper.New()
			}),
			want: []string{"准备", "分卷", "上传归档", "清理"},
		},
		{
			name:  "空配置",
			model: newStageModel(nil),
			want:  []string{"准备", "上传归档", "清理"},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			stages := test.model.stages()
			if len(stages) != len(test.want) {
				t.Fatalf("stages = %+v, want %v", stages, test.want)
			}

			var total float64
			for index, item := range stages {
				if item.name != test.want[index] {
					t.Fatalf("stage %d = %q, want %q", index, item.name, test.want[index])
				}
				if item.weight <= 0 {
					t.Fatalf("stage %q weight = %v, want > 0", item.name, item.weight)
				}
				// detail 是可选的（界面展示形式是「阶段 · 说明」，没有说明时
				// 只显示阶段名），但一旦有内容就不该再重复阶段名。
				if strings.Contains(item.detail, item.name) {
					t.Fatalf("stage %q detail %q repeats the stage name", item.name, item.detail)
				}
				total += item.weight
			}

			if total <= 0 || total > 100 {
				t.Fatalf("total weight = %v, want within (0, 100]", total)
			}
		})
	}
}

func TestStagesWeightIsNormalizedToHundred(t *testing.T) {
	// 满配模型的所有阶段权重之和应为 100，进度条才能走到头。
	var total float64
	for _, item := range fullStageModel().stages() {
		total += item.weight
	}
	if total != 100 {
		t.Fatalf("full model total weight = %v, want 100", total)
	}

	// 子集阶段同样只按各阶段权重归一化，由 tracker 负责换算。
	tracker := newProgressTracker(nil, fullStageModel().stages())
	if tracker.total != total {
		t.Fatalf("tracker total = %v, want %v", tracker.total, total)
	}
	if empty := newProgressTracker(nil, nil); empty.total != 1 {
		t.Fatalf("tracker without stages total = %v, want 1", empty.total)
	}
}

func TestProgressTrackerEnterAdvancesStages(t *testing.T) {
	stages := fullStageModel().stages()

	// run 为 nil 时也不允许 panic，只是不上报。
	var run *runlog.Run
	tracker := newProgressTracker(run, stages)

	if tracker.index != -1 {
		t.Fatalf("initial index = %d, want -1", tracker.index)
	}
	if tracker.completed != 0 {
		t.Fatalf("initial completed = %v, want 0", tracker.completed)
	}

	var completed float64
	for index := range stages {
		tracker.enter()
		if tracker.index != index {
			t.Fatalf("index after enter %d = %d", index, tracker.index)
		}
		if tracker.detail != stages[index].detail {
			t.Fatalf("detail = %q, want %q", tracker.detail, stages[index].detail)
		}
		if tracker.completed != completed {
			t.Fatalf("completed before stage %d = %v, want %v", index, tracker.completed, completed)
		}
		completed += stages[index].weight
	}

	// 进入最后一个阶段后它本身还没结束，因此已完成权重不含它的权重；
	// 收尾由 finish() 负责补到 100%。
	last := stages[len(stages)-1]
	if tracker.completed != completed-last.weight {
		t.Fatalf("completed after all stages = %v, want %v", tracker.completed, completed-last.weight)
	}

	// 超出末尾继续 enter 不应 panic，也不应重复累加权重。
	tracker.enter()
	tracker.enter()
	if tracker.completed != completed {
		t.Fatalf("completed after extra enter = %v, want %v", tracker.completed, completed)
	}

	// 没有任何阶段的 tracker 也不应 panic。
	empty := newProgressTracker(run, nil)
	empty.enter()
	empty.ReportBytes(10, 100)
	empty.setDetail("detail")
	empty.finish()
}

func TestProgressTrackerEnterReportsProgress(t *testing.T) {
	run := newProgressRun(t)
	defer runlog.End(run, nil, "")

	stages := newStageModel(func(model *config.ModelConfig) {
		model.Databases = sampleDatabases()
		model.CompressWith = config.SubConfig{Type: "tgz"}
	}).stages()
	tracker := newProgressTracker(run, stages)

	var previous float64
	for index := range stages {
		tracker.enter()

		progress := run.ProgressSnapshot()
		if progress == nil {
			t.Fatalf("no progress was reported after entering stage %d", index)
		}
		if progress.Phase != stages[index].name {
			t.Fatalf("phase = %q, want %q", progress.Phase, stages[index].name)
		}
		if progress.Percent < previous {
			t.Fatalf("percent went down on entering %q: %v -> %v", progress.Phase, previous, progress.Percent)
		}
		if progress.Percent < 0 || progress.Percent > 100 {
			t.Fatalf("percent = %v, want within 0..100", progress.Percent)
		}
		previous = progress.Percent
	}

	// 最后一个阶段刚开始时，已完成的权重是除它以外的全部权重。
	last := stages[len(stages)-1]
	expected := (tracker.total - last.weight) / tracker.total * 100
	if previous != expected {
		t.Fatalf("percent after the last stage started = %v, want %v", previous, expected)
	}
	if tracker.completed != tracker.total-last.weight {
		t.Fatalf("completed = %v, want %v", tracker.completed, tracker.total-last.weight)
	}

	// 收尾时把进度补到 100%。
	tracker.finish()
	if progress := run.ProgressSnapshot(); progress.Percent != 100 {
		t.Fatalf("percent after finish = %v, want 100", progress.Percent)
	}
}

func TestProgressTrackerReportBytesIsDeterminateAndMonotonic(t *testing.T) {
	run := newProgressRun(t)
	defer runlog.End(run, nil, "")

	stages := newStageModel(func(model *config.ModelConfig) {
		model.Databases = sampleDatabases()
		model.CompressWith = config.SubConfig{Type: "tgz"}
	}).stages()
	tracker := newProgressTracker(run, stages)

	tracker.enter() // 准备
	tracker.enter() // 导出数据库

	// 总量已知时进度是确定的，且随字节数单调不减。
	var previous float64
	for _, done := range []int64{0, 100, 250, 500, 999, 1000, 1000, 5000} {
		tracker.ReportBytes(done, 1000)
		percent := tracker.percent()
		if percent < previous {
			t.Fatalf("percent went down: %v -> %v (done=%d)", previous, percent, done)
		}
		if percent < 0 || percent > 100 {
			t.Fatalf("percent = %v, want within 0..100 (done=%d)", percent, done)
		}
		previous = percent
	}

	// 500/1000 归一化到「导出数据库」阶段的 50%。
	tracker.ReportBytes(500, 1000)
	phasePercent := tracker.phasePercentForTest()
	if phasePercent != 50 {
		t.Fatalf("phase percent = %v, want 50", phasePercent)
	}

	// 也体现在上报给 run 的快照里。
	progress := run.ProgressSnapshot()
	if progress == nil {
		t.Fatal("ProgressSnapshot() = nil")
	}
	if progress.Indeterminate {
		t.Fatal("Indeterminate = true for a determinate phase")
	}
	if progress.BytesDone != 500 || progress.BytesTotal != 1000 {
		t.Fatalf("bytes = %d / %d, want 500 / 1000", progress.BytesDone, progress.BytesTotal)
	}
	if progress.Phase != "导出数据库" || progress.PhasePercent != 50 {
		t.Fatalf("progress = %+v", progress)
	}

	// 进入下一阶段后整体进度只会前进。
	before := tracker.percent()
	tracker.enter() // 压缩
	if after := tracker.percent(); after < before {
		t.Fatalf("percent went down after entering the next stage: %v -> %v", before, after)
	}
}

func TestProgressTrackerUnknownTotalIsIndeterminate(t *testing.T) {
	run := newProgressRun(t)
	defer runlog.End(run, nil, "")

	tracker := newProgressTracker(run, newStageModel(nil).stages())
	tracker.enter()

	tracker.ReportBytes(4096, 0)
	progress := run.ProgressSnapshot()
	if progress == nil {
		t.Fatal("ProgressSnapshot() = nil")
	}
	if !progress.Indeterminate {
		t.Fatal("Indeterminate = false when the total is unknown")
	}
	if progress.BytesDone != 4096 || progress.BytesTotal != 0 {
		t.Fatalf("bytes = %d / %d, want 4096 / 0", progress.BytesDone, progress.BytesTotal)
	}

	// 总量未知时按时间爬升，但被限制在阶段权重的 95% 以内。
	if percent := tracker.percent(); percent < 0 || percent > tracker.total {
		t.Fatalf("percent = %v, want within 0..%v", percent, tracker.total)
	}

	// 后续上报已知总量后应切换为确定进度。
	tracker.ReportBytes(2048, 4096)
	progress = run.ProgressSnapshot()
	if progress.Indeterminate {
		t.Fatal("Indeterminate = true after a total was reported")
	}
	if progress.PhasePercent != 50 {
		t.Fatalf("phase percent = %v, want 50", progress.PhasePercent)
	}

	// 之后再用 total=0 上报只更新已处理字节数，不应清掉已知总量。
	tracker.ReportBytes(1024, 0)
	progress = run.ProgressSnapshot()
	if progress.BytesTotal != 4096 || progress.BytesDone != 1024 {
		t.Fatalf("bytes = %d / %d, want 1024 / 4096", progress.BytesDone, progress.BytesTotal)
	}
}

func TestProgressTrackerFinishReportsHundred(t *testing.T) {
	run := newProgressRun(t)
	defer runlog.End(run, nil, "")

	stages := newStageModel(nil).stages()
	tracker := newProgressTracker(run, stages)

	tracker.enter() // 准备
	tracker.ReportBytes(10, 0)
	tracker.finish()

	progress := run.ProgressSnapshot()
	if progress == nil {
		t.Fatal("ProgressSnapshot() = nil")
	}
	if progress.Phase != "已完成" || progress.Percent != 100 || progress.PhasePercent != 100 {
		t.Fatalf("finish progress = %+v", progress)
	}

	// 尚未开始任何阶段时 finish 也应直接到 100%。
	newProgressTracker(run, stages).finish()
	if progress := run.ProgressSnapshot(); progress.Percent != 100 {
		t.Fatalf("finish before any stage = %+v", progress)
	}

	// run 为 nil 时 finish 是空操作。
	var nilRun *runlog.Run
	newProgressTracker(nilRun, stages).finish()
}

// percent 在锁内模拟 flush 的整体进度计算（不上报）。
func (t *progressTracker) percent() float64 {
	t.mu.Lock()
	defer t.mu.Unlock()

	if t.index < 0 || t.index >= len(t.stages) {
		return 0
	}
	current := t.stages[t.index]
	phasePercent, _ := t.phasePercentLocked()
	return (t.completed + current.weight*phasePercent/100) / t.total * 100
}

// phasePercentForTest 在锁内取当前阶段完成度。
func (t *progressTracker) phasePercentForTest() float64 {
	t.mu.Lock()
	defer t.mu.Unlock()

	percent, _ := t.phasePercentLocked()
	return percent
}

func TestDirSize(t *testing.T) {
	dir := t.TempDir()
	nested := filepath.Join(dir, "nested")
	if err := os.MkdirAll(nested, 0o755); err != nil {
		t.Fatal(err)
	}

	files := map[string]int{
		filepath.Join(dir, "a.bin"):      1024,
		filepath.Join(dir, "b.bin"):      7,
		filepath.Join(nested, "c.bin"):   2048,
		filepath.Join(nested, "d.empty"): 0,
	}
	var want int64
	for path, size := range files {
		if err := os.WriteFile(path, make([]byte, size), 0o644); err != nil {
			t.Fatal(err)
		}
		want += int64(size)
	}

	if got := dirSize(dir); got != want {
		t.Fatalf("dirSize = %d, want %d", got, want)
	}

	// 空目录与不存在的目录都返回 0，不能 panic。
	if got := dirSize(t.TempDir()); got != 0 {
		t.Fatalf("dirSize(empty) = %d, want 0", got)
	}
	if got := dirSize(filepath.Join(dir, "missing", "deeper")); got != 0 {
		t.Fatalf("dirSize(missing) = %d, want 0", got)
	}
}

func TestWatchSizeReportsAndStops(t *testing.T) {
	var run *runlog.Run
	tracker := newProgressTracker(run, newStageModel(nil).stages())
	tracker.enter()

	var calls atomic.Int64
	size := func() int64 {
		if calls.Add(1) >= 2 {
			return 5
		}
		return 3
	}

	stop := watchSize(tracker, 5*time.Millisecond, size)

	// 轮询等待上报，最多 1s；上报值必须来自 size()。
	if value := waitForReport(t, tracker, func(done int64) bool { return done > 0 }); value != 3 && value != 5 {
		t.Fatalf("reported size = %d, want the size function's value", value)
	}
	if value := waitForReport(t, tracker, func(done int64) bool { return done == 5 }); value != 5 {
		t.Fatalf("reported size = %d, want the updated value 5", value)
	}

	// 停止必须很快返回（不会等待下一次 tick），并且可重复调用。
	start := time.Now()
	stop()
	stop()
	if elapsed := time.Since(start); elapsed > 500*time.Millisecond {
		t.Fatalf("stop took %v, want a prompt return", elapsed)
	}

	tracker.mu.Lock()
	before := tracker.bytesDone
	bytesTotal := tracker.bytesTotal
	tracker.mu.Unlock()

	// 停止后不再有新的上报（期间会有多次 tick 的机会）。
	time.Sleep(30 * time.Millisecond)

	tracker.mu.Lock()
	after := tracker.bytesDone
	tracker.mu.Unlock()

	if after != before {
		t.Fatalf("watchSize kept reporting after stop: %d -> %d", before, after)
	}
	if bytesTotal != 0 {
		t.Fatalf("bytesTotal = %d, want 0 (unknown total)", bytesTotal)
	}
}

// waitForReport 轮询等待 tracker 上报满足条件的字节数，最多 1s。
func waitForReport(t *testing.T, tracker *progressTracker, ready func(int64) bool) int64 {
	t.Helper()

	deadline := time.Now().Add(time.Second)
	for {
		tracker.mu.Lock()
		done := tracker.bytesDone
		tracker.mu.Unlock()

		if ready(done) {
			return done
		}
		if time.Now().After(deadline) {
			t.Fatalf("watchSize did not report a matching size within 1s, last value %d", done)
		}
		time.Sleep(2 * time.Millisecond)
	}
}
