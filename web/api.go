package web

import (
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/gobackup/gobackup/config"
	"github.com/gobackup/gobackup/logger"
	"github.com/gobackup/gobackup/model"
	"github.com/gobackup/gobackup/runlog"
	"github.com/gobackup/gobackup/storage"
	"github.com/gobackup/gobackup/task"

	// Register Prometheus metrics
	_ "github.com/gobackup/gobackup/metrics"
)

//go:embed dist
var staticFS embed.FS

type embedFileSystem struct {
	http.FileSystem
	indexes bool
}

func (e embedFileSystem) Exists(prefix string, path string) bool {
	f, err := e.Open(path)
	if err != nil {
		return false
	}

	// check if indexing is allowed
	s, _ := f.Stat()
	if s.IsDir() && !e.indexes {
		return false
	}

	return true
}

// StartHTTP run API server
func StartHTTP(version string) (err error) {
	currentVersion = version
	logger := logger.Tag("API")

	if len(config.Web.Password) == 0 {
		logger.Warn("You are running with insecure API server. Please don't forget setup `web.password` in config file for more safety.")
	}

	// The state dir may not exist yet (a fresh Windows install), and the log
	// file cannot be created without it. The file itself is opened per request
	// by the log streamer, so a missing log file no longer stops the server.
	if err = os.MkdirAll(filepath.Dir(config.LogFilePath), 0o755); err != nil {
		logger.Warnf("Failed to create log directory %s: %v", filepath.Dir(config.LogFilePath), err)
	}

	logger.Infof("Starting API server on port http://%s:%s", config.Web.Host, config.Web.Port)

	if os.Getenv("GO_ENV") == "dev" {
		go func() {
			for {
				time.Sleep(5 * time.Second)
				logger.Info("Ping", time.Now())
			}
		}()
	} else {
		gin.SetMode(gin.ReleaseMode)
	}

	r := setupRouter(version)
	serveFrontend(r)

	return r.Run(config.Web.Host + ":" + config.Web.Port)
}

// indexETag 是嵌入的 index.html 的内容指纹。
//
// embed.FS 的文件 modtime 是零值，http.FileServer 因此既不会发 Last-Modified
// 也不会发 ETag，浏览器只能靠启发式缓存自己猜——这正是「发布新版后前端打不开」
// 的根源之一。这里自己算一个指纹，让 index.html 能被正确校验。
var indexETag = computeIndexETag()

func computeIndexETag() string {
	data, err := staticFS.ReadFile("dist/index.html")
	if err != nil {
		return ""
	}
	sum := sha256.Sum256(data)
	return `"` + hex.EncodeToString(sum[:8]) + `"`
}

