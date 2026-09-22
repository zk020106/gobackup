package runlog

import (
	"errors"
	"testing"
)

// errTestFailure 用于验证失败记录的结束进度说明。
var errTestFailure = errors.New("mysqldump failed")

// newProgressRun 创建一条运行记录，测试结束时恢复默认目录。
func newProgressRun(t *testing.T) *Run {
	t.Helper()

	SetDir(t.TempDir())
	t.Cleanup(func() { SetDir("") })

	run, err := Begin(testModel(), "api")
	if err != nil {
		t.Fatal(err)
	}
	return run
}

func TestReportStoresProgressAndClampsPercent(t *testing.T) {
	run := newProgressRun(t)
	defer End(run, nil, "")

	run.Report(ProgressUpdate{
		Phase:         "导出数据库",
		Detail:        "正在导出",
		Percent:       42.5,
		PhasePercent:  80,
		Indeterminate: true,
		BytesDone:     1024,
		BytesTotal:    2048,
	})

	snapshot := run.ProgressSnapshot()
	if snapshot == nil {
		t.Fatal("ProgressSnapshot() = nil, want the reported progress")
	}
	if snapshot.Phase != "导出数据库" || snapshot.Detail != "正在导出" {
		t.Fatalf("unexpected progress: %+v", snapshot)
	}
	if snapshot.Percent != 42.5 || snapshot.PhasePercent != 80 {
		t.Fatalf("percent = %v / %v, want 42.5 / 80", snapshot.Percent, snapshot.PhasePercent)
	}
	if !snapshot.Indeterminate {
		t.Fatal("Indeterminate = false, want true")
	}
	if snapshot.BytesDone != 1024 || snapshot.BytesTotal != 2048 {
		t.Fatalf("bytes = %d / %d, want 1024 / 2048", snapshot.BytesDone, snapshot.BytesTotal)
	}
	if snapshot.UpdatedAt.IsZero() {
		t.Fatal("UpdatedAt is zero")
	}

	// 越界百分比要被夹到 0..100。
	run.Report(ProgressUpdate{Phase: "压缩", Percent: 150, PhasePercent: -20})
	snapshot = run.ProgressSnapshot()
	if snapshot.Percent != 100 {
		t.Fatalf("percent = %v, want 100", snapshot.Percent)
	}
	if snapshot.PhasePercent != 0 {
		t.Fatalf("phase percent = %v, want 0", snapshot.PhasePercent)
	}

	run.Report(ProgressUpdate{Phase: "压缩", Percent: -5, PhasePercent: 120.25})
	snapshot = run.ProgressSnapshot()
	if snapshot.Percent != 0 || snapshot.PhasePercent != 100 {
		t.Fatalf("clamped progress = %+v, want 0 / 100", snapshot)
	}
}

func TestProgressSnapshotReturnsCopy(t *testing.T) {
	run := newProgressRun(t)
	defer End(run, nil, "")

	run.Report(ProgressUpdate{Phase: "上传归档", Detail: "正在上传", Percent: 60, BytesDone: 10})

	first := run.ProgressSnapshot()
	if first == nil {
		t.Fatal("ProgressSnapshot() = nil")
	}
	first.Phase = "被改写"
	first.Percent = 1
	first.Detail = "被改写"
	first.BytesDone = 999

	second := run.ProgressSnapshot()
	if second == nil {
		t.Fatal("ProgressSnapshot() = nil on second call")
	}
	if second.Phase != "上传归档" || second.Percent != 60 || second.Detail != "正在上传" || second.BytesDone != 10 {
		t.Fatalf("mutating the snapshot changed the run: %+v", second)
	}

	// 两次调用返回的是不同的指针。
	if first == second {
		t.Fatal("ProgressSnapshot() returned the same pointer twice")
	}
}

func TestReportOnNilRunDoesNotPanic(t *testing.T) {
	var run *Run

	run.Report(ProgressUpdate{Phase: "准备", Percent: 10})

	if snapshot := run.ProgressSnapshot(); snapshot != nil {
		t.Fatalf("ProgressSnapshot() on nil run = %+v, want nil", snapshot)
	}
	if snapshot := run.Snapshot(); snapshot != nil {
		t.Fatalf("Snapshot() on nil run = %+v, want nil", snapshot)
	}

	// 结束流程在 nil 记录上也必须是空操作。
	End(run, nil, "")
	run.SetArchive("")
	run.finishProgress()

	if _, err := run.Write([]byte("ignored")); err != nil {
		t.Fatalf("Write on nil run error = %v, want nil", err)
	}
}

