package database

import (
	"os"
	"strings"
	"testing"
)

// probeParamsFromEnv 解析与现有 MySQL 集成用例相同的环境变量格式：
//
//	GOBACKUP_TEST_MYSQL="host|port|database|username[|password]"
func probeParamsFromEnv(t *testing.T, raw string) map[string]any {
	t.Helper()

	parts := strings.Split(raw, "|")
	if len(parts) < 4 {
		t.Fatalf("GOBACKUP_TEST_MYSQL 必须是 host|port|database|username[|password]")
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
	return params
}

// TestListDatabasesUnsupportedTypes 覆盖没有「数据库列表」概念的引擎：
// 它们必须给出可操作的中文提示，而不是一个泛化错误。
func TestListDatabasesUnsupportedTypes(t *testing.T) {
	cases := []struct {
		dbType string
		expect string
	}{
		{dbType: "redis", expect: "编号"},
		{dbType: "etcd", expect: "path"},
		{dbType: "sqlite", expect: ".db"},
		{dbType: "firebird", expect: "Firebird"},
		{dbType: "oracle", expect: "暂不支持"},
	}

	for _, test := range cases {
		t.Run(test.dbType, func(t *testing.T) {
			result, err := ListDatabases(test.dbType, nil)
			if err == nil {
				t.Fatalf("ListDatabases(%s) 应当报错，实际返回 %+v", test.dbType, result)
			}
			if !strings.Contains(err.Error(), test.expect) {
				t.Fatalf("ListDatabases(%s) 的提示应包含 %q，实际 %q", test.dbType, test.expect, err.Error())
			}
		})
	}
}

// TestListDatabasesRealServer 需要一台真实数据库：
//
//	GOBACKUP_TEST_MYSQL="127.0.0.1|3306|gobackup_probe|root|123456" \
//	  go test ./database/ -run 'ListDatabasesRealServer|ListTablesRealServer' -v
func TestListDatabasesRealServer(t *testing.T) {
	raw := os.Getenv("GOBACKUP_TEST_MYSQL")
	if raw == "" {
		t.Skip("GOBACKUP_TEST_MYSQL is not set")
	}
	params := probeParamsFromEnv(t, raw)

	result, err := ListDatabases("mysql", params)
	if err != nil {
		t.Fatalf("ListDatabases: %v", err)
	}
	if len(result.Databases) == 0 {
		t.Fatalf("没有返回任何数据库: %+v", result)
	}
	// 关键点：即使配置里已经填了 database，也仍然要返回完整列表，
	// 否则编辑器里就没法切换目标库。
	if !contains(result.Databases, params["database"].(string)) {
		t.Fatalf("列表里缺少当前配置的数据库 %v: %v", params["database"], result.Databases)
	}
	t.Logf("databases (%d): %v", len(result.Databases), result.Databases)

	connection, err := TestConnection("mysql", params)
	if err != nil {
		t.Fatalf("TestConnection: %v", err)
	}
	if !strings.Contains(connection.Message, "连接成功") {
		t.Fatalf("unexpected message: %s", connection.Message)
	}
}

// TestListTablesRealServer 验证指定库能拿到表列表，而没有指定库时给的是数据库列表。
func TestListTablesRealServer(t *testing.T) {
	raw := os.Getenv("GOBACKUP_TEST_MYSQL")
	if raw == "" {
		t.Skip("GOBACKUP_TEST_MYSQL is not set")
	}
	params := probeParamsFromEnv(t, raw)

	result, err := ListTables("mysql", params)
	if err != nil {
		t.Fatalf("ListTables: %v", err)
	}
	if len(result.Tables) == 0 {
		t.Fatalf("数据库 %v 没有返回表: %+v", params["database"], result)
	}
	t.Logf("tables (%d): %v", len(result.Tables), result.Tables)

	// 未指定库名时要退化成「给你一份数据库列表」，方便用户在界面上选。
	withoutDatabase := map[string]any{
		"host":     params["host"],
		"port":     params["port"],
		"username": params["username"],
		"password": params["password"],
	}
	result, err = ListTables("mysql", withoutDatabase)
	if err != nil {
		t.Fatalf("ListTables(no database): %v", err)
	}
	if len(result.Databases) == 0 {
		t.Fatalf("未指定数据库时应当返回数据库列表: %+v", result)
	}
	if !strings.Contains(result.Message, "选择数据库") {
		t.Fatalf("提示里应当引导用户选择数据库: %q", result.Message)
	}
}

func contains(items []string, target string) bool {
	for _, item := range items {
		if item == target {
			return true
		}
	}
	return false
}