// serveFrontend 负责把嵌入的前端产物发给浏览器，并按路径设置缓存策略。
//
// 在此之前所有静态响应都不带任何缓存头，于是有两个后果：
//
//   - 资源文件名带内容 hash 却完全不能缓存，每次刷新都要重下 2 MB 左右；
//   - index.html 没有任何校验器，浏览器会一直拿启发式缓存里的旧 index.html，
//     去请求上一版早已改名的 chunk。
//
// 更糟的是 NoRoute 会把缺失的 /assets/*.js 也回成 index.html（200 text/html），
// 浏览器按模块脚本执行时只报一条 MIME 错误然后白屏，界面上完全看不出原因。
//
// 现在的策略：
//
//   - /assets/*：文件名带内容 hash，强缓存一年 + immutable；
//   - index.html 与 SPA 回退路由：no-cache + ETag，每次回源校验，发新版立即生效；
//   - 其它静态文件：no-cache；
//   - 缺失的 /assets/*：明确 404，而不是静默回 index.html。
//
// 必须在注册路由之后、r.NoRoute 之前调用：gin 的 Use 只影响「之后注册」的
// handler 链，静态与 SPA 请求都落在 NoRoute 上，所以这里的中间件对它们生效。
func serveFrontend(r *gin.Engine) {
	fe, err := fs.Sub(staticFS, "dist")
	if err != nil {
		logger.Tag("API").Errorf("Failed to mount embedded web assets: %v", err)
		return
	}
	embedFs := embedFileSystem{http.FS(fe), true}

	r.Use(func(c *gin.Context) {
		urlPath := c.Request.URL.Path

		switch {
		case strings.HasPrefix(urlPath, "/api/"):
			// API 响应自己决定缓存策略。
		case strings.HasPrefix(urlPath, "/assets/"):
			c.Header("Cache-Control", "public, max-age=31536000, immutable")
		default:
			c.Header("Cache-Control", "no-cache")
			if isIndexResponse(fe, urlPath) && indexETag != "" {
				c.Header("ETag", indexETag)
				if etagMatches(c.GetHeader("If-None-Match"), indexETag) {
					c.Status(http.StatusNotModified)
					c.Abort()
					return
				}
			}
		}

		c.Next()
	})

	r.Use(static.Serve("/", embedFs))

	r.NoRoute(func(c *gin.Context) {
		urlPath := c.Request.URL.Path

		if strings.HasPrefix(urlPath, "/api/") {
			c.JSON(http.StatusNotFound, gin.H{"message": "not found"})
			return
		}

		// 构建产物缺失时必须报错。回退成 index.html 会让浏览器把 HTML 当成
		// JS 模块执行，只留下一条 MIME 报错和一片白屏。
		if strings.HasPrefix(urlPath, "/assets/") {
			c.String(http.StatusNotFound, "asset not found: %s", urlPath)
			return
		}

		// 其余路径交给前端路由（/overview、/tasks 等）。
		c.FileFromFS("/", embedFs)
	})
}

// isIndexResponse 判断这个路径最终会不会由 index.html 响应：
// 也就是入口本身，以及所有没有对应静态文件的前端路由。
func isIndexResponse(fsys fs.FS, urlPath string) bool {
	name := strings.TrimPrefix(path.Clean("/"+urlPath), "/")
	if name == "" || name == "index.html" {
		return true
	}

	info, err := fs.Stat(fsys, name)
	return err != nil || info.IsDir()
}

// etagMatches 按 RFC 9110 比较 If-None-Match，支持逗号分隔列表、W/ 前缀与 *。
func etagMatches(header, etag string) bool {
	header = strings.TrimSpace(header)
	if header == "" {
		return false
	}
	if header == "*" {
		return true
	}
	for _, candidate := range strings.Split(header, ",") {
		if strings.TrimPrefix(strings.TrimSpace(candidate), "W/") == etag {
			return true
		}
	}
	return false
}

func setupRouter(version string) *gin.Engine {
	r := gin.Default()

	// 鉴权必须在这里注册：gin 的 Use 只对「之后注册」的路由生效，
	// 以前在 setupRouter 返回之后再 Use，导致所有 /api 路由实际上都没被保护。
	// Protect /api with HTTP Basic / Bearer token auth. Static assets and the
	// login endpoint stay public so the login page itself can load.
	r.Use(requireAuth())

	r.GET("/status", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"message": "GoBackup is running.",
			"version": version,
		})
	})

	// Prometheus metrics endpoint
	r.GET("/metrics", gin.WrapH(promhttp.Handler()))

	r.Use(func(c *gin.Context) {
		c.Next()

		// Skip if no errors
		if len(c.Errors) == 0 {
			return
		}

		c.AbortWithStatusJSON(c.Writer.Status(), gin.H{
			"message": c.Errors.String(),
		})

	})

	group := r.Group("/api")
	group.POST("/auth/login", authLogin)
	group.POST("/auth/logout", authLogout)
	group.GET("/auth/me", authMe)
	group.POST("/auth/refresh", authRefresh)
	group.GET("/status", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"message": "GoBackup is running.",
			"version": version,
		})
	})
	group.GET("/config", getConfig)
	group.GET("/config/editor", getConfigEditor)
	group.PATCH("/config/editor", patchConfigEditor)
	group.POST("/config/editor/validate", validateConfigEditor)
	group.POST("/config/editor/reload", reloadConfigEditor)
	group.POST("/config/probe", probeConfig)
	group.GET("/list", list)
	group.GET("/download", download)
	group.GET("/download/ticket", downloadTicketHandler)
	group.POST("/perform", perform)
	group.GET("/log", log)
	group.GET("/log/download", downloadLog)
	group.GET("/system/environment", getSystemEnvironment)
	group.GET("/tasks", listTasks)
	group.GET("/runs", listRuns)
	group.GET("/runs/:id", getRun)
	group.GET("/runs/:id/log", getRunLog)
	group.GET("/runs/:id/log/stream", streamRunLog)
	group.DELETE("/runs/:id", deleteRun)
	return r
}

