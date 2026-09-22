package task

import (
	"fmt"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// sequence 保证同一进程内的名字互不相同（Windows 上 time.Now 的精度可能
// 不足以区分紧挨着的两次调用）。
var sequence atomic.Uint64

// unique 生成不会与其他测试（包括并行运行的测试）重名的标识。
func unique(prefix string) string {
	return fmt.Sprintf("%s-%d-%d", prefix, time.Now().UnixNano(), sequence.Add(1))
}

// mustAcquire 占用资源，失败直接终止测试。
func mustAcquire(t *testing.T, id, modelName string, resources []Resource) func() {
	t.Helper()

	release, err := Acquire(id, modelName, resources)
	if err != nil {
		t.Fatalf("Acquire(%s) error = %v", id, err)
	}
	return release
}

// mustAcquireList 用一个随机 id 占用一组资源。
func mustAcquireList(t *testing.T, modelName string, resources []Resource) func() {
	t.Helper()
	return mustAcquire(t, unique("holder"), modelName, resources)
}

// conflictBetween 判断 first 处于占用状态时 second 是否冲突。
//
// 探针自己占用的是一个独立的实例，因此不会与被测资源互相干扰；被测资源
// 必须是当前空闲的。
func conflictBetween(t *testing.T, first, second Resource) bool {
	t.Helper()

	probe := Resource{
		Kind:     KindDatabase,
		Instance: unique("probe://instance"),
		Label:    "probe",
	}
	probe.Target = probe.Instance + "/probe"

	releaseProbe := mustAcquireList(t, "probe", []Resource{probe})
	defer releaseProbe()

	releaseFirst := mustAcquireList(t, "probe-target", []Resource{first})
	defer releaseFirst()

	return IsConflict(Check([]Resource{second}))
}

func TestAcquireSameDatabaseTargetConflicts(t *testing.T) {
	id := unique("holder")
	instance := "mysql://127.0.0.1:3306"
	target := instance + "/" + unique("venus")
	resource := Resource{Kind: KindDatabase, Instance: instance, Target: target, Label: "mysql venus"}

	release := mustAcquire(t, id, "alpha", []Resource{resource})
	defer release()

	// 另一个模型（不同 id）指向同一个库时必然冲突。
	_, err := Acquire(unique("holder"), "beta", []Resource{resource})
	if err == nil {
		t.Fatal("second Acquire succeeded, want conflict")
	}
	if !IsConflict(err) {
		t.Fatalf("IsConflict(%v) = false, want true", err)
	}

	conflict, ok := err.(*ConflictError)
	if !ok {
		t.Fatalf("error type = %T, want *ConflictError", err)
	}
	if conflict.Resource.Target != target {
		t.Fatalf("conflict resource target = %q, want %q", conflict.Resource.Target, target)
	}
	if conflict.HeldBy.ID != id || conflict.HeldBy.Model != "alpha" {
		t.Fatalf("conflict holder = %+v, want id %s / model alpha", conflict.HeldBy, id)
	}

	// 提示信息里要能看到冲突的标签和占用者，用户才知道该等谁。
	if !strings.Contains(err.Error(), resource.Label) {
		t.Fatalf("conflict message %q does not mention label %q", err.Error(), resource.Label)
	}
	if !strings.Contains(err.Error(), id) {
		t.Fatalf("conflict message %q does not mention holder %q", err.Error(), id)
	}
}

func TestAcquireWholeInstanceConflicts(t *testing.T) {
	instance := "mysql://127.0.0.1:3307"
	whole := Resource{Kind: KindDatabase, Instance: instance, Label: instance + "（全部数据库）"}
	specific := Resource{Kind: KindDatabase, Instance: instance, Target: instance + "/venus", Label: instance + "/venus"}
	other := Resource{Kind: KindDatabase, Instance: instance, Target: instance + "/mars", Label: instance + "/mars"}

	// 先占一个具体目标：此时整体占用实例（Target 为空）必须冲突。
	releaseSpecific := mustAcquire(t, unique("holder"), "gamma", []Resource{specific})
	if err := Check([]Resource{whole}); !IsConflict(err) {
		t.Fatalf("whole instance under a target holder error = %v, want conflict", err)
	}
	releaseSpecific()

	// 反过来：先占整个实例，同实例下任何具体目标都冲突。
	// 注意 whole（Target 为空）不能反过来当探针，它要求实例当前空闲。
	releaseWhole := mustAcquire(t, unique("holder"), "alpha", []Resource{whole})
	defer releaseWhole()

	if err := Check([]Resource{specific}); !IsConflict(err) {
		t.Fatalf("target under a whole-instance holder error = %v, want conflict", err)
	}
	if err := Check([]Resource{other}); !IsConflict(err) {
		t.Fatalf("other target under a whole-instance holder error = %v, want conflict", err)
	}
	if err := Check([]Resource{whole}); !IsConflict(err) {
		t.Fatalf("whole instance under itself error = %v, want conflict", err)
	}

	// 不同实例之间互不影响。
	remote := Resource{Kind: KindDatabase, Instance: "mysql://127.0.0.1:3407", Label: "mysql://127.0.0.1:3407"}
	if err := Check([]Resource{remote}); err != nil {
		t.Fatalf("Check(remote) error = %v, want nil", err)
	}
}

func TestAcquireDifferentTargetsSameInstanceDoNotConflict(t *testing.T) {
	instance := "pgsql://127.0.0.1:5432"
	venus := Resource{Kind: KindDatabase, Instance: instance, Target: instance + "/venus", Label: instance + "/venus"}
	mars := Resource{Kind: KindDatabase, Instance: instance, Target: instance + "/mars", Label: instance + "/mars"}

	// 同名实例、不同目标：两者可以同时启动。
	releaseVenus := mustAcquire(t, unique("holder"), "alpha", []Resource{venus})
	releaseMars := mustAcquire(t, unique("holder"), "beta", []Resource{mars})

	if err := Check([]Resource{venus}); !IsConflict(err) {
		t.Fatalf("Check(venus) error = %v, want conflict", err)
	}
	if err := Check([]Resource{mars}); !IsConflict(err) {
		t.Fatalf("Check(mars) error = %v, want conflict", err)
	}

	// 释放其中一个，另一个仍然独占自己的目标。
	releaseVenus()
	if err := Check([]Resource{venus}); err != nil {
		t.Fatalf("Check(venus) after release error = %v, want nil", err)
	}
	if err := Check([]Resource{mars}); !IsConflict(err) {
		t.Fatalf("Check(mars) error = %v, want conflict", err)
	}
	releaseMars()

	// 两次都释放后，用探针确认同实例下的目标可以并存。
	if conflictBetween(t, venus, mars) {
		t.Fatal("different targets on the same instance conflict")
	}
	if conflictBetween(t, mars, venus) {
		t.Fatal("different targets on the same instance conflict in reverse")
	}
}

func TestAcquireSameInstanceSameTargetConflicts(t *testing.T) {
	venus := Resource{Kind: KindModel, Target: unique("venus"), Label: "venus"}
	mars := Resource{Kind: KindModel, Target: unique("mars"), Label: "mars"}

	list := mustAcquireList(t, "alpha", []Resource{venus, mars})
	defer list()

	// 与多个资源中的任意一个重合都冲突。
	if err := Check([]Resource{mars}); !IsConflict(err) {
		t.Fatalf("Check(mars) error = %v, want conflict", err)
	}
	if err := Check([]Resource{venus, mars}); !IsConflict(err) {
		t.Fatalf("Check(venus, mars) error = %v, want conflict", err)
	}
}

func TestAcquireDifferentKindsNeverConflict(t *testing.T) {
	name := unique("target")
	modelResource := Resource{Kind: KindModel, Target: name, Label: "model " + name}
	databaseResource := Resource{Kind: KindDatabase, Instance: "mysql://127.0.0.1:3308", Target: "mysql://127.0.0.1:3308/" + name, Label: "mysql " + name}

	releaseModel := mustAcquire(t, unique("holder"), name, []Resource{modelResource})
	defer releaseModel()

	releaseDatabase := mustAcquire(t, unique("holder"), "other", []Resource{databaseResource})
	defer releaseDatabase()

	if err := Check([]Resource{modelResource, databaseResource}); !IsConflict(err) {
		t.Fatalf("Check over held resources error = %v, want conflict", err)
	}
}

func TestAcquireDifferentModelsDifferentDatabasesDoNotConflict(t *testing.T) {
	alphaName, betaName := unique("alpha"), unique("beta")
	alpha := Resource{Kind: KindModel, Target: alphaName, Label: alphaName}
	alphaDB := Resource{Kind: KindDatabase, Instance: "mysql://127.0.0.1:3309", Target: "mysql://127.0.0.1:3309/alpha", Label: "mysql alpha"}
	beta := Resource{Kind: KindModel, Target: betaName, Label: betaName}
	betaDB := Resource{Kind: KindDatabase, Instance: "mysql://127.0.0.1:3310", Target: "mysql://127.0.0.1:3310/beta", Label: "mysql beta"}

	releaseAlpha := mustAcquire(t, unique("holder"), alphaName, []Resource{alpha, alphaDB})
	defer releaseAlpha()

	if err := Check([]Resource{beta, betaDB}); err != nil {
		t.Fatalf("Check(beta) error = %v, want nil", err)
	}
	releaseBeta := mustAcquire(t, unique("holder"), betaName, []Resource{beta, betaDB})
	defer releaseBeta()

	if !IsModelRunning(alphaName) || !IsModelRunning(betaName) {
		t.Fatal("IsModelRunning = false for an acquired model")
	}
	if IsModelRunning(unique("unknown")) {
		t.Fatal("IsModelRunning = true for an unknown model")
	}
}

func TestReleaseFreesResourceAndIsIdempotent(t *testing.T) {
	target := "mysql://127.0.0.1:3311/" + unique("venus")
	resource := Resource{Kind: KindDatabase, Instance: "mysql://127.0.0.1:3311", Target: target, Label: target}

	firstID := unique("holder")
	release := mustAcquire(t, firstID, "alpha", []Resource{resource})

	if err := Check([]Resource{resource}); !IsConflict(err) {
		t.Fatalf("Check before release error = %v, want conflict", err)
	}

	release()
	// 释放必须可重复调用，且不能误删他人的占用。
	release()
	release()

	// 重新占用后必须仍然独占：重复释放第一次不能把新的持有者放掉。
	reacquire, err := Acquire(unique("holder"), "beta", []Resource{resource})
	if err != nil {
		t.Fatalf("Acquire after release error = %v, want nil", err)
	}
	defer reacquire()

	if err := Check([]Resource{resource}); !IsConflict(err) {
		t.Fatalf("Check after second acquire error = %v, want conflict", err)
	}
}

func TestBindRunIDShowsInConflictAndRunning(t *testing.T) {
	name := unique("model")
	resource := Resource{Kind: KindModel, Target: name, Label: "model " + name}

	id := unique("holder")
	release := mustAcquire(t, id, name, []Resource{resource})
	defer release()

	runID := unique("run")
	BindRunID(id, runID)

	holders := Running()
	var found *Holder
	for index := range holders {
		if holders[index].ID == id {
			found = &holders[index]
		}
	}
	if found == nil {
		t.Fatalf("Running() does not contain holder %s", id)
	}
	if found.RunID != runID {
		t.Fatalf("holder RunID = %q, want %q", found.RunID, runID)
	}
	if found.Label != name || found.Model != name {
		t.Fatalf("holder = %+v, want model/label %q", found, name)
	}
	if found.DisplayID() != runID {
		t.Fatalf("holder DisplayID() = %q, want %q", found.DisplayID(), runID)
	}

	_, err := Acquire(unique("holder"), name, []Resource{resource})
	if !IsConflict(err) {
		t.Fatalf("Acquire error = %v, want conflict", err)
	}
	if !strings.Contains(err.Error(), runID) {
		t.Fatalf("conflict message %q does not mention run id %q", err.Error(), runID)
	}

	// 未绑定的占位 id 仍可用于展示。
	BindRunID(unique("unknown"), runID)
}

func TestBindRunIDIgnoresEmptyRunIDAndUnknownHolder(t *testing.T) {
	id := unique("holder")
	resource := Resource{Kind: KindModel, Target: unique("model"), Label: "model"}

	release := mustAcquire(t, id, "alpha", []Resource{resource})
	defer release()

	BindRunID(id, "")
	for _, holder := range Running() {
		if holder.ID != id {
			continue
		}
		if holder.RunID != "" {
			t.Fatalf("holder RunID = %q, want empty", holder.RunID)
		}
		if holder.DisplayID() != id {
			t.Fatalf("DisplayID() = %q, want %q", holder.DisplayID(), id)
		}
	}

	// Running() 返回的是快照：改动返回值不应影响内部状态。
	holders := Running()
	for index := range holders {
		if holders[index].ID == id {
			holders[index].Model = "tampered"
		}
	}
	for _, holder := range Running() {
		if holder.ID == id && holder.Model == "tampered" {
			t.Fatal("Running() leaked the internal holder")
		}
	}
}

func TestCheckDoesNotReserve(t *testing.T) {
	resource := Resource{
		Kind:     KindDatabase,
		Instance: "mysql://127.0.0.1:3312",
		Target:   "mysql://127.0.0.1:3312/" + unique("venus"),
		Label:    "mysql venus",
	}

	if err := Check([]Resource{resource}); err != nil {
		t.Fatalf("Check on a free resource error = %v, want nil", err)
	}
	if err := Check(nil); err != nil {
		t.Fatalf("Check(nil) error = %v, want nil", err)
	}

	// Check 只读不写：检查通过后必须还能真正占用。
	release := mustAcquire(t, unique("holder"), "alpha", []Resource{resource})
	defer release()
}

func TestReleaseOnlyFreesOwnHolder(t *testing.T) {
	instance := "redis://127.0.0.1:6379"
	first := Resource{Kind: KindDatabase, Instance: instance, Target: instance + "/0", Label: instance + "/0"}
	second := Resource{Kind: KindDatabase, Instance: instance, Target: instance + "/1", Label: instance + "/1"}

	firstID := unique("holder")
	releaseFirst := mustAcquire(t, firstID, "alpha", []Resource{first})
	releaseSecond := mustAcquire(t, unique("holder"), "beta", []Resource{second})

	releaseFirst()
	releaseSecond()

	// 同一 id 可以重新占用已释放的资源，两个目标都空闲了。
	reacquire, err := Acquire(firstID, "alpha", []Resource{first, second})
	if err != nil {
		t.Fatalf("Acquire after both releases error = %v, want nil", err)
	}
	defer reacquire()

	if err := Check([]Resource{first}); !IsConflict(err) {
		t.Fatalf("Check(first) error = %v, want conflict", err)
	}
	if err := Check([]Resource{second}); !IsConflict(err) {
		t.Fatalf("Check(second) error = %v, want conflict", err)
	}
}
