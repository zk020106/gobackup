package web

import (
	"net/http"
	"strings"
	"testing"

	"github.com/gobackup/gobackup/config"
	"github.com/gobackup/gobackup/runlog"
)

func createTestRun(t *testing.T) *runlog.Run {
	t.Helper()

	model := config.ModelConfig{
		Name: "api-model",
		Databases: map[string]config.SubConfig{
			"db": {Name: "db", Type: "mysql"},
		},
		Storages: map[string]config.SubConfig{
			"local": {Name: "local", Type: "local"},
		},
	}
	run, err := runlog.Begin(model, "api")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := run.Write([]byte("api run output\n")); err != nil {
		t.Fatal(err)
	}
	runlog.End(run, nil, "")
	return run
}

func TestRunsAPI(t *testing.T) {
	runlog.SetDir(t.TempDir())
	t.Cleanup(func() { runlog.SetDir("") })

	run := createTestRun(t)
	router := setupRouter("test")

	status, body := callConfigEditor(t, router, http.MethodGet, "/api/runs", nil)
	if status != http.StatusOK || !strings.Contains(body, run.ID) {
		t.Fatalf("list status = %d, body = %s", status, body)
	}
	if !strings.Contains(body, `"status":"success"`) {
		t.Fatalf("list missing status: %s", body)
	}

	status, body = callConfigEditor(t, router, http.MethodGet, "/api/runs/"+run.ID, nil)
	if status != http.StatusOK || !strings.Contains(body, `"api-model"`) {
		t.Fatalf("get status = %d, body = %s", status, body)
	}

	status, body = callConfigEditor(t, router, http.MethodGet, "/api/runs/"+run.ID+"/log", nil)
	if status != http.StatusOK || !strings.Contains(body, "api run output") {
		t.Fatalf("log status = %d, body = %s", status, body)
	}

	status, _ = callConfigEditor(t, router, http.MethodGet, "/api/runs/../etc/passwd", nil)
	if status == http.StatusOK {
		t.Fatalf("path traversal should not return 200")
	}

	status, _ = callConfigEditor(t, router, http.MethodDelete, "/api/runs/"+run.ID, nil)
	if status != http.StatusOK {
		t.Fatalf("delete status = %d", status)
	}
	if _, err := runlog.Get(run.ID); err == nil {
		t.Fatalf("run record still exists after delete")
	}
}
