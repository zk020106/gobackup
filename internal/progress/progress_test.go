package progress

import (
	"sync"
	"testing"
)

// testSink 记录收到的字节进度。
type testSink struct {
	mu    sync.Mutex
	calls int
	done  int64
	total int64
}

func (sink *testSink) ReportBytes(done, total int64) {
	sink.mu.Lock()
	defer sink.mu.Unlock()

	sink.calls++
	sink.done = done
	sink.total = total
}

func (sink *testSink) snapshot() (int, int64, int64) {
	sink.mu.Lock()
	defer sink.mu.Unlock()

	return sink.calls, sink.done, sink.total
}

func TestAttachIsGoroutineScoped(t *testing.T) {
	sink := &testSink{}
	detach := Attach(sink)

	// 挂载它的 goroutine 能看到。
	if current := Current(); current == nil {
		t.Fatal("Current() = nil in the attaching goroutine")
	} else if current != Sink(sink) {
		t.Fatalf("Current() = %T, want the attached sink", current)
	}

	// 其他 goroutine 看不到（内部按 goroutine id 隔离）。
	var other Sink
	var probed bool
	done := make(chan struct{})
	go func() {
		defer close(done)
		other = Current()
		probed = true
	}()
	<-done

	if !probed {
		t.Fatal("the other goroutine did not run")
	}
	if other != nil {
		t.Fatalf("Current() in another goroutine = %T, want nil", other)
	}

	// 解除挂载后自己也看不到，子 goroutine 在执行期间挂载的是它自己的 Sink。
	detach()
	if current := Current(); current != nil {
		t.Fatalf("Current() after detach = %T, want nil", current)
	}
}

func TestAttachInChildGoroutineIsNotVisibleOutside(t *testing.T) {
	// 主 goroutine 不挂载任何东西。
	if current := Current(); current != nil {
		t.Fatalf("Current() = %T before any attach, want nil", current)
	}

	child := &testSink{}
	done := make(chan struct{})
	go func() {
		defer close(done)

		// 子 goroutine 里挂载后立刻可见。
		detach := Attach(child)
		defer detach() // 卸载保证注册表不留残余

		if current := Current(); current != Sink(child) {
			t.Errorf("Current() in the child goroutine = %T, want the attached sink", current)
			return
		}
		if _, done, total := child.snapshot(); done != 0 || total != 0 {
			t.Errorf("sink was called before any report: %d/%d", done, total)
		}
	}()
	<-done

	if current := Current(); current != nil {
		t.Fatalf("Current() in the main goroutine = %T, want nil after the child exited", current)
	}
}

func TestDetachIsIdempotent(t *testing.T) {
	first := &testSink{}
	second := &testSink{}

	detachFirst := Attach(first)
	detachSecond := Attach(second)

	// Current 返回最后挂载的那个。
	if current := Current(); current != Sink(second) {
		t.Fatalf("Current() = %T, want the latest sink", current)
	}

	// 重复卸载不能 panic，也不能把别的 sink 一起摘掉。
	detachSecond()
	detachSecond()
	detachSecond()

	if current := Current(); current != Sink(first) {
		t.Fatalf("Current() after detaching the latest sink = %T, want the first sink", current)
	}

	detachFirst()
	detachFirst()

	if current := Current(); current != nil {
		t.Fatalf("Current() after detaching everything = %T, want nil", current)
	}
}

func TestBytesWithoutSinkIsNoop(t *testing.T) {
	// 没有挂载任何 Sink 时不能 panic，也不能影响其他 goroutine 的 Sink。
	Bytes(1, 2)
	Bytes(0, 0)
	Bytes(-1, -1)

	sink := &testSink{}
	detach := Attach(sink)
	defer detach()

	Bytes(10, 100)
	calls, done, total := sink.snapshot()
	if calls != 1 || done != 10 || total != 100 {
		t.Fatalf("sink got calls=%d done=%d total=%d, want 1/10/100", calls, done, total)
	}

	// 子 goroutine 没有 Sink，Bytes 是空操作，且不会写到父 goroutine 的 Sink。
	done41 := make(chan struct{})
	go func() {
		defer close(done41)
		Bytes(999, 999)
	}()
	<-done41

	if calls, _, _ := sink.snapshot(); calls != 1 {
		t.Fatalf("the parent sink received %d calls, want 1", calls)
	}
}

func TestAttachNilSink(t *testing.T) {
	// nil Sink 不注册任何东西，返回的卸载函数仍可安全调用。
	detach := Attach(nil)
	detach()
	detach()

	if current := Current(); current != nil {
		t.Fatalf("Current() = %T after attaching nil, want nil", current)
	}

	// nil Sink 也不应挡住 Bytes 的空操作行为。
	Bytes(3, 4)
}

func TestBytesReachesLatestSinkOnly(t *testing.T) {
	outer := &testSink{}
	inner := &testSink{}

	detachOuter := Attach(outer)
	defer detachOuter()

	Bytes(1, 2)
	if calls, _, _ := outer.snapshot(); calls != 1 {
		t.Fatalf("outer sink calls = %d, want 1", calls)
	}

	detachInner := Attach(inner)
	defer detachInner()

	// 嵌套挂载时只上报给最新的 Sink。
	Bytes(5, 10)
	if calls, _, _ := outer.snapshot(); calls != 1 {
		t.Fatalf("outer sink calls = %d after nesting, want 1", calls)
	}
	if calls, done, total := inner.snapshot(); calls != 1 || done != 5 || total != 10 {
		t.Fatalf("inner sink got calls=%d done=%d total=%d, want 1/5/10", calls, done, total)
	}

	// 摘掉内层后回到外层。
	detachInner()
	Bytes(7, 14)
	if calls, done, total := outer.snapshot(); calls != 2 || done != 7 || total != 14 {
		t.Fatalf("outer sink got calls=%d done=%d total=%d, want 2/7/14", calls, done, total)
	}
}
