package database

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// probeTimeout limits every external command / HTTP request used by the
// configuration editor probes, so a bad host cannot block the API for a long
// time.
const probeTimeout = 20 * time.Second

// ProbeResult is returned by TestConnection and ListTables.
type ProbeResult struct {
	Message   string   `json:"message"`
	Tables    []string `json:"tables,omitempty"`
	Databases []string `json:"databases,omitempty"`
}

// probeMode 决定这次探测要做什么。
type probeMode int

const (
	// probeTest 只验证能不能连上。
	probeTest probeMode = iota
	// probeTables 拉取指定库里的表 / 集合。
	probeTables
	// probeDatabases 拉取实例下的数据库 / 存储桶列表，供编辑器切换目标库。
	probeDatabases
)

// TestConnection opens a lightweight connection to the database described by
// params (the same keys as the YAML config) and returns a human readable
// result. It is used by the web configuration editor.
func TestConnection(dbType string, params map[string]any) (ProbeResult, error) {
	switch dbType {
	case "mysql", "mariadb":
		return mysqlProbe(dbType, params, probeTest)
	case "postgresql":
		return postgresqlProbe(params, probeTest)
	case "redis":
		return redisProbe(params)
	case "mongodb":
		return mongodbProbe(params, probeTest)
	case "sqlite":
		return sqliteProbe(params, probeTest)
	case "mssql":
		return mssqlProbe(params, probeTest)
	case "influxdb2":
		return influxdb2Probe(params, probeTest)
	case "etcd":
		return etcdProbe(params)
	default:
		return ProbeResult{}, fmt.Errorf("暂不支持测试 %q 类型连接，请先执行一次备份验证配置", dbType)
	}
}

// ListTables connects to the database and returns selectable tables (or
// databases / buckets / collections for engines that use another concept).
func ListTables(dbType string, params map[string]any) (ProbeResult, error) {
	switch dbType {
	case "mysql", "mariadb":
		return mysqlProbe(dbType, params, probeTables)
	case "postgresql":
		return postgresqlProbe(params, probeTables)
	case "redis":
		return ProbeResult{}, errors.New("Redis 是键值数据库，没有表的概念，无法选择表")
	case "mongodb":
		return mongodbProbe(params, probeTables)
	case "sqlite":
		return sqliteProbe(params, probeTables)
	case "mssql":
		return mssqlProbe(params, probeTables)
	case "influxdb2":
		return influxdb2Probe(params, probeTables)
	case "etcd":
		return ProbeResult{}, errors.New("etcd 以键值对存储，没有表的概念，无法选择表")
	default:
		return ProbeResult{}, fmt.Errorf("暂不支持获取 %q 类型的表列表", dbType)
	}
}

// ListDatabases returns the databases (buckets for InfluxDB, admin databases
// for MongoDB) that live on the configured instance, so the editor can offer a
// picker instead of asking the user to type the name from memory.
//
// 与 ListTables 不同，这里不要求配置里已经填了 database——正因为要选库，
// 才需要这份列表。
func ListDatabases(dbType string, params map[string]any) (ProbeResult, error) {
	switch dbType {
	case "mysql", "mariadb":
		return mysqlProbe(dbType, params, probeDatabases)
	case "postgresql":
		return postgresqlProbe(params, probeDatabases)
	case "mongodb":
		return mongodbProbe(params, probeDatabases)
	case "mssql":
		return mssqlProbe(params, probeDatabases)
	case "influxdb2":
		return influxdb2Probe(params, probeDatabases)
	case "sqlite":
		return ProbeResult{}, errors.New("SQLite 是单文件数据库，直接填写 .db 文件路径即可")
	case "redis":
		return ProbeResult{}, errors.New("Redis 用数字编号选库（默认 0-15），直接填写「数据库名」为编号即可")
	case "etcd":
		return ProbeResult{}, errors.New("etcd 没有数据库概念，直接用 path 指定要备份的键前缀")
	case "firebird":
		return ProbeResult{}, errors.New("Firebird 暂不支持列出数据库，请直接填写数据库路径")
	default:
		return ProbeResult{}, fmt.Errorf("暂不支持获取 %q 类型的数据库列表", dbType)
	}
}

