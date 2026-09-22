package scheduler

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/go-co-op/gocron"
	"github.com/gobackup/gobackup/config"
	superlogger "github.com/gobackup/gobackup/logger"
	"github.com/gobackup/gobackup/model"
	"github.com/gobackup/gobackup/task"
)

var (
	mycron *gocron.Scheduler

	// Regex to match duration strings with extended units like "1day", "2weeks", etc.
	extendedDurationRegex = regexp.MustCompile(`^(\d+)\s*(day|days|d|week|weeks|w|month|months)$`)
)

// parseDuration parses a duration string, supporting extended units like "day", "week", "month"
// in addition to Go's standard time.ParseDuration units.
func parseDuration(s string) (time.Duration, error) {
	// First try Go's standard ParseDuration
	if d, err := time.ParseDuration(s); err == nil {
		return d, nil
	}

	// Try to match extended units (case-insensitive)
	matches := extendedDurationRegex.FindStringSubmatch(strings.ToLower(s))
	if matches == nil {
		return 0, fmt.Errorf("invalid duration format: %s", s)
	}

	value, _ := strconv.Atoi(matches[1])
	unit := matches[2]

	switch unit {
	case "day", "days", "d":
		return time.Duration(value) * 24 * time.Hour, nil
	case "week", "weeks", "w":
		return time.Duration(value) * 7 * 24 * time.Hour, nil
	case "month", "months":
		// Approximate month as 30 days
		return time.Duration(value) * 30 * 24 * time.Hour, nil
	}

	return 0, fmt.Errorf("invalid duration format: %s", s)
}

// nextTimeOfDay returns the next occurrence of a "HH:MM" or "HH:MM:SS" time of
// day, moving to tomorrow when that moment already passed today. Multiple times
// separated by ";" are supported, matching gocron's .At() syntax; the earliest
// upcoming one wins.
func nextTimeOfDay(value string, now time.Time) (time.Time, error) {
	var (
		next time.Time
		err  error
	)

	for _, candidate := range strings.Split(value, ";") {
		candidate = strings.TrimSpace(candidate)
		if candidate == "" {
			continue
		}

		layout := "15:04:05"
		if strings.Count(candidate, ":") == 1 {
			layout = "15:04"
		}

		parsed, parseErr := time.ParseInLocation(layout, candidate, now.Location())
		if parseErr != nil {
			err = parseErr
			continue
		}

		at := time.Date(now.Year(), now.Month(), now.Day(), parsed.Hour(), parsed.Minute(), parsed.Second(), 0, now.Location())
		if !at.After(now) {
			at = at.AddDate(0, 0, 1)
		}
		if next.IsZero() || at.Before(next) {
			next = at
		}
	}

	if next.IsZero() {
		if err != nil {
			return time.Time{}, err
		}
		return time.Time{}, fmt.Errorf("invalid at time: %s", value)
	}
	return next, nil
}

func init() {
	config.OnConfigChange(func(in fsnotify.Event) {
		Restart()
	})
}

// Start scheduler
func Start() error {
	logger := superlogger.Tag("Scheduler")

	mycron = gocron.NewScheduler(time.Local)

	for _, modelConfig := range config.Models {
		if !modelConfig.Schedule.Enabled {
			continue
		}

		logger.Info(fmt.Sprintf("Register %s with (%s)", modelConfig.Name, modelConfig.Schedule.String()))

		var scheduler *gocron.Scheduler
		if modelConfig.Schedule.Cron != "" {
			scheduler = mycron.Cron(modelConfig.Schedule.Cron)
		} else {
			// gocron.Every only accepts time.ParseDuration units ("h", "m", "s"),
			// while GoBackup configs and the README use "1day" / "2weeks". Running
			// the value through parseDuration first keeps those working instead of
			// silently registering no job at all.
			interval, intervalErr := parseDuration(modelConfig.Schedule.Every)
			if intervalErr != nil {
				logger.Errorf("Invalid every value %q: %s", modelConfig.Schedule.Every, intervalErr)
			}
			scheduler = mycron.Every(interval)

			if len(modelConfig.Schedule.At) > 0 {
				// gocron rejects .At() for duration based intervals ("the At()
				// method is not supported for this time unit"), which used to make
				// every "1day at 03:30" schedule register nothing at all. Start the
				// interval at the next occurrence of that time of day instead; the
				// repeating run then lands on the same time of day.
				startAt, atErr := nextTimeOfDay(modelConfig.Schedule.At, time.Now())
				if atErr != nil {
					logger.Errorf("Invalid at value %q: %s", modelConfig.Schedule.At, atErr)
				} else {
					scheduler = scheduler.StartAt(startAt)
				}
			} else {
				// If no $at present, delay start cron job with $every duration
				scheduler = scheduler.StartAt(time.Now().Add(interval))
			}
		}

		if _, err := scheduler.Do(func(modelConfig config.ModelConfig) {
			logger := superlogger.Tag(fmt.Sprintf("Scheduler: %s", modelConfig.Name))

			logger.Info("Performing...")

			m := model.Model{
				Config: modelConfig,
			}

			// 并发控制交给 model/task：同一个模型或同一个数据库环境不允许
			// 同时执行，不同模型之间可以并行，这里不再做全局串行。
			err := m.PerformWithTrigger("schedule")
			switch {
			case err == nil:
				logger.Info("Done.")
			case task.IsConflict(err):
				logger.Warnf("Skip this run: %s", err.Error())
			default:
				logger.Errorf("Failed to perform: %s", err.Error())
			}
		}, modelConfig); err != nil {
			logger.Errorf("Failed to register job func: %s", err.Error())
		}
	}

	mycron.StartAsync()

	return nil
}

func Restart() error {
	logger := superlogger.Tag("Scheduler")
	logger.Info("Reloading...")
	Stop()
	return Start()
}

func Stop() {
	if mycron != nil {
		mycron.Stop()
	}
}
