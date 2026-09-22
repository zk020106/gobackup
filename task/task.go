// Package task 维护「正在进行的备份任务」的并发互斥。
//
// 规则（对应产品需求）：
//   - 同一个数据库环境（同一个 type + 实例 + 库/路径）不允许同时存在多条
//     进行中的任务；配置了 all_databases 的数据库占用整个实例；
//   - 同一个模型不允许并发执行（它们共用同一个临时目录，并发会互相覆盖）。
//
// 不同模型、不同数据库环境之间可以自由并行，所以调度任务、网页触发和 CLI
// 可以同时跑多个备份。判定细节见 conflicts()。
package task

import (
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"
)

// 资源种类。
const (
	KindModel    = "model"
	KindDatabase = "database"
)

// Resource 描述一个需要独占的资源。
//
// Instance 是实例级标识（例如 mysql://172.16.0.5:3306），Target 是具体目标
// （例如 mysql://172.16.0.5:3306/venus）。Target 为空表示该任务占用整个实例
// （例如 all_databases: true），此时同实例下的任何任务都会冲突。
type Resource struct {
	Kind     string `json:"kind"`
	Instance string `json:"instance,omitempty"`
	Target   string `json:"target,omitempty"`
	Label    string `json:"label,omitempty"`
}

// Holder 描述一个正在进行的任务。
type Holder struct {
	ID        string     `json:"id"`
	RunID     string     `json:"run_id,omitempty"`
	Model     string     `json:"model"`
	Label     string     `json:"label,omitempty"`
	StartedAt time.Time  `json:"started_at"`
	Resources []Resource `json:"resources,omitempty"`
}

// DisplayID 返回用于展示的任务编号，优先使用运行记录 id。
func (h Holder) DisplayID() string {
	if h.RunID != "" {
		return h.RunID
	}
	return h.ID
}

// ConflictError 表示任务因为资源被占用而无法启动。
type ConflictError struct {
	Resource Resource
	HeldBy   Holder
}

func (e *ConflictError) Error() string {
	scope := "数据库环境"
	if e.Resource.Kind == KindModel {
		scope = "模型"
	}

	label := e.Resource.Label
	if label == "" {
		label = e.Resource.Target
	}
	if label == "" {
		label = e.Resource.Instance
	}

	held := e.HeldBy.Label
	if held == "" {
		held = e.HeldBy.Model
	}

	return fmt.Sprintf(
		"同一%s已有进行中的任务：%s 正在执行备份（任务 %s，模型 %s，开始于 %s），请等待其完成后再试",
		scope,
		label,
		e.HeldBy.DisplayID(),
		held,
		e.HeldBy.StartedAt.Format("2006-01-02 15:04:05"),
	)
}

// IsConflict 判断错误是否为资源冲突。
func IsConflict(err error) bool {
	_, ok := err.(*ConflictError)
	return ok
}

var registry = struct {
	sync.Mutex
	holders map[string]*Holder
}{holders: map[string]*Holder{}}

// Acquire 为任务 id 占用一组资源。成功时返回释放函数（可重复调用）。
//
// 与已有任务冲突时不登记，直接返回 *ConflictError。
func Acquire(id, modelName string, resources []Resource) (func(), error) {
	registry.Lock()
	defer registry.Unlock()

	// 同一个 id 重复登记会互相覆盖持有信息，这里直接拒绝（调用方用的是
	// 唯一 token，正常路径不会触发）。
	if _, exists := registry.holders[id]; exists {
		return nil, fmt.Errorf("任务 %s 已经在运行中", id)
	}

	for _, resource := range resources {
		for _, holder := range registry.holders {
			if holder.ID == id {
				continue
			}
			for _, held := range holder.Resources {
				if conflicts(resource, held) {
					return nil, &ConflictError{Resource: resource, HeldBy: *holder}
				}
			}
		}
	}

	holder := &Holder{
		ID:        id,
		Model:     modelName,
		Label:     modelName,
		StartedAt: time.Now(),
		Resources: resources,
	}
	registry.holders[id] = holder

	var once sync.Once
	return func() {
		once.Do(func() {
			registry.Lock()
			defer registry.Unlock()
			delete(registry.holders, id)
		})
	}, nil
}

// Check 只检查资源是否被占用，不登记任何东西。用于在真正启动任务前给
// 调用方（例如网页接口）一个即时的冲突反馈。
func Check(resources []Resource) error {
	registry.Lock()
	defer registry.Unlock()

	for _, resource := range resources {
		for _, holder := range registry.holders {
			for _, held := range holder.Resources {
				if conflicts(resource, held) {
					return &ConflictError{Resource: resource, HeldBy: *holder}
				}
			}
		}
	}

	return nil
}

// BindRunID 把占位 id 关联到真正的运行记录 id，仅用于展示。
func BindRunID(id, runID string) {
	registry.Lock()
	defer registry.Unlock()

	if holder, ok := registry.holders[id]; ok {
		holder.RunID = runID
	}
}

// IsModelRunning 判断指定模型是否有正在进行的任务。
func IsModelRunning(modelName string) bool {
	registry.Lock()
	defer registry.Unlock()

	for _, holder := range registry.holders {
		if holder.Model == modelName {
			return true
		}
	}
	return false
}

// Running 返回当前正在进行的任务，按开始时间升序。
func Running() []Holder {
	registry.Lock()
	defer registry.Unlock()

	holders := make([]Holder, 0, len(registry.holders))
	for _, holder := range registry.holders {
		holders = append(holders, *holder)
	}
	sort.Slice(holders, func(i, j int) bool {
		return holders[i].StartedAt.Before(holders[j].StartedAt)
	})
	return holders
}

// conflicts 判断两个资源是否互斥。
func conflicts(a, b Resource) bool {
	if a.Kind != b.Kind {
		return false
	}
	if a.Target != "" && b.Target != "" {
		return a.Target == b.Target
	}
	// 其中一方占用整个实例，同实例即冲突。
	if a.Instance == "" || b.Instance == "" {
		return false
	}
	return a.Instance == b.Instance
}

// Instance 构造实例级标识。
func Instance(kind, name string) string {
	return strings.TrimSpace(kind) + "://" + strings.TrimSpace(name)
}