// ---- 参数读取 ----

func paramString(params map[string]any, key, fallback string) string {
	value, ok := params[key]
	if !ok || value == nil {
		return fallback
	}
	switch typed := value.(type) {
	case string:
		if strings.TrimSpace(typed) == "" {
			return fallback
		}
		return typed
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64)
	case int:
		return strconv.Itoa(typed)
	case int64:
		return strconv.FormatInt(typed, 10)
	case bool:
		return strconv.FormatBool(typed)
	default:
		return fallback
	}
}

func paramBool(params map[string]any, key string) bool {
	value, ok := params[key]
	if !ok {
		return false
	}
	switch typed := value.(type) {
	case bool:
		return typed
	case string:
		parsed, _ := strconv.ParseBool(typed)
		return parsed
	default:
		return false
	}
}

func paramStrings(params map[string]any, key string) []string {
	value, ok := params[key]
	if !ok || value == nil {
		return nil
	}
	items, ok := value.([]any)
	if !ok {
		if strings, ok := value.([]string); ok {
			return strings
		}
		return nil
	}
	result := make([]string, 0, len(items))
	for _, item := range items {
		if text, ok := item.(string); ok && strings.TrimSpace(text) != "" {
			result = append(result, text)
		}
	}
	return result
}

func firstNonEmptyLine(output string) string {
	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		if line != "" {
			return line
		}
	}
	return ""
}

func nonEmptyLines(output string) []string {
	result := []string{}
	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		if line != "" {
			result = append(result, line)
		}
	}
	return result
}

func escapeSQLValue(value string) string {
	replacer := strings.NewReplacer(`\`, `\\`, `'`, `''`)
	return replacer.Replace(value)
}

// ---- 命令行执行 ----

func lookPath(candidates []string, hint string) (string, error) {
	for _, name := range candidates {
		if resolved, err := exec.LookPath(name); err == nil {
			return resolved, nil
		}
	}
	return "", fmt.Errorf("未找到 %s 命令，请先安装 %s 并加入 PATH", candidates[0], hint)
}

func runCommand(binary string, args []string, env ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), probeTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, binary, args...)
	cmd.Env = append(os.Environ(), env...)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	if ctx.Err() == context.DeadlineExceeded {
		return "", fmt.Errorf("连接超时（超过 %s）", probeTimeout)
	}
	if err != nil {
		message := strings.TrimSpace(stderr.String())
		if message == "" {
			message = err.Error()
		}
		return "", errors.New(message)
	}
	return strings.TrimSpace(stdout.String()), nil
}

// ---- MySQL / MariaDB ----

func mysqlProbe(dbType string, params map[string]any, mode probeMode) (ProbeResult, error) {
	candidates := []string{"mysql"}
	if dbType == "mariadb" {
		candidates = []string{"mariadb", "mysql"}
	}
	binary, err := lookPath(candidates, "MySQL 客户端")
	if err != nil {
		return ProbeResult{}, err
	}

	args := []string{}
	socket := paramString(params, "socket", "")
	if socket != "" {
		args = append(args, "--socket="+socket)
	} else {
		args = append(args,
			"-h", paramString(params, "host", "127.0.0.1"),
			"-P", paramString(params, "port", "3306"),
			"--connect-timeout=10",
		)
	}
	args = append(args, "-u", paramString(params, "username", "root"))
	if password := paramString(params, "password", ""); password != "" {
		args = append(args, "--password="+password)
	}
	// 只透传与「建立连接」有关的额外参数（例如 --ssl-mode=DISABLED），
	// mysqldump 专用的参数（--single-transaction 等）mysql 客户端不接受。
	args = append(args, mysqlForwardedArgs(params)...)
	queryArgs := append(append([]string{}, args...), "--batch", "--skip-column-names")

	listDatabases := func(message string) (ProbeResult, error) {
		output, err := runCommand(binary, append(queryArgs, "-e", "SHOW DATABASES"))
		if err != nil {
			return ProbeResult{}, err
		}
		return ProbeResult{
			Message:   message,
			Databases: nonEmptyLines(output),
		}, nil
	}

	if mode == probeTest {
		output, err := runCommand(binary, append(queryArgs, "-e", "SELECT VERSION()"))
		if err != nil {
			return ProbeResult{}, err
		}
		return ProbeResult{Message: "连接成功：" + firstNonEmptyLine(output)}, nil
	}

	database := paramString(params, "database", "")
	// 选库列表：不管当前有没有填库名，都返回实例上的全部数据库。
	if mode == probeDatabases {
		result, err := listDatabases("连接成功")
		if err != nil {
			return ProbeResult{}, err
		}
		result.Message = fmt.Sprintf("连接成功，共 %d 个数据库", len(result.Databases))
		return result, nil
	}

	if database == "" || paramBool(params, "all_databases") {
		return listDatabases("连接成功。当前配置未指定「数据库名」；请在下方选择数据库，或填写「数据库名」后重新获取。")
	}

	query := fmt.Sprintf(
		"SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = '%s' AND TABLE_TYPE IN ('BASE TABLE','VIEW') ORDER BY TABLE_NAME",
		escapeSQLValue(database),
	)
	output, err := runCommand(binary, append(queryArgs, "-e", query))
	if err != nil {
		return ProbeResult{}, err
	}
	tables := nonEmptyLines(output)
	return ProbeResult{
		Message: fmt.Sprintf("连接成功，数据库 %s 共 %d 张表", database, len(tables)),
		Tables:  tables,
	}, nil
}

