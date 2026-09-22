// Package goroutineid 提供当前 goroutine 的 id。
//
// 备份流程中 database / storage / compressor 等包都直接使用全局 logger 与
// 全局进度上报，没有地方注入「本次运行」的句柄。这里用 goroutine id 作为
// 关联键：一次 Perform 从头到尾都在同一个 goroutine 里执行，开始时把句柄挂
// 上去、结束时摘掉即可，多个备份任务并行时互不影响。
package goroutineid

import (
	"runtime"
	"strconv"
	"strings"
)

// Current 返回当前 goroutine 的 id，解析失败时返回 0。
func Current() uint64 {
	var buf [64]byte
	n := runtime.Stack(buf[:], false)
	// 首行格式固定为 "goroutine 123 [running]:"。
	fields := strings.Fields(string(buf[:n]))
	if len(fields) < 2 {
		return 0
	}
	id, err := strconv.ParseUint(fields[1], 10, 64)
	if err != nil {
		return 0
	}
	return id
}
