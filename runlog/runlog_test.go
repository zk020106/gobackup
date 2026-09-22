package runlog

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gobackup/gobackup/config"
)

func testModel() config.ModelConfig {
	return config.ModelConfig{
		Name:        "venus",
		Description: "demo model",
		Databases: map[string]config.SubConfig{
			"venus": {Name: "venus", Type: "mysql"},
		},
		Storages: map[string]config.SubConfig{
			"local": {Name: "local", Type: "local"},
		},
	}
}

func TestRunLifecycle(t *testing.T) {
	SetDir(t.TempDir())
	t.Cleanup(func() { SetDir("") })

	run, err := Begin(testModel(), "schedule")
	if err != nil {
		t.Fatal(err)
	}
	if run.Status != StatusRunning {
		t.Fatalf("status = %s, want running", run.Status)
	}

	if _, err := run.Write([]byte("hello backup\n")); err != nil {
		t.Fatal(err)
	}

	archiveDir := t.TempDir()
	archivePath := filepath.Join(archiveDir, "venus.tar.gz")
	if err := os.WriteFile(archivePath, []byte("archive-content"), 0o644); err != nil {
		t.Fatal(err)
	}

	End(run, nil, archivePath)

	runs, err := List("", 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(runs) != 1 {
		t.Fatalf("runs = %d, want 1", len(runs))
	}
	stored := runs[0]
	if stored.Status != StatusSuccess || stored.Trigger != "schedule" {
		t.Fatalf("unexpected stored run: %+v", stored)
	}
	if stored.ArchiveName != "venus.tar.gz" || stored.ArchiveSize != int64(len("archive-content")) {
		t.Fatalf("archive info not recorded: %+v", stored)
	}
	if stored.LogSize == 0 {
		t.Fatalf("log size not recorded")
	}

	logPath, err := LogPath(stored.ID)
	if err != nil {
		t.Fatal(err)
	}
	logContent, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(logContent), "hello backup") ||
		!strings.Contains(string(logContent), "备份结果: 备份成功") {
		t.Fatalf("unexpected log content: %s", logContent)
	}

	// 运行中挂载的 writer 在结束后不应再写入。
	if _, err := run.Write([]byte("after end\n")); err != nil {
		t.Fatal(err)
	}
	logContent, _ = os.ReadFile(logPath)
	if strings.Contains(string(logContent), "after end") {
		t.Fatalf("log was written after End")
	}

	if err := Delete(stored.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := Get(stored.ID); !os.IsNotExist(err) {
		t.Fatalf("Get after delete error = %v, want not exist", err)
	}
}

func TestRunFailure(t *testing.T) {
	SetDir(t.TempDir())
	t.Cleanup(func() { SetDir("") })

	run, err := Begin(testModel(), "cli")
	if err != nil {
		t.Fatal(err)
	}
	End(run, errors.New("mysqldump failed"), "")

	stored, err := Get(run.ID)
	if err != nil {
		t.Fatal(err)
	}
	if stored.Status != StatusFailure || stored.Error != "mysqldump failed" {
		t.Fatalf("unexpected failure record: %+v", stored)
	}
}

func TestListFilterAndLimit(t *testing.T) {
	SetDir(t.TempDir())
	t.Cleanup(func() { SetDir("") })

	for index := 0; index < 5; index++ {
		model := testModel()
		model.Name = fmt.Sprintf("model-%d", index%2)
		run, err := Begin(model, "manual")
		if err != nil {
			t.Fatal(err)
		}
		End(run, nil, "")
	}

	filtered, err := List("model-0", 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(filtered) != 3 {
		t.Fatalf("filtered runs = %d, want 3", len(filtered))
	}

	limited, err := List("", 2)
	if err != nil {
		t.Fatal(err)
	}
	if len(limited) != 2 {
		t.Fatalf("limited runs = %d, want 2", len(limited))
	}
}

func TestPruneKeepsNewest(t *testing.T) {
	SetDir(t.TempDir())
	t.Cleanup(func() { SetDir("") })

	for index := 0; index < MaxRuns+5; index++ {
		run, err := Begin(testModel(), "manual")
		if err != nil {
			t.Fatal(err)
		}
		End(run, nil, "")
	}

	runs, err := List("", 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(runs) != MaxRuns {
		t.Fatalf("runs = %d, want %d", len(runs), MaxRuns)
	}
}

func TestValidID(t *testing.T) {
	for _, id := range []string{"20260101-120000-venus-ab12cd", "abc.DEF_123-"} {
		if !ValidID(id) {
			t.Fatalf("ValidID(%q) = false, want true", id)
		}
	}
	for _, id := range []string{"", "../etc/passwd", "a/b", "a\\b", "a b", strings.Repeat("x", 200)} {
		if ValidID(id) {
			t.Fatalf("ValidID(%q) = true, want false", id)
		}
	}
}
