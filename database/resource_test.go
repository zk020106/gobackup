package database

import (
	"fmt"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/spf13/viper"

	"github.com/gobackup/gobackup/config"
	"github.com/gobackup/gobackup/task"
)

// newTestSubConfig 用 viper 手工构造一个数据库配置。
func newTestSubConfig(name, dbType string, values map[string]any) config.SubConfig {
	settings := viper.New()
	for key, value := range values {
		settings.Set(key, value)
	}
	return config.SubConfig{Name: name, Type: dbType, Viper: settings}
}

func TestResourcesMySQLWithDatabase(t *testing.T) {
	cfg := newTestSubConfig("venus", "mysql", map[string]any{
		"host":     "127.0.0.1",
		"port":     3306,
		"database": "venus",
	})

	resources := Resources(cfg)
	if len(resources) != 1 {
		t.Fatalf("resources = %d, want 1", len(resources))
	}
	resource := resources[0]

	if resource.Kind != task.KindDatabase {
		t.Fatalf("kind = %q, want %q", resource.Kind, task.KindDatabase)
	}
	if resource.Instance != "mysql://127.0.0.1:3306" {
		t.Fatalf("instance = %q, want mysql://127.0.0.1:3306", resource.Instance)
	}
	if resource.Target != "mysql://127.0.0.1:3306/venus" {
		t.Fatalf("target = %q, want mysql://127.0.0.1:3306/venus", resource.Target)
	}
	if resource.Label == "" || !strings.Contains(resource.Label, "venus") {
		t.Fatalf("label = %q, want it to mention venus", resource.Label)
	}
}

func TestResourcesAllDatabasesUsesWholeInstance(t *testing.T) {
	cfg := newTestSubConfig("all", "mysql", map[string]any{
		"host":          "127.0.0.1",
		"port":          3306,
		"database":      "venus",
		"all_databases": true,
	})

	resources := Resources(cfg)
	if len(resources) != 1 {
		t.Fatalf("resources = %d, want 1", len(resources))
	}
	resource := resources[0]

	if resource.Target != "" {
		t.Fatalf("target = %q, want empty for all_databases", resource.Target)
	}
	if resource.Instance != "mysql://127.0.0.1:3306" {
		t.Fatalf("instance = %q, want mysql://127.0.0.1:3306", resource.Instance)
	}
	if resource.Label == "" {
		t.Fatal("label is empty")
	}

	// all_databases 会占用整个实例：同实例下任意目标都冲突。
	other := Resources(newTestSubConfig("venus", "mysql", map[string]any{
		"host":     "127.0.0.1",
		"port":     3306,
		"database": "venus",
	}))
	if !conflictBetween(resource, other[0]) {
		t.Fatalf("all_databases resource %+v does not conflict with %+v", resource, other[0])
	}
}

func TestResourcesSQLiteUsesDirAndFileName(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "venus.sqlite")

	cfg := newTestSubConfig("venus", "sqlite", map[string]any{"path": path})
	resources := Resources(cfg)
	if len(resources) != 1 {
		t.Fatalf("resources = %d, want 1", len(resources))
	}
	resource := resources[0]

	if resource.Instance != "sqlite://"+dir {
		t.Fatalf("instance = %q, want %q", resource.Instance, "sqlite://"+dir)
	}
	if resource.Target != "sqlite://"+dir+"/venus.sqlite" {
		t.Fatalf("target = %q, want %q", resource.Target, "sqlite://"+dir+"/venus.sqlite")
	}
	if resource.Label == "" {
		t.Fatal("label is empty")
	}

	// 同目录下的另一个数据库文件互不冲突（目录不同则实例不同）。
	otherDir := t.TempDir()
	other := Resources(newTestSubConfig("mars", "sqlite", map[string]any{
		"path": filepath.Join(otherDir, "mars.sqlite"),
	}))
	if conflictBetween(resource, other[0]) {
		t.Fatalf("sqlite resources in different dirs conflict: %+v / %+v", resource, other[0])
	}

	// 同一目录下的两个文件同实例、不同目标，不冲突。
	sameDir := Resources(newTestSubConfig("mars", "sqlite", map[string]any{
		"path": filepath.Join(dir, "mars.sqlite"),
	}))
	if conflictBetween(resource, sameDir[0]) {
		t.Fatalf("sqlite resources with different files conflict: %+v / %+v", resource, sameDir[0])
	}
}

