package scheduler

import (
	"testing"
	"time"

	"github.com/longbridgeapp/assert"
)

func Test_parseDuration(t *testing.T) {
	tests := []struct {
		input    string
		expected time.Duration
		hasError bool
	}{
		// Standard Go durations
		{"30s", 30 * time.Second, false},
		{"1m", 1 * time.Minute, false},
		{"2h", 2 * time.Hour, false},
		{"1h30m", 1*time.Hour + 30*time.Minute, false},

		// Extended day units
		{"1day", 24 * time.Hour, false},
		{"1d", 24 * time.Hour, false},
		{"2days", 48 * time.Hour, false},
		{"7d", 7 * 24 * time.Hour, false},

		// Extended week units
		{"1week", 7 * 24 * time.Hour, false},
		{"1w", 7 * 24 * time.Hour, false},
		{"2weeks", 14 * 24 * time.Hour, false},

		// Extended month units
		{"1month", 30 * 24 * time.Hour, false},
		{"2months", 60 * 24 * time.Hour, false},

		// Case insensitive
		{"1DAY", 24 * time.Hour, false},
		{"1Day", 24 * time.Hour, false},

		// With whitespace
		{"1 day", 24 * time.Hour, false},
		{"2 weeks", 14 * 24 * time.Hour, false},

		// Invalid formats
		{"invalid", 0, true},
		{"", 0, true},
	}

	for _, tc := range tests {
		t.Run(tc.input, func(t *testing.T) {
			result, err := parseDuration(tc.input)
			if tc.hasError {
				assert.NotNil(t, err)
			} else {
				assert.Nil(t, err)
				assert.Equal(t, tc.expected, result)
			}
		})
	}
}

func Test_nextTimeOfDay(t *testing.T) {
	location := time.Local
	now := time.Date(2024, 5, 6, 15, 26, 0, 0, location)

	t.Run("later today", func(t *testing.T) {
		at, err := nextTimeOfDay("20:00", now)
		assert.Nil(t, err)
		assert.Equal(t, time.Date(2024, 5, 6, 20, 0, 0, 0, location), at)
	})

	t.Run("already passed rolls to tomorrow", func(t *testing.T) {
		at, err := nextTimeOfDay("03:30", now)
		assert.Nil(t, err)
		assert.Equal(t, time.Date(2024, 5, 7, 3, 30, 0, 0, location), at)
	})

	t.Run("seconds are honoured", func(t *testing.T) {
		at, err := nextTimeOfDay("16:00:30", now)
		assert.Nil(t, err)
		assert.Equal(t, time.Date(2024, 5, 6, 16, 0, 30, 0, location), at)
	})

	t.Run("earliest of several times wins", func(t *testing.T) {
		at, err := nextTimeOfDay("18:00;16:00", now)
		assert.Nil(t, err)
		assert.Equal(t, time.Date(2024, 5, 6, 16, 0, 0, 0, location), at)
	})

	t.Run("invalid value reports an error", func(t *testing.T) {
		_, err := nextTimeOfDay("not-a-time", now)
		assert.NotNil(t, err)
	})
}