// mysqlForwardedArgs picks the connection related flags out of the configured
// `args` string so that a working backup config also works for probes.
func mysqlForwardedArgs(params map[string]any) []string {
	raw := paramString(params, "args", "")
	if raw == "" {
		return nil
	}

	allowedPrefixes := []string{
		"--ssl-mode", "--ssl-ca", "--ssl-capath", "--ssl-cert", "--ssl-key",
		"--ssl-cipher", "--ssl-verify-server-cert", "--tls-version",
		"--default-character-set", "--default-auth", "--protocol",
		"--connect-timeout", "--get-server-public-key", "--server-public-key-path",
		"--compress", "--bind-address",
	}

	result := []string{}
	for _, field := range strings.Fields(raw) {
		for _, prefix := range allowedPrefixes {
			if strings.HasPrefix(field, prefix+"=") || field == prefix {
				result = append(result, field)
				break
			}
		}
	}
	return result
}

// ---- PostgreSQL ----

func postgresqlProbe(params map[string]any, mode probeMode) (ProbeResult, error) {
	binary, err := lookPath([]string{"psql"}, "PostgreSQL 客户端")
	if err != nil {
		return ProbeResult{}, err
	}

	args := []string{"-t", "-A"}
	socket := paramString(params, "socket", "")
	if socket != "" {
		args = append(args, "-h", filepath.Dir(socket))
	} else {
		args = append(args,
			"-h", paramString(params, "host", "localhost"),
			"-p", paramString(params, "port", "5432"),
		)
	}
	args = append(args, "-U", paramString(params, "username", "postgres"))

	env := []string{"PGCONNECT_TIMEOUT=10"}
	if password := paramString(params, "password", ""); password != "" {
		env = append(env, "PGPASSWORD="+password)
	}
	if sslmode := paramString(params, "sslmode", ""); sslmode != "" && sslmode != "prefer" {
		env = append(env, "PGSSLMODE="+sslmode)
	}

	// 列出数据库 / 建连元数据查询都要连到一个已存在的库：优先 postgres，
	// 失败再退回 template1（有些发行版把 postgres 库删掉了）。
	runMetadataQuery := func(query string) (string, error) {
		output, err := runCommand(binary, append(args, "-d", "postgres", "-c", query), env...)
		if err == nil {
			return output, nil
		}
		return runCommand(binary, append(args, "-d", "template1", "-c", query), env...)
	}

	if mode == probeTest {
		database := paramString(params, "database", "postgres")
		output, err := runCommand(binary, append(args, "-d", database, "-c", "SELECT version()"), env...)
		if err != nil {
			return ProbeResult{}, err
		}
		return ProbeResult{Message: "连接成功：" + firstNonEmptyLine(output)}, nil
	}

	if mode == probeDatabases {
		output, err := runMetadataQuery("SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname")
		if err != nil {
			return ProbeResult{}, err
		}
		databases := nonEmptyLines(output)
		return ProbeResult{
			Message:   fmt.Sprintf("连接成功，共 %d 个数据库", len(databases)),
			Databases: databases,
		}, nil
	}

	database := paramString(params, "database", "")
	if database == "" || paramBool(params, "all_databases") {
		output, err := runMetadataQuery("SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname")
		if err != nil {
			return ProbeResult{}, err
		}
		return ProbeResult{
			Message:   "连接成功。当前配置未指定「数据库名」；请在下方选择数据库，或填写「数据库名」后重新获取。",
			Databases: nonEmptyLines(output),
		}, nil
	}

	output, err := runCommand(binary, append(args, "-d", database, "-c",
		"SELECT tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY tablename"), env...)
	if err != nil {
		return ProbeResult{}, err
	}
	tables := nonEmptyLines(output)
	return ProbeResult{
		Message: fmt.Sprintf("连接成功，数据库 %s 共 %d 张表", database, len(tables)),
		Tables:  tables,
	}, nil
}