func TestResourcesSameHostDifferentDatabaseDoNotConflict(t *testing.T) {
	venus := Resources(newTestSubConfig("venus", "postgresql", map[string]any{
		"host":     "10.0.0.1",
		"port":     5432,
		"database": "venus",
	}))[0]
	mars := Resources(newTestSubConfig("mars", "postgresql", map[string]any{
		"host":     "10.0.0.1",
		"port":     5432,
		"database": "mars",
	}))[0]

	if venus.Instance != mars.Instance {
		t.Fatalf("instances differ: %q / %q", venus.Instance, mars.Instance)
	}
	if conflictBetween(venus, mars) {
		t.Fatalf("resources with different databases conflict: %+v / %+v", venus, mars)
	}

	// 反过来，跨实例同样不冲突。
	remote := Resources(newTestSubConfig("venus", "postgresql", map[string]any{
		"host":     "10.0.0.2",
		"port":     5432,
		"database": "venus",
	}))[0]
	if conflictBetween(venus, remote) {
		t.Fatalf("resources on different hosts conflict: %+v / %+v", venus, remote)
	}

	// 同一个库则冲突。
	sameTarget := Resources(newTestSubConfig("venus-copy", "postgresql", map[string]any{
		"host":     "10.0.0.1",
		"port":     5432,
		"database": "venus",
	}))[0]
	if !conflictBetween(venus, sameTarget) {
		t.Fatalf("resources with the same database do not conflict: %+v / %+v", venus, sameTarget)
	}
}

func TestResourcesExclusiveKeyConflictsAcrossTypes(t *testing.T) {
	mySQL := Resources(newTestSubConfig("venus", "mysql", map[string]any{
		"host":          "10.0.0.1",
		"port":          3306,
		"database":      "venus",
		"exclusive_key": "shared",
	}))[0]
	redis := Resources(newTestSubConfig("cache", "redis", map[string]any{
		"host":          "10.0.0.9",
		"port":          6379,
		"exclusive_key": "shared",
	}))[0]

	if mySQL.Target != "exclusive:shared" || redis.Target != "exclusive:shared" {
		t.Fatalf("exclusive targets = %q / %q, want exclusive:shared", mySQL.Target, redis.Target)
	}
	if mySQL.Label == "" || !strings.Contains(mySQL.Label, "shared") {
		t.Fatalf("label = %q, want it to mention exclusive_key", mySQL.Label)
	}
	if !conflictBetween(mySQL, redis) {
		t.Fatalf("resources sharing exclusive_key do not conflict: %+v / %+v", mySQL, redis)
	}

	// 不同的 exclusive_key 互不影响。
	other := Resources(newTestSubConfig("cache", "redis", map[string]any{
		"host":          "10.0.0.9",
		"port":          6379,
		"exclusive_key": "other",
	}))[0]
	if conflictBetween(mySQL, other) {
		t.Fatalf("resources with different exclusive keys conflict: %+v / %+v", mySQL, other)
	}

	// exclusive_key 为空（或只有空白）时回到按实例判断，不再占用互斥组。
	blank := Resources(newTestSubConfig("cache", "redis", map[string]any{
		"host":          "10.0.0.9",
		"port":          6379,
		"exclusive_key": "   ",
	}))[0]
	if blank.Instance != "redis://10.0.0.9:6379" {
		t.Fatalf("blank exclusive_key instance = %q, want redis://10.0.0.9:6379", blank.Instance)
	}
	if conflictBetween(blank, mySQL) {
		t.Fatalf("blank exclusive_key should not join the shared group: %+v / %+v", blank, mySQL)
	}
}

