package web

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/gobackup/gobackup/model"
)

// 下载票据（download ticket）
//
// /api/download 有两种形态：把本地存储的文件流式发给浏览器，或者 302 跳到
// S3/WebDAV 的预签名地址。两种都必须由浏览器自己发起导航，而不是先用 fetch
// 把整个响应读进内存 —— 备份归档动辄几百 MB，读到内存里再转 blob 保存会直接
// 拖垮标签页，也会让 302 跳转失去意义。
//
// 但浏览器原生下载（<a href> / location.assign）带不上 Authorization 头，
// 把账号密码塞进 URL 又等于把口令写进了访问日志和浏览历史。所以这里签发一个
// 一次性、两分钟有效、且只绑定到某个具体文件的票据：前端先请求票据，再让浏览器
// 带着 ?ticket= 去下载。票据用完即焚，且只对 /api/download 生效。
const downloadTicketTTL = 2 * time.Minute

type downloadTicket struct {
	fileKey   string
	expiresAt time.Time
}

var (
	downloadTicketMu sync.Mutex
	downloadTickets  = map[string]downloadTicket{}
)

// downloadTicketKey 把模型名和文件路径拼成票据的绑定键。
func downloadTicketKey(modelName, fileKey string) string {
	return modelName + "\x00" + fileKey
}

func issueDownloadTicket(fileKey string) (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	token := hex.EncodeToString(buf)

	now := time.Now()
	downloadTicketMu.Lock()
	defer downloadTicketMu.Unlock()

	// 签发时顺手清掉过期票据，省掉一个后台清理 goroutine。
	for key, ticket := range downloadTickets {
		if now.After(ticket.expiresAt) {
			delete(downloadTickets, key)
		}
	}

	downloadTickets[token] = downloadTicket{fileKey: fileKey, expiresAt: now.Add(downloadTicketTTL)}
	return token, nil
}

// consumeDownloadTicket 校验并作废票据，只允许使用一次。
func consumeDownloadTicket(token, fileKey string) bool {
	if token == "" {
		return false
	}

	downloadTicketMu.Lock()
	defer downloadTicketMu.Unlock()

	ticket, ok := downloadTickets[token]
	if !ok {
		return false
	}
	delete(downloadTickets, token)

	if time.Now().After(ticket.expiresAt) {
		return false
	}
	return ticket.fileKey == fileKey
}

// isTicketDownloadRequest 判断请求是否打算用票据访问下载接口。
//
// 这类请求在 requireAuth 里直接放行，由 download handler 自己校验票据：
// 否则一个随手编的 ticket 参数就会绕过鉴权。
func isTicketDownloadRequest(request *http.Request) bool {
	return request.URL.Path == "/api/download" && request.URL.Query().Get("ticket") != ""
}

// GET /api/download/ticket?model=xxx&path=
//
// 为某个文件签发一次性下载票据，供浏览器原生下载使用。
func downloadTicketHandler(c *gin.Context) {
	modelName := c.Query("model")
	if model.GetModelByName(modelName) == nil {
		c.AbortWithError(http.StatusNotFound, fmt.Errorf("Model: \"%s\" not found", modelName))
		return
	}

	fileKey := c.Query("path")
	if fileKey == "" {
		c.AbortWithError(http.StatusNotFound, fmt.Errorf("File not found"))
		return
	}

	token, err := issueDownloadTicket(downloadTicketKey(modelName, fileKey))
	if err != nil {
		c.AbortWithError(http.StatusInternalServerError, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"ticket":    token,
		"expiresIn": int(downloadTicketTTL.Seconds()),
	})
}
