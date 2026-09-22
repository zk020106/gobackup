package web

import (
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"github.com/gobackup/gobackup/config"
)

func TestMergeMaskedValue(t *testing.T) {
	draft := map[string]any{
		"type":     "mysql",
		"host":     "db.internal",
		"password": map[string]any{"configured": true, "masked": "••••••••"},
		"empty":    map[string]any{"configured": false, "masked": "••••••••"},
		"nested": map[string]any{
			"token": map[string]any{"configured": true, "masked": "••••••••"},
		},
		"tables": []any{"a", "b"},
	}
	saved := map[string]any{
		"host":     "old-host",
		"password": "real-secret",
		"empty":    "stale",
		"nested":   map[string]any{"token": "nested-secret"},
	}

	merged, ok := mergeMaskedValue(draft, saved).(map[string]any)
	if !ok {
		t.Fatalf("merged is not a map")
	}
	if merged["host"] != "db.internal" {
		t.Fatalf("host = %v", merged["host"])
	}
	if merged["password"] != "real-secret" {
		t.Fatalf("password = %v", merged["password"])
	}
	if _, exists := merged["empty"]; exists {
		t.Fatalf("unconfigured masked value should be dropped")
	}
	nested, _ := merged["nested"].(map[string]any)
	if nested["token"] != "nested-secret" {
		t.Fatalf("nested token = %v", nested["token"])
	}
}

func TestSavedConfigValueAt(t *testing.T) {
	oldConfigFile := config.ConfigFileUsed()

	t.Setenv("PROBE_DB_PASSWORD", "env-secret")
	directory := t.TempDir()
	filePath := filepath.Join(directory, "gobackup.yml")
	content := []byte(`models:
  demo:
    databases:
      db:
        type: mysql
        password: ${PROBE_DB_PASSWORD}
        tables:
          - one
          - two
    storages:
      local:
        type: local
        path: /tmp/backups
`)
	if err := os.WriteFile(filePath, content, 0600); err != nil {
		t.Fatal(err)
	}
	if err := config.Init(filePath); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if oldConfigFile != "" {
			_ = config.Init(oldConfigFile)
		}
	})

	if got := savedConfigValueAt("/models/demo/databases/db/password"); got != "env-secret" {
		t.Fatalf("password = %v, want env-secret", got)
	}
	tables, ok := savedConfigValueAt("/models/demo/databases/db/tables").([]any)
	if !ok || len(tables) != 2 {
		t.Fatalf("tables = %#v", tables)
	}
	if got := savedConfigValueAt("/models/missing"); got != nil {
		t.Fatalf("missing = %#v, want nil", got)
	}
}

func TestProbeStorageLocal(t *testing.T) {
	// local 存储的相对路径按进程工作目录解析，与备份运行时一致。
	workdir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	relative := "probe-storage-" + filepath.Base(t.TempDir())
	t.Cleanup(func() { _ = os.RemoveAll(filepath.Join(workdir, relative)) })

	router := setupRouter("test")

	status, body := callConfigEditor(t, router, http.MethodPost, "/api/config/probe", map[string]any{
		"action": "test",
		"kind":   "storage",
		"path":   "/models/demo/storages/local",
		"type":   "local",
		"value":  map[string]any{"type": "local", "path": relative},
	})
	if status != http.StatusOK {
		t.Fatalf("status = %d, body = %s", status, body)
	}

	var response map[string]any
	decodeJSON(t, body, &response)
	if response["ok"] != true {
		t.Fatalf("probe failed: %s", body)
	}
}

func TestProbeUnsupportedDatabase(t *testing.T) {
	router := setupRouter("test")
	status, body := callConfigEditor(t, router, http.MethodPost, "/api/config/probe", map[string]any{
		"action": "test",
		"kind":   "database",
		"path":   "/models/demo/databases/db",
		"type":   "oracle",
		"value":  map[string]any{"type": "oracle"},
	})
	if status != http.StatusOK {
		t.Fatalf("status = %d, body = %s", status, body)
	}

	var response map[string]any
	decodeJSON(t, body, &response)
	if response["ok"] != false {
		t.Fatalf("expected ok=false, body = %s", body)
	}
}

func TestProbeInvalidRequest(t *testing.T) {
	router := setupRouter("test")
	status, _ := callConfigEditor(t, router, http.MethodPost, "/api/config/probe", map[string]any{
		"kind": "notifier",
	})
	if status != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", status)
	}
}
