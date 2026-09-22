package main

import (
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/spf13/viper"
	"github.com/urfave/cli/v2"

	"github.com/gobackup/gobackup/config"
	"github.com/gobackup/gobackup/logger"
	"github.com/gobackup/gobackup/model"
	"github.com/gobackup/gobackup/scheduler"
	"github.com/gobackup/gobackup/web"
)

const (
	usage = "Backup your databases, files to FTP / SCP / S3 / GCS and other cloud storages."
)

var (
	configFile string
	version    = "master"
)

func buildFlags(flags []cli.Flag) []cli.Flag {
	return append(flags, &cli.StringFlag{
		Name:        "config",
		Aliases:     []string{"c"},
		Usage:       "Special a config file",
		Destination: &configFile,
	})
}

// watchSignals turns Ctrl+C and SIGTERM into a clean shutdown: the scheduler is
// stopped and the pid file is removed, so a later `gobackup stop` does not
// report a stale instance.
func watchSignals() {
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)

	go func() {
		sig := <-signals
		logger.Infof("Received %s, shutting down...", sig)
		scheduler.Stop()
		config.RemovePidFile(os.Getpid())
		os.Exit(0)
	}()
}

// stopRunning sends the stop signal to the instance recorded in the pid file
// written by `run`.
func stopRunning() error {
	pid, err := config.ReadPidFile()
	if err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("no running GoBackup instance (no pid file at %s)", config.PidFilePath)
		}
		return fmt.Errorf("read pid file: %w", err)
	}

	process, err := os.FindProcess(pid)
	if err != nil || !isProcessAlive(process) {
		config.RemovePidFile(pid)
		return fmt.Errorf("process %d is gone, removed stale pid file %s", pid, config.PidFilePath)
	}

	if err := terminateProcess(process); err != nil {
		// Either the process already exited or the pid belongs to something
		// else now. Either way the recorded pid is useless.
		config.RemovePidFile(pid)
		return fmt.Errorf("stop process %d: %w (removed stale pid file %s)", pid, err, config.PidFilePath)
	}

	if gracefulShutdownSupported() {
		waitForProcessGone(process, pid, 5*time.Second)
	} else {
		config.RemovePidFile(pid)
	}

	logger.Infof("Sent stop signal to GoBackup (pid %d).", pid)
	fmt.Printf("Sent stop signal to GoBackup (PID: %d).\n", pid)
	return nil
}

func startBackgroundDaemon() error {
	executable, err := os.Executable()
	if err != nil {
		return fmt.Errorf("failed to get executable path: %w", err)
	}

	args := []string{"run"}
	if len(configFile) != 0 {
		absConfig, err := filepath.Abs(configFile)
		if err == nil {
			args = append(args, "--config", absConfig)
		} else {
			args = append(args, "--config", configFile)
		}
	}

	cmd := exec.Command(executable, args...)
	if wd, err := os.Getwd(); err == nil {
		cmd.Dir = wd
	}
	if err := config.EnsureGoBackupDir(); err != nil {
		return err
	}

	logFile, err := os.OpenFile(config.LogFilePath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return fmt.Errorf("open log file %s: %w", config.LogFilePath, err)
	}
	defer logFile.Close()
	cmd.Stdout = logFile
	cmd.Stderr = logFile

	if err := startDetachedProcess(cmd); err != nil {
		return fmt.Errorf("failed to start GoBackup in background: %w", err)
	}

	childPid := cmd.Process.Pid
	fmt.Printf("GoBackup started in background (PID: %d).\n", childPid)
	logger.Infof("GoBackup started in background (PID: %d).", childPid)

	// Wait briefly to verify child process didn't immediately exit (e.g. invalid config or port error)
	time.Sleep(500 * time.Millisecond)
	if !isProcessAlive(cmd.Process) {
		return fmt.Errorf("GoBackup process %d exited unexpectedly. Please check log at %s", childPid, config.LogFilePath)
	}

	return nil
}

