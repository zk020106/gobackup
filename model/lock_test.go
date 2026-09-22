package model

import (
	"testing"

	"github.com/spf13/viper"

	"github.com/gobackup/gobackup/config"
	"github.com/gobackup/gobackup/database"
	"github.com/gobackup/gobackup/task"
)

// databaseSubConfig 构造一份 mysql 数据库配置。
func databaseSubConfig(name string) config.SubConfig {
	settings := viper.New()
	settings.Set("host", "10.0.0.1")
	settings.Set("port", 3306)
	settings.Set("database", name)

	return config.SubConfig{Name: name, Type: "mysql", Viper: settings}
}

func TestRunResourcesIncludesModelAndDatabases(t *testing.T) {
	mc := config.ModelConfig{
		Name:      "venus",
		Databases: map[string]config.SubConfig{"venus": databaseSubConfig("venus")},
	}

	resources := runResources(mc)
	if len(resources) != 2 {
		t.Fatalf("resources = %+v, want the model plus one database", resources)
	}

	// 第一个资源代表模型本身：目标就是模型名，这样才能做到同名模型互斥。
	modelResource := resources[0]
	if modelResource.Kind != task.KindModel || modelResource.Target != "venus" || modelResource.Label != "venus" {
		t.Fatalf("model resource = %+v", modelResource)
	}

	// 其余资源来自数据库配置。
	databaseResource := resources[1]
	if databaseResource.Kind != task.KindDatabase {
		t.Fatalf("database resource = %+v", databaseResource)
	}
	if databaseResource.Instance != "mysql://10.0.0.1:3306" {
		t.Fatalf("database instance = %q", databaseResource.Instance)
	}
	if databaseResource.Target != "mysql://10.0.0.1:3306/venus" {
		t.Fatalf("database target = %q", databaseResource.Target)
	}

	// 只有模型、没有数据库时也至少要占用模型本身。
	bare := runResources(config.ModelConfig{Name: "archive-only"})
	if len(bare) != 1 || bare[0].Target != "archive-only" {
		t.Fatalf("resources without databases = %+v", bare)
	}
}

func TestCheckAvailable(t *testing.T) {
	mc := config.ModelConfig{
		Name:      "venus",
		Databases: map[string]config.SubConfig{"venus": databaseSubConfig("venus")},
	}

	// 该模型当前空闲时不应报冲突。
	if err := CheckAvailable(mc); err != nil {
		t.Fatalf("CheckAvailable on a free model error = %v, want nil", err)
	}
	if err := CheckAvailable(config.ModelConfig{}); err != nil {
		t.Fatalf("CheckAvailable on an empty model error = %v, want nil", err)
	}

	// 数据库被别处占用时，CheckAvailable 必须报冲突；
	// 这两个资源固定不变，先确认当前没有被其他用例占用。
	if err := task.Check(database.ModelResources(mc)); err != nil {
		t.Skipf("database resources are already held: %v", err)
	}
	release, err := task.Acquire("model-lock-database-test", "other-model", database.ModelResources(mc))
	if err != nil {
		t.Fatalf("probe Acquire error = %v", err)
	}
	if checkErr := CheckAvailable(mc); !task.IsConflict(checkErr) {
		release()
		t.Fatalf("CheckAvailable with a busy database error = %v, want conflict", checkErr)
	}
	release()

	// 数据库空闲后，同名模型仍然会因为模型本身被占用而冲突。
	releaseModel, err := task.Acquire("model-lock-model-test", mc.Name, []task.Resource{{
		Kind:   task.KindModel,
		Target: mc.Name,
		Label:  mc.Name,
	}})
	if err != nil {
		t.Fatalf("probe Acquire(model) error = %v", err)
	}
	if checkErr := CheckAvailable(mc); !task.IsConflict(checkErr) {
		releaseModel()
		t.Fatalf("CheckAvailable with a busy model error = %v, want conflict", checkErr)
	}
	releaseModel()

	// CheckAvailable 只检查不占用：检查通过后模型仍可被真正占用。
	if err := CheckAvailable(mc); err != nil {
		t.Fatalf("CheckAvailable after release error = %v, want nil", err)
	}
	releaseAgain, err := task.Acquire("model-lock-final-test", mc.Name, runResources(mc))
	if err != nil {
		t.Fatalf("Acquire after CheckAvailable error = %v, want nil", err)
	}
	releaseAgain()
}

func TestClampBytes(t *testing.T) {
	for _, test := range []struct {
		input int64
		want  int64
	}{
		{input: -1, want: 0},
		{input: -1 << 40, want: 0},
		{input: 0, want: 0},
		{input: 1, want: 1},
		{input: 1 << 40, want: 1 << 40},
	} {
		if got := clampBytes(test.input); got != test.want {
			t.Fatalf("clampBytes(%d) = %d, want %d", test.input, got, test.want)
		}
	}
}
