package web

import (
	"fmt"
	"net/http"
	"os"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/gobackup/gobackup/logger"
	"github.com/gobackup/gobackup/runlog"
)

// GET /api/runs?model=&limit=
func listRuns(c *gin.Context) {
	limit := 50
	if raw := c.Query("limit"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 && parsed <= runlog.MaxRuns {
			limit = parsed
		}
	}

	runs, err := runlog.List(c.Query("model"), limit)
	if err != nil {
		c.AbortWithError(http.StatusInternalServerError, err)
		return
	}

	// 进行中的任务用内存里的实时快照覆盖磁盘上按秒节流的进度。
	for index, run := range runs {
		if live := runlog.LiveSnapshot(run.ID); live != nil {
			runs[index] = live
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"runs":  runs,
		"total": len(runs),
	})
}

// GET /api/runs/:id
func getRun(c *gin.Context) {
	run, err := runlog.Get(c.Param("id"))
	if err != nil {
		if os.IsNotExist(err) {
			c.AbortWithError(http.StatusNotFound, fmt.Errorf("Run record not found"))
			return
		}
		c.AbortWithError(http.StatusInternalServerError, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"run": run})
}

// GET /api/runs/:id/log?download=1
func getRunLog(c *gin.Context) {
	id := c.Param("id")
	logPath, err := runlog.LogPath(id)
	if err != nil {
		c.AbortWithError(http.StatusBadRequest, err)
		return
	}
	if _, err := os.Stat(logPath); err != nil {
		c.AbortWithError(http.StatusNotFound, fmt.Errorf("Run log not found"))
		return
	}

	name := id + ".log"
	if c.Query("download") != "" {
		c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%q", name))
	}
	c.Header("Content-Type", "text/plain; charset=utf-8")
	c.File(logPath)
}

// GET /api/runs/:id/log/stream?offset=0&tail=0
//
// 实时输出某次备份的运行日志：默认从头开始，任务仍在进行时持续跟随，
// 任务结束后自动收尾。任务中心用它来展示「任务日志」。
func streamRunLog(c *gin.Context) {
	id := c.Param("id")
	logPath, err := runlog.LogPath(id)
	if err != nil {
		c.AbortWithError(http.StatusBadRequest, err)
		return
	}
	if _, err := os.Stat(logPath); err != nil {
		c.AbortWithError(http.StatusNotFound, fmt.Errorf("Run log not found"))
		return
	}

	var offset int64
	if raw := c.Query("offset"); raw != "" {
		if parsed, parseErr := strconv.ParseInt(raw, 10, 64); parseErr == nil && parsed > 0 {
			offset = parsed
		}
	}

	tailLines := 0
	if raw := c.Query("tail"); raw != "" {
		if parsed, parseErr := strconv.Atoi(raw); parseErr == nil && parsed > 0 {
			tailLines = parsed
		}
	}
	if tailLines > MaxLogTailLines {
		tailLines = MaxLogTailLines
	}

	writer := c.Writer
	writer.Header().Set("Content-Type", "text/plain; charset=utf-8")
	writer.Header().Set("Cache-Control", "no-cache, no-transform")
	writer.Header().Set("X-Accel-Buffering", "no")
	writer.Header().Set("X-Run-Running", strconv.FormatBool(runlog.IsActive(id)))
	writer.WriteHeader(http.StatusOK)
	writer.Flush()

	err = streamFile(c.Request.Context(), writer, writer.Flush, logStreamOptions{
		Path:      logPath,
		Offset:    offset,
		TailLines: tailLines,
		Follow:    true,
		// 任务结束后把剩余内容发完就结束，避免前端一直挂着连接。
		Done: func() bool { return !runlog.IsActive(id) },
	})
	if err != nil {
		logger.Debugf("Run log stream finished: %v", err)
	}
}

// DELETE /api/runs/:id
func deleteRun(c *gin.Context) {
	if err := runlog.Delete(c.Param("id")); err != nil {
		c.AbortWithError(http.StatusInternalServerError, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "run record deleted"})
}