func restartRunning(foreground bool) error {
	pid, err := config.ReadPidFile()
	if err == nil && pid > 0 {
		process, findErr := os.FindProcess(pid)
		if findErr == nil && isProcessAlive(process) {
			logger.Infof("Stopping running GoBackup instance (pid %d)...", pid)
			fmt.Printf("Stopping running GoBackup instance (PID: %d)...\n", pid)
			if termErr := terminateProcess(process); termErr != nil {
				logger.Warnf("Failed to stop process %d: %v", pid, termErr)
			}
			waitForProcessGone(process, pid, 5*time.Second)
			logger.Infof("GoBackup (pid %d) stopped.", pid)
			fmt.Printf("GoBackup (PID: %d) stopped.\n", pid)
		} else {
			config.RemovePidFile(pid)
		}
	} else if !os.IsNotExist(err) {
		logger.Warnf("Read pid file: %v", err)
	}

	config.RemovePidFile(pid)
	time.Sleep(300 * time.Millisecond)

	if foreground {
		fmt.Println("Starting GoBackup in foreground...")
		return runServer()
	}

	return startBackgroundDaemon()
}

func runServer() error {
	if err := config.EnsureGoBackupDir(); err != nil {
		return err
	}

	logger.SetLogger(config.LogFilePath)

	err := initApplication()
	if err != nil {
		return err
	}

	// Record the pid before anything can block, so `gobackup stop`
	// in another terminal can find this process.
	if err := config.WritePidFile(); err != nil {
		logger.Warnf("Failed to write pid file %s: %v", config.PidFilePath, err)
	}
	defer config.RemovePidFile(os.Getpid())
	watchSignals()

	if err := scheduler.Start(); err != nil {
		return fmt.Errorf("failed to start scheduler: %w", err)
	}

	if !config.Web.Enabled {
		select {}
	}

	return web.StartHTTP(version)
}

func main() {
	app := cli.NewApp()

	app.Version = version
	app.Name = "gobackup"
	app.Usage = usage

	app.Commands = []*cli.Command{
		{
			Name: "perform",
			Flags: buildFlags([]cli.Flag{
				&cli.StringSliceFlag{
					Name:    "model",
					Aliases: []string{"m"},
					Usage:   "Model name that you want perform",
				},
			}),
			Action: func(ctx *cli.Context) error {
				var modelNames []string
				err := initApplication()
				if err != nil {
					return err
				}
				modelNames = append(ctx.StringSlice("model"), ctx.Args().Slice()...)
				return perform(modelNames)
			},
		},
		{
			Name:  "start",
			Usage: "Start GoBackup as daemon in background",
			Flags: buildFlags([]cli.Flag{}),
			Action: func(ctx *cli.Context) error {
				pid, err := config.ReadPidFile()
				if err == nil && pid > 0 {
					if p, findErr := os.FindProcess(pid); findErr == nil && isProcessAlive(p) {
						return fmt.Errorf("GoBackup is already running with PID %d (run 'gobackup stop' or 'gobackup restart')", pid)
					}
					config.RemovePidFile(pid)
				}
				fmt.Println("Starting GoBackup in background...")
				return startBackgroundDaemon()
			},
		},
		{
			Name:  "run",
			Usage: "Run GoBackup in foreground",
			Flags: buildFlags([]cli.Flag{}),
			Action: func(ctx *cli.Context) error {
				return runServer()
			},
		},
		{
			Name:  "stop",
			Usage: "Stop the running GoBackup instance",
			Flags: buildFlags([]cli.Flag{}),
			Action: func(ctx *cli.Context) error {
				return stopRunning()
			},
		},
		{
			Name:  "restart",
			Usage: "Restart GoBackup instance",
			Flags: buildFlags([]cli.Flag{
				&cli.BoolFlag{
					Name:    "foreground",
					Aliases: []string{"f"},
					Usage:   "Restart in foreground instead of background",
				},
			}),
			Action: func(ctx *cli.Context) error {
				return restartRunning(ctx.Bool("foreground"))
			},
		},
	}

	if err := app.Run(os.Args); err != nil {
		logger.Fatal(err.Error())
	}
}

func initApplication() error {
	return config.Init(configFile)
}

func perform(modelNames []string) error {
	var models []*model.Model
	if len(modelNames) == 0 {
		// perform all
		models = model.GetModels()
	} else {
		for _, name := range modelNames {
			if m := model.GetModelByName(name); m == nil {
				return fmt.Errorf("model %s not found in %s", name, viper.ConfigFileUsed())
			} else {
				models = append(models, m)
			}
		}
	}

	var last_error error
	last_error = nil
	for _, m := range models {
		if err := m.PerformWithTrigger("cli"); err != nil {
			logger.Tag(fmt.Sprintf("Model %s", m.Config.Name)).Error(err)
			last_error = err
		}
	}

	return last_error
}
