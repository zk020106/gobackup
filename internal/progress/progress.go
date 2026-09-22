// Package progress 把「本次备份的进度接收端」按 goroutine 挂载，
// 供 helper / storage 等无法直接拿到运行句柄的包上报字节进度。
//
// 使用方式与 logger.AttachRunWriter 一致：
//
//	detach := progress.Attach(tracker)
//	defer detach()
//
// 注意 Attach 只在调用它的 goroutine 上生效。上传实现通常在 SDK 自己的
// goroutine 里读文件，所以 helper.NewProgressBar 会在调用方（即备份
// goroutine）里先取到 Sink 并持有它，后续读写都在 SDK goroutine 里直接
// 调用这个 Sink。
package progress

import (
	"sync"

	"github.com/gobackup/gobackup/internal/goroutineid"
)

// Sink 接收字节级进度。
type Sink interface {
	// ReportBytes 上报当前已处理字节数；total 为 0 表示总量未知。
	ReportBytes(done, total int64)
}

type entry struct {
	id   uint64
	sink Sink
}

var registry = struct {
	sync.Mutex
	entries map[uint64][]entry
	nextID  uint64
}{entries: map[uint64][]entry{}}

// Attach 把 sink 绑定到当前 goroutine，返回解除绑定的函数（可重复调用）。
func Attach(sink Sink) func() {
	if sink == nil {
		return func() {}
	}

	goid := goroutineid.Current()
	registry.Lock()
	registry.nextID++
	current := entry{id: registry.nextID, sink: sink}
	registry.entries[goid] = append(registry.entries[goid], current)
	registry.Unlock()

	var once sync.Once
	return func() {
		once.Do(func() {
			registry.Lock()
			defer registry.Unlock()

			list := registry.entries[goid]
			for index, item := range list {
				if item.id == current.id {
					registry.entries[goid] = append(list[:index], list[index+1:]...)
					break
				}
			}
			if len(registry.entries[goid]) == 0 {
				delete(registry.entries, goid)
			}
		})
	}
}

// Current 返回绑定在当前 goroutine 上的最后一个 Sink，没有则返回 nil。
func Current() Sink {
	goid := goroutineid.Current()
	if goid == 0 {
		return nil
	}

	registry.Lock()
	defer registry.Unlock()
	list := registry.entries[goid]
	if len(list) == 0 {
		return nil
	}
	return list[len(list)-1].sink
}

// Bytes 把字节进度上报给当前 goroutine 的 Sink，没有绑定时是空操作。
func Bytes(done, total int64) {
	if sink := Current(); sink != nil {
		sink.ReportBytes(done, total)
	}
}
