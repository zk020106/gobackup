package web

import (
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/gobackup/gobackup/config"
)

// 登录会话与 web.username / web.password 绑定，不做状态存储：
// accessToken 就是 base64(username:password)，服务端每次请求重新校验，
// 重启进程后旧 token 依然有效，也不需要额外的数据库或缓存。

type authSessionResponse struct {
	AccessToken  string   `json:"accessToken"`
	RefreshToken string   `json:"refreshToken"`
	User         authUser `json:"user"`
}

type authUser struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Permissions []string `json:"permissions"`
	Roles       []string `json:"roles"`
}

type authLoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type authRefreshRequest struct {
	RefreshToken string `json:"refreshToken" binding:"required"`
}

func webAuthConfigured() bool {
	return config.Web.Username != "" && config.Web.Password != ""
}

func encodeAuthToken(username, password string) string {
	return base64.StdEncoding.EncodeToString([]byte(username + ":" + password))
}

func decodeAuthToken(token string) (string, string, bool) {
	decoded, err := base64.StdEncoding.DecodeString(strings.TrimSpace(token))
	if err != nil {
		return "", "", false
	}
	username, password, found := strings.Cut(string(decoded), ":")
	if !found {
		return "", "", false
	}
	return username, password, true
}

func validCredentials(username, password string) bool {
	if !webAuthConfigured() {
		return true
	}
	expectedUser := subtle.ConstantTimeCompare([]byte(username), []byte(config.Web.Username))
	expectedPassword := subtle.ConstantTimeCompare([]byte(password), []byte(config.Web.Password))
	return expectedUser == 1 && expectedPassword == 1
}

func credentialsFromRequest(request *http.Request) (string, string, bool) {
	header := request.Header.Get("Authorization")
	if header == "" {
		return "", "", false
	}

	scheme, value, found := strings.Cut(header, " ")
	if !found {
		return "", "", false
	}

	switch strings.ToLower(scheme) {
	case "basic":
		decoded, err := base64.StdEncoding.DecodeString(strings.TrimSpace(value))
		if err != nil {
			return "", "", false
		}
		username, password, found := strings.Cut(string(decoded), ":")
		return username, password, found
	case "bearer":
		return decodeAuthToken(value)
	default:
		return "", "", false
	}
}

func buildAuthSession(username, password string) authSessionResponse {
	token := encodeAuthToken(username, password)
	return authSessionResponse{
		AccessToken:  token,
		RefreshToken: token,
		User: authUser{
			ID:          username,
			Name:        username,
			Permissions: []string{"*"},
			Roles:       []string{"owner"},
		},
	}
}

// requireAuth protects every /api endpoint except /api/auth/login. It accepts
// both HTTP Basic credentials and the Bearer token issued by /api/auth/login,
// so the browser's cached Basic credentials keep working while the web UI can
// store a session token.
func requireAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		path := c.Request.URL.Path
		if !strings.HasPrefix(path, "/api/") || path == "/api/auth/login" {
			c.Next()
			return
		}
		if !webAuthConfigured() {
			c.Next()
			return
		}

		username, password, ok := credentialsFromRequest(c.Request)
		if ok && validCredentials(username, password) {
			c.Next()
			return
		}

		// 下载接口允许改用一次性票据，因为浏览器原生下载带不上 Authorization
		// 头。这里只是放行，真正的票据校验在 download handler 里做。
		if isTicketDownloadRequest(c.Request) {
			c.Next()
			return
		}

		c.Header("WWW-Authenticate", `Basic realm="GoBackup"`)
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"message": "authentication required"})
	}
}

// POST /api/auth/login
func authLogin(c *gin.Context) {
	var request authLoginRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeConfigEditorError(c, http.StatusBadRequest, fmt.Errorf("username and password are required"))
		return
	}

	if !validCredentials(request.Username, request.Password) {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"message": "账号或密码不正确"})
		return
	}

	c.JSON(http.StatusOK, buildAuthSession(request.Username, request.Password))
}

// POST /api/auth/logout
func authLogout(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"message": "logged out"})
}

// GET /api/auth/me
func authMe(c *gin.Context) {
	username, password, ok := credentialsFromRequest(c.Request)
	if !ok || !validCredentials(username, password) {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"message": "authentication required"})
		return
	}
	c.JSON(http.StatusOK, buildAuthSession(username, password).User)
}

// POST /api/auth/refresh
func authRefresh(c *gin.Context) {
	var request authRefreshRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeConfigEditorError(c, http.StatusBadRequest, fmt.Errorf("refreshToken is required"))
		return
	}

	username, password, ok := decodeAuthToken(request.RefreshToken)
	if !ok || !validCredentials(username, password) {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"message": "登录已过期，请重新登录"})
		return
	}

	c.JSON(http.StatusOK, buildAuthSession(username, password))
}
