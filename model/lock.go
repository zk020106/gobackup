package model

import (
	"fmt"
	"sync/atomic"
	"time"

	"github.com/gobackup/gobackup/config"
	"github.com/gobackup/gobackup/database"
	"github.com/gobackup/gobackup/task"
)

var lockSequence uint64

// runResources 返回一次备份需要独占的资源：模型本身 + 所有数据库环境。
func runResources(mc config.ModelConfig) []task.Resource {
	resources := make([]task.Resource, 0, len(mc.Databases)+1)
	resources = append(resources, task.Resource{
		Kind:   task.KindModel,
		Target: mc.Name,
		Label:  mc.Name,
	})
	return append(resources, database.ModelResources(mc)...)
}

// CheckAvailable 检查模型当前是否可以立即开始备份，冲突时返回 *task.ConflictError。
func CheckAvailable(mc config.ModelConfig) error {
	return task.Check(runResources(mc))
}

// acquireRunLock 占用本次备份需要的资源：模型本身 + 模型下所有数据库环境。
//
// 返回的 bind 用于把占位 id 替换成真正的运行记录 id，这样冲突提示里能直接
// 给出正在执行的任务编号。
func acquireRunLock(mc config.ModelConfig) (release func(), bind func(runID string), err error) {
	token := fmt.Sprintf(
		"%s-%d-%d",
		mc.Name,
		time.Now().UnixNano(),
		atomic.AddUint64(&lockSequence, 1),
	)

	unlock, err := task.Acquire(token, mc.Name, runResources(mc))
	if err != nil {
		return nil, nil, err
	}

	return unlock, func(runID string) {
		if runID != "" {
			task.BindRunID(token, runID)
		}
	}, nil
}

// clampBytes 把可能为负的字节数归零。
func clampBytes(value int64) int64 {
	if value < 0 {
		return 0
	}
	return value
}
