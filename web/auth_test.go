package web

import (
	"bytes"
	"encoding/base64"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gobackup/gobackup/config"
)

// invokeRawHeaders 与 invokeRaw 相同，但可以带上额外的请求头（例如认证头）。
func invokeRawHeaders(
	t *testing.T,
	router http.Handler,
	method, path string,
	body []byte,
	headers map[string]string,
) (int, string) {
	t.Helper()

	var reader io.Reader
	if len(body) > 0 {
		reader = bytes.NewReader(body)
	}

	request, err := http.NewRequest(method, path, reader)
	if err != nil {
		t.Fatal(err)
	}
	if len(body) > 0 {
		request.Header.Set("Content-Type", "application/json")
	}
	for key, value := range headers {
		request.Header.Set(key, value)
	}

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	return recorder.Code, recorder.Body.String()
}

// basicAuthHeader 返回当前配置对应的 Basic 认证头。
func basicAuthHeader() map[string]string {
	if config.Web.Username == "" || config.Web.Password == "" {
		return nil
	}

	token := base64.StdEncoding.EncodeToString([]byte(config.Web.Username + ":" + config.Web.Password))
	return map[string]string{"Authorization": "Basic " + token}
}

// TestAPIRequiresAuth 是回归用例：以前 requireAuth 是在 setupRouter 之后才
// r.Use 的，而 gin 的 Use 只对之后注册的路由生效，结果所有 /api 接口都没有
// 鉴权（线上 8899 暴露在公网时能直接读写配置）。
func TestAPIRequiresAuth(t *testing.T) {
	if !webAuthConfigured() {
		t.Skip("测试配置没有开启 web 鉴权")
	}

	router := setupRouter("test")
	cases := []struct {
		method string
		path   string
	}{
		{http.MethodGet, "/api/config"},
		{http.MethodGet, "/api/config/editor"},
		{http.MethodGet, "/api/runs"},
		{http.MethodGet, "/api/tasks"},
		{http.MethodGet, "/api/log?tail=5&follow=0"},
		{http.MethodPost, "/api/perform"},
	}

	for _, item := range cases {
		status, body := invokeRaw(t, router, item.method, item.path, nil)
		if status != http.StatusUnauthorized {
			t.Fatalf("%s %s 未鉴权时应返回 401，实际 %d: %s", item.method, item.path, status, body)
		}
	}

	// 带上正确凭据后应当放行。
	status, _ := invokeRawHeaders(t, router, http.MethodGet, "/api/config", nil, basicAuthHeader())
	if status != http.StatusOK {
		t.Fatalf("带 Basic 凭据访问 /api/config 应为 200，实际 %d", status)
	}

	// 密码错误仍然拒绝。
	bad := base64.StdEncoding.EncodeToString([]byte(config.Web.Username + ":wrong-password"))
	status, _ = invokeRawHeaders(t, router, http.MethodGet, "/api/config", nil, map[string]string{
		"Authorization": "Basic " + bad,
	})
	if status != http.StatusUnauthorized {
		t.Fatalf("错误密码应返回 401，实际 %d", status)
	}
}

// TestAuthExemptions 覆盖不需要鉴权的入口：登录接口与服务状态。
func TestAuthExemptions(t *testing.T) {
	router := setupRouter("test")

	// 非 /api 路径不拦截。
	if status, _ := invokeRaw(t, router, http.MethodGet, "/status", nil); status != http.StatusOK {
		t.Fatalf("/status 应当公开，实际 %d", status)
	}

	// 登录接口本身必须能在未鉴权时调用：缺参数是 400（而不是 401），
	// 凭据正确时返回 200。
	status, _ := invokeRaw(t, router, http.MethodPost, "/api/auth/login", []byte(`{}`))
	if status != http.StatusBadRequest {
		t.Fatalf("空登录请求应返回 400（说明未被鉴权拦截），实际 %d", status)
	}

	if !webAuthConfigured() {
		return
	}

	payload := []byte(`{"username":"` + config.Web.Username + `","password":"` + config.Web.Password + `"}`)
	status, body := invokeRaw(t, router, http.MethodPost, "/api/auth/login", payload)
	if status != http.StatusOK {
		t.Fatalf("正确凭据登录应为 200，实际 %d: %s", status, body)
	}
}

// TestBearerTokenWorks 覆盖前端使用的 Bearer 方式（token 就是 base64(user:pass)）。
func TestBearerTokenWorks(t *testing.T) {
	if !webAuthConfigured() {
		t.Skip("测试配置没有开启 web 鉴权")
	}

	router := setupRouter("test")
	token := encodeAuthToken(config.Web.Username, config.Web.Password)

	status, _ := invokeRawHeaders(t, router, http.MethodGet, "/api/config", nil, map[string]string{
		"Authorization": "Bearer " + token,
	})
	if status != http.StatusOK {
		t.Fatalf("Bearer 令牌访问 /api/config 应为 200，实际 %d", status)
	}
}
