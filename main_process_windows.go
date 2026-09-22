//go:build windows

package main

import (
	"os"
	"os/exec"
	"syscall"
	"time"

	"github.com/gobackup/gobackup/config"
)

// terminateProcess stops a running GoBackup instance.
//
// Windows has no SIGTERM, so there is no graceful shutdown path here: the
// process is terminated outright. If a backup is running at that moment it is
// interrupted, exactly like pressing Ctrl+C in its console.
func terminateProcess(process *os.Process) error {
	return process.Kill()
}

// gracefulShutdownSupported reports whether terminateProcess() asks the target
// to shut down cleanly. It does not: the process is killed, so it never gets to
// remove its own pid file and `stop` has to do that itself.
func gracefulShutdownSupported() bool {
	return false
}

const (
	createNoWindow         = 0x08000000
	createBreakawayFromJob = 0x01000000
)

func startDetachedProcess(cmd *exec.Cmd) error {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: syscall.CREATE_NEW_PROCESS_GROUP | createNoWindow | createBreakawayFromJob,
	}
	if err := cmd.Start(); err != nil {
		cmd.SysProcAttr.CreationFlags = syscall.CREATE_NEW_PROCESS_GROUP | createNoWindow
		return cmd.Start()
	}
	return nil
}

const (
	processQueryLimitedInformation = 0x1000
	stillActive                    = 259
)

func isProcessAlive(process *os.Process) bool {
	if process == nil || process.Pid <= 0 {
		return false
	}

	handle, err := syscall.OpenProcess(processQueryLimitedInformation, false, uint32(process.Pid))
	if err != nil {
		return false
	}
	defer syscall.CloseHandle(handle)

	var exitCode uint32
	err = syscall.GetExitCodeProcess(handle, &exitCode)
	if err != nil {
		return false
	}
	return exitCode == stillActive
}

func waitForProcessGone(process *os.Process, pid int, timeout time.Duration) {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if !isProcessAlive(process) {
			config.RemovePidFile(pid)
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
	config.RemovePidFile(pid)
}
