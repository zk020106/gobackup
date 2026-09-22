//go:build windows

package web

import (
	"os"
	"path/filepath"
	"syscall"
	"unsafe"
)

type memoryStatusEx struct {
	cbSize                  uint32
	dwMemoryLoad            uint32
	ullTotalPhys            uint64
	ullAvailPhys            uint64
	ullTotalPageFile        uint64
	ullAvailPageFile        uint64
	ullTotalVirtual         uint64
	ullAvailVirtual         uint64
	ullAvailExtendedVirtual uint64
}

// getSystemMemory returns (totalMB, usedMB, percent, ok).
func getSystemMemory() (float64, float64, float64, bool) {
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	globalMemoryStatusEx := kernel32.NewProc("GlobalMemoryStatusEx")
	var ms memoryStatusEx
	ms.cbSize = uint32(unsafe.Sizeof(ms))
	ret, _, _ := globalMemoryStatusEx.Call(uintptr(unsafe.Pointer(&ms)))
	if ret == 0 {
		return 0, 0, 0, false
	}

	totalMB := float64(ms.ullTotalPhys) / (1024 * 1024)
	availMB := float64(ms.ullAvailPhys) / (1024 * 1024)
	usedMB := totalMB - availMB
	percent := 0.0
	if totalMB > 0 {
		percent = (usedMB / totalMB) * 100
	}
	return totalMB, usedMB, percent, true
}

// getSystemDisk returns (totalGB, freeGB, usedGB, percent, ok) for path.
func getSystemDisk(path string) (float64, float64, float64, float64, bool) {
	if len(path) == 0 {
		path, _ = os.Getwd()
	}
	absPath, err := filepath.Abs(path)
	if err == nil {
		path = absPath
	}
	vol := filepath.VolumeName(path)
	if len(vol) == 0 {
		vol = "C:"
	}
	vol += `\`

	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	getDiskFreeSpaceExW := kernel32.NewProc("GetDiskFreeSpaceExW")
	volPtr, err := syscall.UTF16PtrFromString(vol)
	if err != nil {
		return 0, 0, 0, 0, false
	}

	var freeBytesAvailable, totalNumberOfBytes, totalNumberOfFreeBytes uint64
	ret, _, _ := getDiskFreeSpaceExW.Call(
		uintptr(unsafe.Pointer(volPtr)),
		uintptr(unsafe.Pointer(&freeBytesAvailable)),
		uintptr(unsafe.Pointer(&totalNumberOfBytes)),
		uintptr(unsafe.Pointer(&totalNumberOfFreeBytes)),
	)
	if ret == 0 {
		return 0, 0, 0, 0, false
	}

	totalGB := float64(totalNumberOfBytes) / (1024 * 1024 * 1024)
	freeGB := float64(freeBytesAvailable) / (1024 * 1024 * 1024)
	usedGB := totalGB - freeGB
	percent := 0.0
	if totalGB > 0 {
		percent = (usedGB / totalGB) * 100
	}
	return totalGB, freeGB, usedGB, percent, true
}

// getPlatformInfo returns platform display name and distribution identifier.
func getPlatformInfo() (string, string) {
	return "Windows", "windows"
}
