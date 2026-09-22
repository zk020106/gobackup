//go:build !windows

package main

import (
	"os"
	"os/exec"
	"syscall"
	"time"

	"github.com/gobackup/gobackup/config"
)

// terminateProcess asks a running GoBackup instance to shut down. SIGTERM is
// picked up by the signal handler installed in `run`, which stops the scheduler
// and removes the pid file.
func terminateProcess(process *os.Process) error {
	return process.Signal(syscall.SIGTERM)
}

// gracefulShutdownSupported reports whether terminateProcess() asks the target
// to shut down cleanly. When it returns true the target also removes its own
// pid file while exiting.
func gracefulShutdownSupported() bool {
	return true
}

func startDetachedProcess(cmd *exec.Cmd) error {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setsid: true,
	}
	return cmd.Start()
}

func isProcessAlive(process *os.Process) bool {
	if process == nil || process.Pid <= 0 {
		return false
	}
	return process.Signal(syscall.Signal(0)) == nil
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
	_ = process.Kill()
	config.RemovePidFile(pid)
}
