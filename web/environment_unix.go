//go:build !windows

package web

import (
	"bufio"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
)

// getSystemMemory returns (totalMB, usedMB, percent, ok).
func getSystemMemory() (float64, float64, float64, bool) {
	file, err := os.Open("/proc/meminfo")
	if err != nil {
		return 0, 0, 0, false
	}
	defer file.Close()

	var memTotalKB, memAvailableKB float64
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		fields := strings.Fields(line)
		if len(fields) >= 2 {
			key := strings.TrimSuffix(fields[0], ":")
			val, _ := strconv.ParseFloat(fields[1], 64)
			if key == "MemTotal" {
				memTotalKB = val
			} else if key == "MemAvailable" {
				memAvailableKB = val
			}
		}
	}

	if memTotalKB > 0 {
		totalMB := memTotalKB / 1024.0
		availMB := memAvailableKB / 1024.0
		usedMB := totalMB - availMB
		percent := (usedMB / totalMB) * 100.0
		return totalMB, usedMB, percent, true
	}

	return 0, 0, 0, false
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

	var stat syscall.Statfs_t
	if err := syscall.Statfs(path, &stat); err != nil {
		return 0, 0, 0, 0, false
	}

	totalBytes := stat.Blocks * uint64(stat.Bsize)
	freeBytes := stat.Bavail * uint64(stat.Bsize)
	totalGB := float64(totalBytes) / (1024 * 1024 * 1024)
	freeGB := float64(freeBytes) / (1024 * 1024 * 1024)
	usedGB := totalGB - freeGB
	percent := 0.0
	if totalGB > 0 {
		percent = (usedGB / totalGB) * 100
	}
	return totalGB, freeGB, usedGB, percent, true
}

// getPlatformInfo returns platform display name and distribution identifier.
func getPlatformInfo() (string, string) {
	// Try /etc/os-release or /usr/lib/os-release
	paths := []string{"/etc/os-release", "/usr/lib/os-release"}
	for _, p := range paths {
		if data, err := os.ReadFile(p); err == nil {
			prettyName := ""
			id := ""
			scanner := bufio.NewScanner(strings.NewReader(string(data)))
			for scanner.Scan() {
				line := strings.TrimSpace(scanner.Text())
				if strings.HasPrefix(line, "PRETTY_NAME=") {
					prettyName = strings.Trim(strings.TrimPrefix(line, "PRETTY_NAME="), `"'`)
				} else if strings.HasPrefix(line, "ID=") {
					id = strings.ToLower(strings.Trim(strings.TrimPrefix(line, "ID="), `"'`))
				}
			}
			if len(prettyName) > 0 {
				return prettyName, id
			}
			if len(id) > 0 {
				return id, id
			}
		}
	}
	return "Linux", "linux"
}
