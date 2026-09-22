package web

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"github.com/gobackup/gobackup/database"
)

// probeValueFromEnv 解析集成测试用的数据库连接串：
//
//	GOBACKUP_TEST_MYSQL="host|port|database|username[|password]"
func probeValueFromEnv(t *testing.T, raw string) map[string]any {
	t.Helper()

	parts := strings.Split(raw, "|")
	if len(parts) < 4 {
		t.Fatalf("GOBACKUP_TEST_MYSQL 必须是 host|port|database|username[|password]")
	}

	value := map[string]any{
		"type":     "mysql",
		"host":     parts[0],
		"port":     parts[1],
		"database": parts[2],
		"username": parts[3],
	}
	if len(parts) > 4 {
		value["password"] = parts[4]
	}
	return value
}

func decodeProbeResponse(t *testing.T, body string) database.ProbeResult {
	t.Helper()

	var response struct {
		OK        bool     `json:"ok"`
		Message   string   `json:"message"`
		Tables    []string `json:"tables"`
		Databases []string `json:"databases"`
	}
	if err := json.Unmarshal([]byte(body), &response); err != nil {
		t.Fatalf("解析探测响应失败: %v body=%s", err, body)
	}
	if !response.OK {
		t.Fatalf("探测失败: %s", response.Message)
	}

	return database.ProbeResult{
		Message:   response.Message,
		Tables:    response.Tables,
		Databases: response.Databases,
	}
}

// TestProbeDatabasesEndpoint 覆盖编辑器「选择数据库」用到的接口：
// 即使配置里已经填了 database，也必须返回完整库列表，否则界面换不了库。
func TestProbeDatabasesEndpoint(t *testing.T) {
	raw := os.Getenv("GOBACKUP_TEST_MYSQL")
	if raw == "" {
		t.Skip("GOBACKUP_TEST_MYSQL is not set")
	}
	value := probeValueFromEnv(t, raw)

	status, body := invokeHttp("POST", "/api/config/probe", basicAuthHeader(), map[string]any{
		"action": "databases",
		"kind":   "database",
		"model":  "base_test",
		"path":   "/models/base_test/databases/dummy_test",
		"type":   "mysql",
		"value":  value,
	})
	if status != 200 {
		t.Fatalf("status = %d, body = %s", status, body)
	}

	result := decodeProbeResponse(t, body)
	if len(result.Databases) == 0 {
		t.Fatalf("没有返回数据库列表: %+v", result)
	}
	if !containsString(result.Databases, value["database"].(string)) {
		t.Fatalf("库列表里缺少当前配置的库 %v: %v", value["database"], result.Databases)
	}
	t.Logf("databases (%d): %v", len(result.Databases), result.Databases)
}

// TestProbeTablesEndpoint 覆盖「获取表」接口：指定库时给表列表，
// 未指定库时退化成库列表并给出引导文案。
func TestProbeTablesEndpoint(t *testing.T) {
	raw := os.Getenv("GOBACKUP_TEST_MYSQL")
	if raw == "" {
		t.Skip("GOBACKUP_TEST_MYSQL is not set")
	}
	value := probeValueFromEnv(t, raw)

	status, body := invokeHttp("POST", "/api/config/probe", basicAuthHeader(), map[string]any{
		"action": "tables",
		"kind":   "database",
		"model":  "base_test",
		"path":   "/models/base_test/databases/dummy_test",
		"type":   "mysql",
		"value":  value,
	})
	if status != 200 {
		t.Fatalf("status = %d, body = %s", status, body)
	}
	result := decodeProbeResponse(t, body)
	if len(result.Tables) == 0 {
		t.Fatalf("没有返回表列表: %+v", result)
	}
	t.Logf("tables (%d): %v", len(result.Tables), result.Tables)

	// 清掉 database 之后，应当返回数据库列表并提示去选库。
	delete(value, "database")
	status, body = invokeHttp("POST", "/api/config/probe", basicAuthHeader(), map[string]any{
		"action": "tables",
		"kind":   "database",
		"model":  "base_test",
		"path":   "/models/base_test/databases/dummy_test",
		"type":   "mysql",
		"value":  value,
	})
	if status != 200 {
		t.Fatalf("status = %d, body = %s", status, body)
	}
	result = decodeProbeResponse(t, body)
	if len(result.Databases) == 0 {
		t.Fatalf("未指定数据库时应当返回数据库列表: %+v", result)
	}
	if !strings.Contains(result.Message, "选择数据库") {
		t.Fatalf("提示里应当引导用户选择数据库: %q", result.Message)
	}
}

func containsString(items []string, target string) bool {
	for _, item := range items {
		if item == target {
			return true
		}
	}
	return false
}
