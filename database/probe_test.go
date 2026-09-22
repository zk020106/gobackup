package database

import (
	"os"
	"strings"
	"testing"
)

func TestParamHelpers(t *testing.T) {
	params := map[string]any{
		"host":       "127.0.0.1",
		"port":       float64(3306),
		"enabled":    true,
		"tables":     []any{"a", "", "b"},
		"empty":      "",
		"endpoints":  []string{"http://127.0.0.1:2379"},
		"all_databases": false,
	}

	if got := paramString(params, "host", "x"); got != "127.0.0.1" {
		t.Fatalf("host = %q", got)
	}
	if got := paramString(params, "port", "x"); got != "3306" {
		t.Fatalf("port = %q", got)
	}
	if got := paramString(params, "empty", "fallback"); got != "fallback" {
		t.Fatalf("empty = %q, want fallback", got)
	}
	if !paramBool(params, "enabled") {
		t.Fatalf("enabled = false")
	}
	if paramBool(params, "all_databases") {
		t.Fatalf("all_databases = true")
	}
	if got := paramStrings(params, "tables"); len(got) != 2 || got[0] != "a" || got[1] != "b" {
		t.Fatalf("tables = %#v", got)
	}
	if got := paramStrings(params, "endpoints"); len(got) != 1 {
		t.Fatalf("endpoints = %#v", got)
	}
}

func TestEscapeSQLValue(t *testing.T) {
	if got := escapeSQLValue(`a'b\c`); got != `a''b\\c` {
		t.Fatalf("escapeSQLValue = %q", got)
	}
}

func TestUnsupportedProbeType(t *testing.T) {
	if _, err := TestConnection("oracle", nil); err == nil {
		t.Fatalf("expected error for unsupported type")
	}
	if _, err := ListTables("redis", nil); err == nil || !strings.Contains(err.Error(), "没有表") {
		t.Fatalf("expected redis table error, got %v", err)
	}
}

// TestMySQLProbeIntegration runs only when GOBACKUP_TEST_MYSQL is set, for
// example:
//
//	GOBACKUP_TEST_MYSQL="127.0.0.1|3306|mysql|root|secret" go test ./database -run MySQLProbeIntegration
func TestMySQLProbeIntegration(t *testing.T) {
	raw := os.Getenv("GOBACKUP_TEST_MYSQL")
	if raw == "" {
		t.Skip("GOBACKUP_TEST_MYSQL is not set")
	}

	parts := strings.Split(raw, "|")
	if len(parts) < 4 {
		t.Fatalf("GOBACKUP_TEST_MYSQL must be host|port|database|username[|password]")
	}
	params := map[string]any{
		"host":     parts[0],
		"port":     parts[1],
		"database": parts[2],
		"username": parts[3],
	}
	if len(parts) > 4 {
		params["password"] = parts[4]
	}

	result, err := TestConnection("mysql", params)
	if err != nil {
		t.Fatalf("TestConnection: %v", err)
	}
	if !strings.Contains(result.Message, "连接成功") {
		t.Fatalf("unexpected message: %s", result.Message)
	}
	t.Log(result.Message)

	result, err = ListTables("mysql", params)
	if err != nil {
		t.Fatalf("ListTables: %v", err)
	}
	if len(result.Tables) == 0 {
		t.Fatalf("no tables returned for %s", parts[2])
	}
	t.Logf("tables (%d): %v", len(result.Tables), result.Tables)
}