// ---- Redis ----

func redisProbe(params map[string]any) (ProbeResult, error) {
	binary, err := lookPath([]string{"redis-cli"}, "Redis 客户端")
	if err != nil {
		return ProbeResult{}, err
	}

	args := []string{
		"-h", paramString(params, "host", "127.0.0.1"),
		"-p", paramString(params, "port", "6379"),
	}
	socket := paramString(params, "socket", "")
	if socket != "" {
		args = append(args, "-s", socket)
	}
	env := []string{}
	if password := paramString(params, "password", ""); password != "" {
		// REDISCLI_AUTH 可以避免密码出现在命令行参数里。
		env = append(env, "REDISCLI_AUTH="+password)
	}

	output, err := runCommand(binary, append(args, "ping"), env...)
	if err != nil {
		return ProbeResult{}, err
	}
	return ProbeResult{Message: "连接成功：Redis 响应 " + firstNonEmptyLine(output)}, nil
}

// ---- MongoDB ----

func mongodbProbe(params map[string]any, mode probeMode) (ProbeResult, error) {
	binary, err := lookPath([]string{"mongosh", "mongo"}, "MongoDB Shell")
	if err != nil {
		return ProbeResult{}, err
	}

	args := []string{"--quiet"}
	uri := paramString(params, "uri", "")
	if uri != "" {
		args = append(args, uri)
	} else {
		args = append(args,
			"--host", paramString(params, "host", "127.0.0.1"),
			"--port", paramString(params, "port", "27017"),
		)
		if username := paramString(params, "username", ""); username != "" {
			args = append(args, "--username", username)
		}
		if password := paramString(params, "password", ""); password != "" {
			args = append(args, "--password", password)
		}
		if authdb := paramString(params, "authdb", ""); authdb != "" {
			args = append(args, "--authenticationDatabase", authdb)
		}
	}

	if mode == probeTest {
		output, err := runCommand(binary, append(args, "--eval", `JSON.stringify(db.runCommand({ping:1}))`))
		if err != nil {
			return ProbeResult{}, err
		}
		line := lastJSONLine(output)
		var response map[string]any
		if err := json.Unmarshal([]byte(line), &response); err == nil {
			if ok, _ := response["ok"].(float64); ok == 1 {
				return ProbeResult{Message: "连接成功：MongoDB ping ok"}, nil
			}
		}
		return ProbeResult{Message: "连接成功：" + line}, nil
	}

	// 列出实例上的所有数据库（admin 命令），供编辑器选择。
	if mode == probeDatabases {
		script := `JSON.stringify(db.adminCommand({listDatabases:1}).databases.map(d => d.name).sort())`
		output, err := runCommand(binary, append(args, "--eval", script))
		if err != nil {
			return ProbeResult{}, err
		}
		databases, err := decodeJSONStringList(output)
		if err != nil {
			return ProbeResult{}, err
		}
		return ProbeResult{
			Message:   fmt.Sprintf("连接成功，共 %d 个数据库", len(databases)),
			Databases: databases,
		}, nil
	}

	database := paramString(params, "database", "")
	if database == "" {
		return ProbeResult{}, errors.New("请先选择或填写 database 再获取集合列表")
	}
	script := fmt.Sprintf(`JSON.stringify(db.getSiblingDB(%q).getCollectionNames().sort())`, database)
	output, err := runCommand(binary, append(args, "--eval", script))
	if err != nil {
		return ProbeResult{}, err
	}
	tables, err := decodeJSONStringList(output)
	if err != nil {
		return ProbeResult{}, err
	}
	return ProbeResult{
		Message: fmt.Sprintf("连接成功，数据库 %s 共 %d 个集合", database, len(tables)),
		Tables:  tables,
	}, nil
}