// GET /api/log/download
func downloadLog(c *gin.Context) {
	c.Header("Content-Disposition", `attachment; filename="gobackup.log"`)
	c.Header("Content-Type", "text/plain; charset=utf-8")
	c.File(config.LogFilePath)
}

// GET /api/config
func getConfig(c *gin.Context) {
	models := map[string]any{}
	for _, m := range model.GetModels() {
		databases := make([]gin.H, 0, len(m.Config.Databases))
		for _, db := range m.Config.Databases {
			databases = append(databases, gin.H{
				"name": db.Name,
				"type": db.Type,
			})
		}
		sort.Slice(databases, func(i, j int) bool {
			return databases[i]["name"].(string) < databases[j]["name"].(string)
		})

		models[m.Config.Name] = gin.H{
			"description":   m.Config.Description,
			"schedule":      m.Config.Schedule,
			"schedule_info": m.Config.Schedule.String(),
			"databases":     databases,
			"running":       task.IsModelRunning(m.Config.Name),
			"conflict":      conflictMessage(model.CheckAvailable(m.Config)),
		}
	}

	c.JSON(200, gin.H{
		"models":  models,
		"running": runlog.RunningCount(),
	})
}

// conflictMessage 把冲突错误转成给界面展示的字符串，没有冲突时返回空串。
func conflictMessage(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

// POST /api/perform
func perform(c *gin.Context) {
	type performParam struct {
		Model string `form:"model" json:"model" binding:"required"`
	}

	var param performParam
	if err := c.Bind(&param); err != nil {
		logger.Errorf("Bind error: %v", err)
	}

	m := model.GetModelByName(param.Model)
	if m == nil {
		c.AbortWithError(404, fmt.Errorf("Model: \"%s\" not found", param.Model))
		return
	}

	// Start 会同步完成「占用数据库环境/模型 + 创建运行记录」，所以冲突能
	// 立即反馈给用户，不会出现先提示成功、后台才失败的情况。
	handle, err := m.Start("api")
	if err != nil {
		if task.IsConflict(err) {
			c.JSON(http.StatusConflict, gin.H{
				"message":  err.Error(),
				"conflict": true,
			})
			return
		}
		c.AbortWithError(http.StatusInternalServerError, err)
		return
	}

	go func() {
		if runErr := handle.Run(); runErr != nil {
			logger.Errorf("Perform error: %v", runErr)
		}
	}()

	c.JSON(200, gin.H{"message": fmt.Sprintf("Backup: %s performed in background.", param.Model)})
}

// GET /api/tasks?model=&limit=&include_finished=
//
// 返回任务中心需要的任务列表：进行中的任务带实时进度，历史任务作为记录。
func listTasks(c *gin.Context) {
	limit := 50
	if raw := c.Query("limit"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 && parsed <= runlog.MaxRuns {
			limit = parsed
		}
	}

	modelName := c.Query("model")
	includeFinished := c.Query("include_finished") != "0"

	running := make([]*runlog.Run, 0)
	for _, run := range runlog.Running() {
		if modelName != "" && run.Model != modelName {
			continue
		}
		running = append(running, run)
	}

	tasks := running
	if includeFinished {
		history, err := runlog.List(modelName, limit)
		if err != nil {
			c.AbortWithError(http.StatusInternalServerError, err)
			return
		}

		seen := make(map[string]struct{}, len(running))
		for _, run := range running {
			seen[run.ID] = struct{}{}
		}
		for _, run := range history {
			if _, ok := seen[run.ID]; ok {
				continue
			}
			tasks = append(tasks, run)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"tasks":   tasks,
		"running": len(running),
		"total":   len(tasks),
	})
}

// GET /api/list?model=xxx&parent=
func list(c *gin.Context) {
	modelName := c.Query("model")
	m := model.GetModelByName(modelName)
	if m == nil {
		c.AbortWithError(404, fmt.Errorf("Model: \"%s\" not found", modelName))
		return
	}

	parent := c.Query("parent")
	if parent == "" {
		parent = "/"
	}

	files, err := storage.List(m.Config, parent)
	if err != nil {
		c.AbortWithError(500, err)
		return
	}

	c.JSON(200, gin.H{"files": files})
}

// GET /api/download?model=xxx&path=
func download(c *gin.Context) {
	modelName := c.Query("model")
	m := model.GetModelByName(modelName)
	if m == nil {
		c.AbortWithError(404, fmt.Errorf("Model: \"%s\" not found", modelName))
		return
	}

	file := c.Query("path")
	if file == "" {
		c.AbortWithError(404, fmt.Errorf("File not found"))
		return
	}

	// 带票据访问时（浏览器原生下载）在这里校验并作废票据；
	// 没带票据说明 requireAuth 已经验过了 Authorization 头。
	if ticket := c.Query("ticket"); ticket != "" && !consumeDownloadTicket(ticket, downloadTicketKey(modelName, file)) {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"message": "下载链接已失效，请重新点击下载"})
		return
	}

	// 本地存储给不出可跳转的 URL，直接把文件读出来发给浏览器；
	// 其它存储（S3 / WebDAV / ...）仍然用 302 跳到预签名地址。
	if localPath, isLocal, err := storage.LocalPath(m.Config, file); isLocal {
		if err != nil {
			c.AbortWithError(404, err)
			return
		}
		c.FileAttachment(localPath, filepath.Base(localPath))
		return
	}

	downloadURL, err := storage.Download(m.Config, file)
	if err != nil {
		c.AbortWithError(500, err)
		return
	}
	if len(downloadURL) == 0 {
		c.AbortWithError(500, fmt.Errorf("存储 %s 未返回下载地址", m.Config.DefaultStorage))
		return
	}

	c.Redirect(302, downloadURL)
}

