package web

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gobackup/gobackup/config"
)

func TestConfigEditorRoundTrip(t *testing.T) {
	oldConfigFile := config.ConfigFileUsed()
	t.Setenv("GOBACKUP_EDITOR_PATH", "/var/lib/gobackup/backups")

	directory := t.TempDir()
	filePath := filepath.Join(directory, "gobackup.yml")
	initial := []byte(`# editor comment must survive a form update
web:
  host: 127.0.0.1
  port: 2703 # keep this comment
  username: editor
  password: editor-secret
models:
  demo:
    description: editor model
    unknown_option: keep-me
    storages:
      local:
        type: local
        path: ${GOBACKUP_EDITOR_PATH}
    archive:
      includes:
        - /tmp
`)
	if err := os.WriteFile(filePath, initial, 0600); err != nil {
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

	router := setupRouter("test")
	status, body := callConfigEditor(t, router, http.MethodGet, "/api/config/editor", nil)
	if status != http.StatusOK {
		t.Fatalf("GET editor status = %d, body = %s", status, body)
	}
	var readResponse map[string]any
	decodeJSON(t, body, &readResponse)
	version, ok := readResponse["version"].(string)
	if !ok || version == "" {
		t.Fatalf("GET editor did not return a version: %#v", readResponse["version"])
	}
	if strings.Contains(body, "editor-secret") {
		t.Fatalf("sensitive value leaked in editor response: %s", body)
	}
	configValue := readResponse["config"].(map[string]any)
	webValue := configValue["web"].(map[string]any)
	passwordValue := webValue["password"].(map[string]any)
	if passwordValue["configured"] != true || passwordValue["masked"] == "editor-secret" {
		t.Fatalf("password was not masked: %#v", passwordValue)
	}

	status, body = callConfigEditor(t, router, http.MethodPatch, "/api/config/editor", map[string]any{
		"version": version,
		"operations": []any{
			map[string]any{"op": "set", "path": "/web/port", "value": 2904},
			map[string]any{"op": "set", "path": "/models/demo/description", "value": "updated model"},
		},
	})
	if status != http.StatusOK {
		t.Fatalf("PATCH editor status = %d, body = %s", status, body)
	}
	updatedFile, err := os.ReadFile(filePath)
	if err != nil {
		t.Fatal(err)
	}
	updatedText := string(updatedFile)
	if !strings.Contains(updatedText, "${GOBACKUP_EDITOR_PATH}") {
		t.Fatalf("environment placeholder was changed: %s", updatedText)
	}
	if !strings.Contains(updatedText, "# editor comment must survive a form update") || !strings.Contains(updatedText, "unknown_option: keep-me") {
		t.Fatalf("comments or unknown fields were not preserved: %s", updatedText)
	}
	if !strings.Contains(updatedText, "# keep this comment") {
		t.Fatalf("inline comment was not preserved: %s", updatedText)
	}
	if !strings.Contains(updatedText, "description: \"updated model\"") || config.Web.Port != "2904" {
		t.Fatalf("ordinary value was not saved and reloaded: %s, web port %s", updatedText, config.Web.Port)
	}

	status, _ = callConfigEditor(t, router, http.MethodPatch, "/api/config/editor", map[string]any{
		"version":    version,
		"operations": []any{map[string]any{"op": "set", "path": "/web/host", "value": "stale"}},
	})
	if status != http.StatusConflict {
		t.Fatalf("stale PATCH status = %d, want %d", status, http.StatusConflict)
	}

	status, _ = callConfigEditor(t, router, http.MethodPost, "/api/config/editor/validate", map[string]any{
		"version":    hashConfig(updatedFile),
		"operations": []any{map[string]any{"op": "delete", "path": "/models/demo/storages"}},
	})
	if status != http.StatusUnprocessableEntity {
		t.Fatalf("invalid validation status = %d, want %d", status, http.StatusUnprocessableEntity)
	}
	status, _ = callConfigEditor(t, router, http.MethodPatch, "/api/config/editor", map[string]any{
		"version":    hashConfig(updatedFile),
		"operations": []any{map[string]any{"op": "delete", "path": "/models/demo/storages"}},
	})
	if status != http.StatusUnprocessableEntity {
		t.Fatalf("invalid PATCH status = %d, want %d", status, http.StatusUnprocessableEntity)
	}
	unchanged, err := os.ReadFile(filePath)
	if err != nil {
		t.Fatal(err)
	}
	if string(unchanged) != updatedText {
		t.Fatalf("validation changed the file")
	}

	status, body = callConfigEditor(t, router, http.MethodGet, "/api/config/editor", nil)
	if status != http.StatusOK {
		t.Fatalf("second GET editor status = %d, body = %s", status, body)
	}
	decodeJSON(t, body, &readResponse)
	version, _ = readResponse["version"].(string)
	status, body = callConfigEditor(t, router, http.MethodPatch, "/api/config/editor", map[string]any{
		"version": version,
		"operations": []any{map[string]any{
			"op":   "set",
			"path": "/models/second",
			"value": map[string]any{
				"storages": map[string]any{"local": map[string]any{"type": "local", "path": "/tmp/backups"}},
				"archive":  map[string]any{"includes": []string{"/tmp"}},
			},
		}},
	})
	if status != http.StatusOK {
		t.Fatalf("add model status = %d, body = %s", status, body)
	}

	var saveResponse map[string]any
	decodeJSON(t, body, &saveResponse)
	version, _ = saveResponse["version"].(string)
	status, body = callConfigEditor(t, router, http.MethodPatch, "/api/config/editor", map[string]any{
		"version":    version,
		"operations": []any{map[string]any{"op": "delete", "path": "/models/second"}},
	})
	if status != http.StatusOK {
		t.Fatalf("delete model status = %d, body = %s", status, body)
	}
}

func callConfigEditor(t *testing.T, router http.Handler, method, path string, payload map[string]any) (int, string) {
	t.Helper()
	var body io.Reader
	if payload != nil {
		encoded, err := json.Marshal(payload)
		if err != nil {
			t.Fatal(err)
		}
		body = bytes.NewReader(encoded)
	}
	request := httptest.NewRequest(method, path, body)
	if payload != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	// 配置接口在 /api 下，需要带上鉴权头。
	for key, value := range basicAuthHeader() {
		request.Header.Set(key, value)
	}
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	return response.Code, response.Body.String()
}

func decodeJSON(t *testing.T, input string, output any) {
	t.Helper()
	if err := json.Unmarshal([]byte(input), output); err != nil {
		t.Fatalf("decode JSON: %v; body: %s", err, input)
	}
}