func TestSnapshotCopiesAllExportedFields(t *testing.T) {
	run := newProgressRun(t)
	defer End(run, nil, "")

	if _, err := run.Write([]byte("snapshot test\n")); err != nil {
		t.Fatal(err)
	}
	run.Report(ProgressUpdate{Phase: "清理", Detail: "正在清理", Percent: 99, BytesTotal: 7})
	run.ArchiveName = "venus.tar.gz"
	run.ArchiveSize = 1234
	run.Error = "boom"

	snapshot := run.Snapshot()
	if snapshot == nil {
		t.Fatal("Snapshot() = nil")
	}

	if snapshot.ID != run.ID || snapshot.Model != run.Model || snapshot.Description != run.Description {
		t.Fatalf("identity not copied: %+v", snapshot)
	}
	if snapshot.Trigger != "api" || snapshot.Status != StatusRunning {
		t.Fatalf("trigger/status not copied: %+v", snapshot)
	}
	if !snapshot.StartedAt.Equal(run.StartedAt) {
		t.Fatalf("StartedAt = %v, want %v", snapshot.StartedAt, run.StartedAt)
	}
	if snapshot.FinishedAt != run.FinishedAt || snapshot.DurationMS != run.DurationMS {
		t.Fatalf("finish info not copied: %+v", snapshot)
	}
	if snapshot.Error != "boom" || snapshot.ArchiveName != "venus.tar.gz" || snapshot.ArchiveSize != 1234 {
		t.Fatalf("archive info not copied: %+v", snapshot)
	}
	if len(snapshot.Databases) != len(run.Databases) || len(snapshot.Storages) != len(run.Storages) {
		t.Fatalf("providers not copied: %+v", snapshot)
	}
	if !snapshot.Running {
		t.Fatal("Running = false, want true for a live run")
	}
	if snapshot.Progress == nil {
		t.Fatal("Progress was not copied")
	}
	if snapshot.Progress.Phase != "清理" || snapshot.Progress.Percent != 99 || snapshot.Progress.BytesTotal != 7 {
		t.Fatalf("progress not copied: %+v", snapshot.Progress)
	}

	// 快照与运行记录解耦：改动快照不影响原记录。
	snapshot.Progress.Percent = 1
	snapshot.Running = false
	snapshot.Status = StatusFailure
	if current := run.ProgressSnapshot(); current.Percent != 99 {
		t.Fatalf("run progress was mutated through the snapshot: %+v", current)
	}
	if !run.Running || run.Status != StatusRunning {
		t.Fatalf("run was mutated through the snapshot: %+v", run)
	}
}

func TestFinishProgressMarksComplete(t *testing.T) {
	run := newProgressRun(t)

	run.Report(ProgressUpdate{Phase: "上传归档", Percent: 50})
	run.finishProgress()

	progress := run.ProgressSnapshot()
	if progress == nil {
		t.Fatal("ProgressSnapshot() = nil")
	}
	if progress.Phase != "已完成" || progress.Percent != 100 || progress.PhasePercent != 100 {
		t.Fatalf("finish progress = %+v", progress)
	}
	if progress.Detail != "备份成功" {
		t.Fatalf("detail = %q, want 备份成功", progress.Detail)
	}

	// 结束时会写入记录，成功和失败的说明文字不同。
	End(run, nil, "")
	stored, err := Get(run.ID)
	if err != nil {
		t.Fatal(err)
	}
	if stored.Progress == nil || stored.Progress.Percent != 100 || stored.Progress.Detail != "备份成功" {
		t.Fatalf("stored progress = %+v", stored.Progress)
	}
	if stored.Running {
		t.Fatal("stored run is still marked running")
	}

	// 失败的结束说明里带错误信息，并且不会把进度补成 100%（否则失败的备份
	// 看起来比成功的还完整）。
	failed := newProgressRun(t)
	failed.Report(ProgressUpdate{Phase: "压缩", Percent: 37})
	End(failed, errTestFailure, "")
	storedFailure, err := Get(failed.ID)
	if err != nil {
		t.Fatal(err)
	}
	if storedFailure.Progress == nil || storedFailure.Progress.Phase != "已失败" {
		t.Fatalf("失败记录的阶段应为「已失败」: %+v", storedFailure.Progress)
	}
	if storedFailure.Progress.Percent != 37 {
		t.Fatalf("失败记录不应把进度补到 100%%: %+v", storedFailure.Progress)
	}
	if storedFailure.Progress == nil || storedFailure.Progress.Detail != "备份失败："+errTestFailure.Error() {
		t.Fatalf("stored failure progress = %+v", storedFailure.Progress)
	}
}

func TestRunningAndActiveLogSize(t *testing.T) {
	run := newProgressRun(t)

	if !IsActive(run.ID) {
		t.Fatalf("IsActive(%s) = false, want true", run.ID)
	}
	if RunningCount() < 1 {
		t.Fatal("RunningCount() = 0, want at least the live run")
	}

	// 进行中的运行要出现在 Running() 里，且带实时进度。
	run.Report(ProgressUpdate{Phase: "上传归档", Percent: 88})
	found := false
	for _, current := range Running() {
		if current.ID != run.ID {
			continue
		}
		found = true
		if !current.Running {
			t.Fatal("live run is not marked running")
		}
		if current.Progress == nil || current.Progress.Percent != 88 {
			t.Fatalf("live run progress = %+v", current.Progress)
		}
	}
	if !found {
		t.Fatalf("Running() does not contain %s", run.ID)
	}

	if _, err := run.Write([]byte("log content\n")); err != nil {
		t.Fatal(err)
	}
	size, ok := ActiveLogSize(run.ID)
	if !ok || size == 0 {
		t.Fatalf("ActiveLogSize = %d/%v, want a positive size", size, ok)
	}

	End(run, nil, "")
	if IsActive(run.ID) {
		t.Fatalf("IsActive(%s) = true after End", run.ID)
	}
	if _, ok := ActiveLogSize(run.ID); ok {
		t.Fatal("ActiveLogSize returned ok for a finished run")
	}
	if _, ok := ActiveLogSize("missing-run-id"); ok {
		t.Fatal("ActiveLogSize returned ok for an unknown run")
	}
}
