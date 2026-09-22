package web

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

// newFrontendRouter 组装一个带前端静态资源的路由，和 StartHTTP 的做法一致。
func newFrontendRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := setupRouter("test")
	serveFrontend(r)
	return r
}

func requestWithHeaders(router http.Handler, urlPath string, headers map[string]string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(http.MethodGet, urlPath, nil)
	for key, value := range headers {
		request.Header.Set(key, value)
	}

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)
	return recorder
}

// TestIndexIsRevalidated 覆盖「发布新版后前端打不开」这个回归：
// 资源文件名带内容 hash，所以 index.html 必须每次回源校验，不能靠浏览器启发式
// 缓存（embed.FS 没有 modtime，以前既没有 Cache-Control 也没有 ETag）。
func TestIndexIsRevalidated(t *testing.T) {
	router := newFrontendRouter()

	recorder := requestWithHeaders(router, "/", nil)
	if recorder.Code != http.StatusOK {
		t.Fatalf("/ 应为 200，实际 %d", recorder.Code)
	}
	if got := recorder.Header().Get("Cache-Control"); got != "no-cache" {
		t.Fatalf("index 的 Cache-Control = %q，应为 no-cache", got)
	}

	etag := recorder.Header().Get("ETag")
	if etag == "" {
		t.Fatal("index 应当带 ETag，否则浏览器无法校验")
	}
	if !strings.Contains(recorder.Body.String(), `<script type="module"`) {
		t.Fatal("/ 应当返回前端入口 HTML")
	}

	// 带上 ETag 再请求应当得到 304，且不再传输正文。
	recorder = requestWithHeaders(router, "/", map[string]string{"If-None-Match": etag})
	if recorder.Code != http.StatusNotModified {
		t.Fatalf("带 If-None-Match 应为 304，实际 %d", recorder.Code)
	}
	if recorder.Body.Len() != 0 {
		t.Fatalf("304 不应带正文，实际 %d 字节", recorder.Body.Len())
	}

	// 弱校验符与列表形式也要认。
	recorder = requestWithHeaders(router, "/", map[string]string{"If-None-Match": `W/` + etag + `, "other"`})
	if recorder.Code != http.StatusNotModified {
		t.Fatalf("弱校验符应为 304，实际 %d", recorder.Code)
	}
}

// TestFrontendRouteFallsBackToIndex 确认前端路由（/overview、/tasks）仍然回退到入口 HTML。
func TestFrontendRouteFallsBackToIndex(t *testing.T) {
	router := newFrontendRouter()

	for _, urlPath := range []string{"/overview", "/tasks", "/logs", "/settings/config"} {
		recorder := requestWithHeaders(router, urlPath, nil)
		if recorder.Code != http.StatusOK {
			t.Fatalf("%s 应为 200，实际 %d", urlPath, recorder.Code)
		}
		if !strings.Contains(recorder.Body.String(), "<!doctype html>") {
			t.Fatalf("%s 应当回退到前端入口 HTML", urlPath)
		}
		if got := recorder.Header().Get("Cache-Control"); got != "no-cache" {
			t.Fatalf("%s 的 Cache-Control = %q，应为 no-cache", urlPath, got)
		}
	}
}

// TestHashedAssetsAreImmutable 覆盖「每次刷新都重下 2 MB」这个回归。
func TestHashedAssetsAreImmutable(t *testing.T) {
	router := newFrontendRouter()

	recorder := requestWithHeaders(router, "/assets/rolldown-runtime-QTnfLwEv.js", nil)
	if recorder.Code != http.StatusOK {
		t.Fatalf("静态资源应为 200，实际 %d", recorder.Code)
	}
	if got := recorder.Header().Get("Cache-Control"); got != "public, max-age=31536000, immutable" {
		t.Fatalf("带 hash 的产物应长期强缓存，实际 %q", got)
	}
	if !strings.Contains(recorder.Header().Get("Content-Type"), "javascript") {
		t.Fatalf("Content-Type 不正确: %q", recorder.Header().Get("Content-Type"))
	}
}

// TestMissingAssetReturns404 是这次白屏事故的直接回归：
// 缺失的 /assets/*.js 以前会被 SPA 回退成 200 text/html，浏览器把它当模块脚本
// 执行只会报一条 MIME 错误，界面上就是一片空白。
func TestMissingAssetReturns404(t *testing.T) {
	router := newFrontendRouter()

	recorder := requestWithHeaders(router, "/assets/index-CSPJtX7W.js", nil)
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("缺失的构建产物应为 404，实际 %d（body: %s）", recorder.Code, recorder.Body.String())
	}
	if strings.Contains(recorder.Body.String(), "<!doctype html>") {
		t.Fatal("缺失的构建产物不应回退成 HTML，否则浏览器只会白屏")
	}
}

// TestUnknownAPIPathIsNotIndex 确认 /api 下的未知路径不会被 SPA 回退吞掉。
func TestUnknownAPIPathIsNotIndex(t *testing.T) {
	router := newFrontendRouter()

	recorder := requestWithHeaders(router, "/api/definitely-not-here", basicAuthHeader())
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("/api 未知路径应为 404，实际 %d", recorder.Code)
	}
	if strings.Contains(recorder.Body.String(), "<!doctype html>") {
		t.Fatal("/api 响应不应是前端 HTML")
	}
}

// TestNonHashedStaticFileIsNotCachedLong 确认 favicon 这类没有指纹的文件
// 不会被当成 index.html 用同一个 ETag 缓存。
func TestNonHashedStaticFileIsNotCachedLong(t *testing.T) {
	router := newFrontendRouter()

	recorder := requestWithHeaders(router, "/favicon.svg", nil)
	if recorder.Code != http.StatusOK {
		t.Fatalf("/favicon.svg 应为 200，实际 %d", recorder.Code)
	}
	if got := recorder.Header().Get("Cache-Control"); got != "no-cache" {
		t.Fatalf("/favicon.svg 的 Cache-Control = %q，应为 no-cache", got)
	}
	if got := recorder.Header().Get("ETag"); got != "" {
		t.Fatalf("/favicon.svg 不应复用 index.html 的 ETag，实际 %q", got)
	}
}

func TestETagMatching(t *testing.T) {
	cases := []struct {
		header string
		want   bool
	}{
		{"", false},
		{`"abc"`, true},
		{`"x", "abc"`, true},
		{`W/"abc"`, true},
		{"*", true},
		{`"other"`, false},
	}

	for _, item := range cases {
		if got := etagMatches(item.header, `"abc"`); got != item.want {
			t.Fatalf("etagMatches(%q) = %v，应为 %v", item.header, got, item.want)
		}
	}
}