func TestResourcesEndpointAndSocketInstances(t *testing.T) {
	etcd := Resources(newTestSubConfig("etcd", "etcd", map[string]any{
		"endpoints": []string{"http://10.0.0.2:2379", "http://10.0.0.1:2379"},
		"path":      "/backup/etcd",
	}))[0]
	if etcd.Instance != "etcd://[http://10.0.0.1:2379,http://10.0.0.2:2379]" {
		t.Fatalf("etcd instance = %q, want sorted endpoints", etcd.Instance)
	}
	if etcd.Target != etcd.Instance+"/etcd" {
		t.Fatalf("etcd target = %q, want %q", etcd.Target, etcd.Instance+"/etcd")
	}

	// endpoints 顺序不同但集合相同，实例与目标都一样，属于同一个备份对象。
	sameEtcd := Resources(newTestSubConfig("etcd", "etcd", map[string]any{
		"endpoints": []string{"http://10.0.0.1:2379", "http://10.0.0.2:2379"},
		"path":      "/backup/etcd",
	}))[0]
	if sameEtcd.Instance != etcd.Instance || sameEtcd.Target != etcd.Target {
		t.Fatalf("endpoint order changed the resource: %+v / %+v", etcd, sameEtcd)
	}
	if !conflictBetween(etcd, sameEtcd) {
		t.Fatalf("same endpoints with the same target should conflict: %+v / %+v", etcd, sameEtcd)
	}

	// 换个备份路径则是同实例下的不同目标，不冲突。
	otherPath := Resources(newTestSubConfig("etcd", "etcd", map[string]any{
		"endpoints": []string{"http://10.0.0.2:2379", "http://10.0.0.1:2379"},
		"path":      "/backup/other",
	}))[0]
	if conflictBetween(etcd, otherPath) {
		t.Fatalf("different backup paths conflict: %+v / %+v", etcd, otherPath)
	}

	socket := Resources(newTestSubConfig("local", "mysql", map[string]any{
		"socket":   "/var/run/mysqld/mysqld.sock",
		"database": "venus",
	}))[0]
	if socket.Instance != "mysql://socket:/var/run/mysqld/mysqld.sock" {
		t.Fatalf("socket instance = %q", socket.Instance)
	}
	if socket.Label == "" {
		t.Fatal("socket label is empty")
	}
}

func TestResourcesWithoutViperFallsBackToName(t *testing.T) {
	resources := Resources(config.SubConfig{Name: "venus", Type: "mysql"})
	if len(resources) != 1 {
		t.Fatalf("resources = %d, want 1", len(resources))
	}
	resource := resources[0]

	if resource.Instance != "mysql://venus" {
		t.Fatalf("instance = %q, want mysql://venus", resource.Instance)
	}
	if resource.Target != "" {
		t.Fatalf("target = %q, want empty", resource.Target)
	}
	if resource.Label == "" {
		t.Fatal("label is empty")
	}
}

func TestModelResourcesCollectsAllDatabases(t *testing.T) {
	model := config.ModelConfig{
		Name: "venus",
		Databases: map[string]config.SubConfig{
			"mysql-1": newTestSubConfig("mysql-1", "mysql", map[string]any{
				"host":     "10.0.0.1",
				"port":     3306,
				"database": "venus",
			}),
			"redis-1": newTestSubConfig("redis-1", "redis", map[string]any{
				"host":     "10.0.0.1",
				"port":     6379,
				"database": "0",
			}),
		},
	}

	resources := ModelResources(model)
	if len(resources) != 2 {
		t.Fatalf("resources = %d, want 2", len(resources))
	}
	instances := map[string]bool{}
	for _, resource := range resources {
		instances[resource.Instance] = true
		if resource.Label == "" {
			t.Fatalf("resource %+v has an empty label", resource)
		}
	}
	if !instances["mysql://10.0.0.1:3306"] || !instances["redis://10.0.0.1:6379"] {
		t.Fatalf("unexpected instances: %v", instances)
	}

	// 没有数据库的模型返回空集合。
	if empty := ModelResources(config.ModelConfig{Name: "empty"}); len(empty) != 0 {
		t.Fatalf("resources for an empty model = %d, want 0", len(empty))
	}
}

