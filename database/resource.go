package database

import (
	"fmt"
	"path/filepath"
	"sort"
	"strings"

	"github.com/gobackup/gobackup/config"
	"github.com/gobackup/gobackup/task"
)

// Resources 返回一个数据库配置对应的并发互斥资源。
//
// 判定用的是配置里能唯一标识「数据库环境」的字段：
//   - socket / uri / endpoints / host:port 之一作为实例标识；
//   - database（sqlite/etcd 用 path，influxdb2 用 bucket）作为具体目标；
//   - all_databases: true 时占用整个实例，同实例下的其他任务都会冲突。
//
// 也可以在数据库配置里写 `exclusive_key: xxx` 手工指定互斥组：拥有相同
// exclusive_key 的数据库（即使是不同类型的库）不会并发执行。
func Resources(cfg config.SubConfig) []task.Resource {
	label := fmt.Sprintf("%s %s", cfg.Type, cfg.Name)

	if key := readExclusiveKey(cfg); key != "" {
		return []task.Resource{{
			Kind:   task.KindDatabase,
			Target: "exclusive:" + key,
			Label:  fmt.Sprintf("%s（exclusive_key=%s）", label, key),
		}}
	}

	instance := task.Instance(cfg.Type, instanceName(cfg))
	resource := task.Resource{
		Kind:     task.KindDatabase,
		Instance: instance,
		Label:    fmt.Sprintf("%s %s", cfg.Type, instanceName(cfg)),
	}

	if target := targetName(cfg); target != "" {
		resource.Target = instance + "/" + target
		resource.Label = fmt.Sprintf("%s %s", cfg.Type, instanceName(cfg)+"/"+target)
	}

	return []task.Resource{resource}
}

// ModelResources 返回模型下所有数据库的互斥资源。
func ModelResources(model config.ModelConfig) []task.Resource {
	resources := make([]task.Resource, 0, len(model.Databases))
	for _, cfg := range model.Databases {
		resources = append(resources, Resources(cfg)...)
	}
	return resources
}

func readExclusiveKey(cfg config.SubConfig) string {
	if cfg.Viper == nil {
		return ""
	}
	return strings.TrimSpace(cfg.Viper.GetString("exclusive_key"))
}

// instanceName 构造数据库实例的可读标识。
func instanceName(cfg config.SubConfig) string {
	viper := cfg.Viper
	if viper == nil {
		return cfg.Name
	}

	if socket := strings.TrimSpace(viper.GetString("socket")); socket != "" {
		return "socket:" + socket
	}
	if uri := strings.TrimSpace(viper.GetString("uri")); uri != "" {
		return uri
	}
	if endpoints := viper.GetStringSlice("endpoints"); len(endpoints) > 0 {
		sorted := append([]string(nil), endpoints...)
		sort.Strings(sorted)
		return "[" + strings.Join(sorted, ",") + "]"
	}

	host := strings.TrimSpace(viper.GetString("host"))
	port := strings.TrimSpace(viper.GetString("port"))
	switch {
	case host != "" && port != "":
		return host + ":" + port
	case host != "":
		return host
	}

	if path := strings.TrimSpace(viper.GetString("path")); path != "" {
		return filepath.Dir(path)
	}
	if dir := strings.TrimSpace(viper.GetString("dir")); dir != "" {
		return dir
	}

	return cfg.Name
}

// targetName 返回实例内的具体目标；为空表示占用整个实例。
func targetName(cfg config.SubConfig) string {
	viper := cfg.Viper
	if viper == nil {
		return ""
	}
	if viper.GetBool("all_databases") {
		return ""
	}

	for _, key := range []string{"database", "bucket", "db", "path", "prefix"} {
		if value := strings.TrimSpace(viper.GetString(key)); value != "" {
			return filepath.Base(value)
		}
	}

	return ""
}