// decodeJSONStringList 解析 mongosh --eval 输出的字符串数组。
func decodeJSONStringList(output string) ([]string, error) {
	var items []string
	if err := json.Unmarshal([]byte(lastJSONLine(output)), &items); err != nil {
		return nil, fmt.Errorf("解析列表失败: %v", err)
	}
	return items, nil
}

// lastJSONLine returns the last non-empty output line, which is where mongosh
// prints its --eval result.
func lastJSONLine(output string) string {
	lines := nonEmptyLines(output)
	if len(lines) == 0 {
		return ""
	}
	return lines[len(lines)-1]
}

// ---- SQLite ----

func sqliteProbe(params map[string]any, mode probeMode) (ProbeResult, error) {
	path := paramString(params, "path", "")
	if path == "" {
		return ProbeResult{}, errors.New("SQLite path is required")
	}

	info, err := os.Stat(path)
	if err != nil {
		return ProbeResult{}, fmt.Errorf("SQLite 文件不可访问: %v", err)
	}
	if info.IsDir() {
		return ProbeResult{}, fmt.Errorf("SQLite path %s 是目录，需要指向具体的 .db 文件", path)
	}

	if mode == probeTest {
		return ProbeResult{Message: fmt.Sprintf("连接成功：SQLite 文件存在（%d 字节）", info.Size())}, nil
	}
	if mode == probeDatabases {
		return ProbeResult{}, errors.New("SQLite 是单文件数据库，直接填写 .db 文件路径即可")
	}

	binary, err := lookPath([]string{"sqlite3"}, "SQLite 命令行工具")
	if err != nil {
		return ProbeResult{}, err
	}
	output, err := runCommand(binary, []string{path, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"})
	if err != nil {
		return ProbeResult{}, err
	}
	tables := nonEmptyLines(output)
	return ProbeResult{
		Message: fmt.Sprintf("连接成功，共 %d 张表", len(tables)),
		Tables:  tables,
	}, nil
}

// ---- SQL Server ----

func mssqlProbe(params map[string]any, mode probeMode) (ProbeResult, error) {
	binary, err := lookPath([]string{"sqlcmd"}, "SQL Server 命令行工具")
	if err != nil {
		return ProbeResult{}, err
	}

	host := paramString(params, "host", "127.0.0.1")
	port := paramString(params, "port", "1433")
	args := []string{
		"-S", host + "," + port,
		"-U", paramString(params, "username", "sa"),
		"-P", paramString(params, "password", ""),
		"-h", "-1",
		"-W",
	}
	if paramBool(params, "trust_server_certificate") {
		args = append(args, "-C")
	}

	listDatabases := func(message string) (ProbeResult, error) {
		output, err := runCommand(binary, append(args, "-Q", "SET NOCOUNT ON; SELECT name FROM sys.databases ORDER BY name"))
		if err != nil {
			return ProbeResult{}, err
		}
		return ProbeResult{
			Message:   message,
			Databases: nonEmptyLines(output),
		}, nil
	}

	if mode == probeTest {
		output, err := runCommand(binary, append(args, "-Q", "SET NOCOUNT ON; SELECT @@VERSION"))
		if err != nil {
			return ProbeResult{}, err
		}
		return ProbeResult{Message: "连接成功：" + firstNonEmptyLine(output)}, nil
	}

	if mode == probeDatabases {
		result, err := listDatabases("连接成功")
		if err != nil {
			return ProbeResult{}, err
		}
		result.Message = fmt.Sprintf("连接成功，共 %d 个数据库", len(result.Databases))
		return result, nil
	}

	database := paramString(params, "database", "")
	if database == "" || paramBool(params, "all_databases") {
		return listDatabases("连接成功。当前配置未指定「数据库名」；请在下方选择数据库，或填写「数据库名」后重新获取。")
	}

	query := fmt.Sprintf("SET NOCOUNT ON; USE [%s]; SELECT name FROM sys.tables ORDER BY name", strings.ReplaceAll(database, "]", "]]"))
	output, err := runCommand(binary, append(args, "-Q", query))
	if err != nil {
		return ProbeResult{}, err
	}
	tables := nonEmptyLines(output)
	return ProbeResult{
		Message: fmt.Sprintf("连接成功，数据库 %s 共 %d 张表", database, len(tables)),
		Tables:  tables,
	}, nil
}

// ---- InfluxDB 2.x ----

func influxdb2Probe(params map[string]any, mode probeMode) (ProbeResult, error) {
	host := paramString(params, "host", "http://127.0.0.1:8086")
	if !strings.Contains(host, "://") {
		host = "http://" + host
	}
	host = strings.TrimRight(host, "/")

	if mode == probeTest {
		body, err := httpGetJSON(host+"/health", "", paramBool(params, "skip_verify"))
		if err != nil {
			return ProbeResult{}, err
		}
		if status, _ := body["status"].(string); status != "" {
			return ProbeResult{Message: "连接成功：InfluxDB 健康状态 " + status}, nil
		}
		return ProbeResult{Message: "连接成功：InfluxDB /health 可访问"}, nil
	}

	token := paramString(params, "token", "")
	if token == "" {
		return ProbeResult{}, errors.New("获取存储桶列表需要 token")
	}
	body, err := httpGetJSON(host+"/api/v2/buckets?limit=200", token, paramBool(params, "skip_verify"))
	if err != nil {
		return ProbeResult{}, err
	}
	buckets, _ := body["buckets"].([]any)
	names := make([]string, 0, len(buckets))
	for _, item := range buckets {
		if bucket, ok := item.(map[string]any); ok {
			if name, ok := bucket["name"].(string); ok && name != "" {
				names = append(names, name)
			}
		}
	}
	return ProbeResult{
		Message:   fmt.Sprintf("连接成功，共 %d 个存储桶", len(names)),
		Databases: names,
	}, nil
}

func httpGetJSON(endpoint, token string, skipVerify bool) (map[string]any, error) {
	transport := &http.Transport{}
	if skipVerify {
		transport.TLSClientConfig = &tls.Config{InsecureSkipVerify: true}
	}
	client := &http.Client{Transport: transport, Timeout: probeTimeout}

	request, err := http.NewRequest(http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	if token != "" {
		request.Header.Set("Authorization", "Token "+token)
	}

	response, err := client.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	payload, _ := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if response.StatusCode >= 400 {
		message := strings.TrimSpace(string(payload))
		if message == "" {
			message = response.Status
		}
		return nil, fmt.Errorf("%s: %s", endpoint, message)
	}

	var body map[string]any
	if len(payload) > 0 {
		if err := json.Unmarshal(payload, &body); err != nil {
			return nil, fmt.Errorf("%s 返回的内容不是 JSON: %v", endpoint, err)
		}
	}
	return body, nil
}

// ---- etcd ----

func etcdProbe(params map[string]any) (ProbeResult, error) {
	endpoint := paramString(params, "endpoint", "")
	if endpoint == "" {
		if endpoints := paramStrings(params, "endpoints"); len(endpoints) > 0 {
			endpoint = endpoints[0]
		}
	}
	if endpoint == "" {
		return ProbeResult{}, errors.New("endpoint is required")
	}
	if !strings.Contains(endpoint, "://") {
		endpoint = "http://" + endpoint
	}

	body, err := httpGetJSON(strings.TrimRight(endpoint, "/")+"/health", "", false)
	if err != nil {
		return ProbeResult{}, err
	}
	if health, ok := body["health"].(string); ok {
		return ProbeResult{Message: "连接成功：etcd health = " + health}, nil
	}
	return ProbeResult{Message: "连接成功：etcd /health 可访问"}, nil
}