// conflictBetween 借助 task 的互斥规则判断两个资源是否冲突。
func conflictBetween(first, second task.Resource) bool {
	release, err := task.Acquire(testUniqueID("conflict"), "probe", []task.Resource{first})
	if err != nil {
		panic("probe acquire failed: " + err.Error())
	}
	defer release()

	return task.IsConflict(task.Check([]task.Resource{second}))
}

// sequence 保证同一进程内的任务 id 互不相同（Windows 上 time.Now 的精度
// 可能不足以区分紧挨着的两次调用）。
var sequence atomic.Uint64

// testUniqueID 生成不会与并发用例重名的任务 id。
func testUniqueID(prefix string) string {
	return fmt.Sprintf("%s-%d-%d", prefix, time.Now().UnixNano(), sequence.Add(1))
}

func TestResourcesForRealConfigFile(t *testing.T) {
	// 仓库自带的 gobackup_test.yml 已经由包内的 init 载入，这里验证真实配置
	// 也能生成完整的互斥资源。
	if !config.Exist {
		t.Skip("gobackup_test.yml was not loaded")
	}

	model := config.GetModelConfigByName("base_test")
	if model == nil {
		t.Skip("base_test model is not configured")
	}

	resources := ModelResources(*model)
	if len(resources) != len(model.Databases) {
		t.Fatalf("resources = %d, want %d", len(resources), len(model.Databases))
	}
	for _, resource := range resources {
		if resource.Kind != task.KindDatabase {
			t.Fatalf("resource kind = %q, want %q", resource.Kind, task.KindDatabase)
		}
		if resource.Label == "" || resource.Instance == "" {
			t.Fatalf("incomplete resource: %+v", resource)
		}
	}

	// 配置里 dummy_test 用的是 localhost:3306/dummy_test。
	found := false
	for _, resource := range resources {
		if resource.Instance == "mysql://localhost:3306" {
			found = true
			if resource.Target != "mysql://localhost:3306/dummy_test" {
				t.Fatalf("dummy_test target = %q", resource.Target)
			}
		}
	}
	if !found {
		t.Fatalf("mysql instance not found in %+v", resources)
	}

	// archive-only 的模型没有数据库资源。
	if archiveOnly := config.GetModelConfigByName("normal_files"); archiveOnly != nil {
		if resources := ModelResources(*archiveOnly); len(resources) != 0 {
			t.Fatalf("archive-only model resources = %+v, want none", resources)
		}
	}
}

func TestResourcesNilViperDoesNotPanic(t *testing.T) {
	// 配置缺失时各字段为空，只能退化成用名字标识，且不能 panic。
	resource := Resources(config.SubConfig{Name: "venus", Type: "sqlite", Viper: viper.New()})[0]
	if resource.Instance != "sqlite://venus" {
		t.Fatalf("instance = %q, want sqlite://venus", resource.Instance)
	}
	if resource.Target != "" {
		t.Fatalf("target = %q, want empty", resource.Target)
	}

	// path 为相对路径时 filepath.Dir 返回 "."，不应影响后续拼接。
	relative := Resources(newTestSubConfig("venus", "sqlite", map[string]any{"path": "venus.sqlite"}))[0]
	if relative.Instance == "" || relative.Target == "" {
		t.Fatalf("relative sqlite resource is incomplete: %+v", relative)
	}
}