// GET /api/log?tail=200&offset=0&follow=1
//
// 以纯文本流的形式返回服务日志：先补发末尾 tail 行（默认 200 行），随后持续
// 跟随新增内容。每个连接独立打开文件，互不影响；客户端断开即结束。
func log(c *gin.Context) {
	tailLines := DefaultLogTailLines
	if raw := c.Query("tail"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil {
			switch {
			case parsed <= 0:
				tailLines = 0
			case parsed > MaxLogTailLines:
				tailLines = MaxLogTailLines
			default:
				tailLines = parsed
			}
		}
	}

	var offset int64
	if raw := c.Query("offset"); raw != "" {
		if parsed, err := strconv.ParseInt(raw, 10, 64); err == nil && parsed > 0 {
			offset = parsed
			tailLines = 0
		}
	}

	follow := c.Query("follow") != "0"

	writer := c.Writer
	writer.Header().Set("Content-Type", "text/plain; charset=utf-8")
	writer.Header().Set("Cache-Control", "no-cache, no-transform")
	// 反向代理（nginx 等）默认会缓冲响应，必须显式关闭，否则浏览器在
	// 缓冲区被填满之前收不到任何日志行，页面看起来就是「一直没有渲染」。
	writer.Header().Set("X-Accel-Buffering", "no")
	writer.WriteHeader(http.StatusOK)
	writer.Flush()

	err := streamFile(c.Request.Context(), writer, writer.Flush, logStreamOptions{
		Path:      config.LogFilePath,
		Offset:    offset,
		TailLines: tailLines,
		Follow:    follow,
	})
	if err != nil {
		logger.Debugf("Log stream finished: %v", err)
	}
}
