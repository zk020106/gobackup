package web

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"testing"

	"github.com/spf13/viper"

	"github.com/gobackup/gobackup/config"
)

// doRequest 提交一次请求并返回完整响应，便于检查响应头（例如 Content-Disposition）。
func doRequest(t *testing.T, router http.Handler, rawURL string, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()

	request, err := http.NewRequest(http.MethodGet, rawURL, nil)
	if err != nil {
		t.Fatal(err)
	}
	for key, value := range headers {
		request.Header.Set(key, value)
	}

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)
	return recorder
}

// registerLocalTestModel 往全局配置里临时注册一个使用本地存储的模型。
func registerLocalTestModel(t *testing.T, name, dir string) {
	t.Helper()

	storageViper := viper.New()
	storageViper.Set("type", "local")
	storageViper.Set("path", dir)

	config.Models = append(config.Models, config.ModelConfig{
		Name:    name,
		WorkDir: dir,
		Storages: map[string]config.SubConfig{
			"local": {Name: "local", Type: "local", Viper: storageViper},
		},
		DefaultStorage: "local",
	})

	t.Cleanup(func() {
		kept := make([]config.ModelConfig, 0, len(config.Models))
		for _, m := range config.Models {
			if m.Name != name {
				kept = append(kept, m)
			}
		}
		config.Models = kept
	})
}

func writeArchive(t *testing.T, dir, name string, content []byte) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, name), content, 0o644); err != nil {
		t.Fatal(err)
	}
}

// TestLocalStorageDownload 是回归用例：本地存储以前直接返回
// 「Local is not support download」，文件浏览页根本下不了归档。
func TestLocalStorageDownload(t *testing.T) {
	dir := t.TempDir()
	const modelName = "download_local_test"
	registerLocalTestModel(t, modelName, dir)

	content := []byte("gobackup local archive bytes")
	writeArchive(t, dir, "2026.09.21.03.30.01.tar.gz", content)

	router := setupRouter("test")
	downloadPath := "/api/download?model=" + modelName + "&path=" + url.QueryEscape("2026.09.21.03.30.01.tar.gz")

	if webAuthConfigured() {
		recorder := doRequest(t, router, downloadPath, nil)
		if recorder.Code != http.StatusUnauthorized {
			t.Fatalf("未鉴权下载应返回 401，实际 %d", recorder.Code)
		}
	}

	recorder := doRequest(t, router, downloadPath, basicAuthHeader())
	if recorder.Code != http.StatusOK {
		t.Fatalf("下载本地归档应为 200，实际 %d: %s", recorder.Code, recorder.Body.String())
	}
	if recorder.Body.String() != string(content) {
		t.Fatalf("下载内容不一致: %q", recorder.Body.String())
	}

	disposition := recorder.Header().Get("Content-Disposition")
	if disposition == "" {
		t.Fatal("应当带上 Content-Disposition 让浏览器直接保存")
	}
	if recorder.Header().Get("Content-Length") != strconv.Itoa(len(content)) {
		t.Fatalf("Content-Length 不正确: %q", recorder.Header().Get("Content-Length"))
	}

	// 文件不存在时应当是 404，而不是 500 或空文件。
	missing := "/api/download?model=" + modelName + "&path=missing.tar.gz"
	if recorder := doRequest(t, router, missing, basicAuthHeader()); recorder.Code != http.StatusNotFound {
		t.Fatalf("下载不存在的文件应为 404，实际 %d", recorder.Code)
	}
}

// TestLocalStorageDownloadRejectsTraversal 保证下载接口不能读到存储目录之外的文件。
func TestLocalStorageDownloadRejectsTraversal(t *testing.T) {
	dir := t.TempDir()
	const modelName = "download_traversal_test"
	registerLocalTestModel(t, modelName, filepath.Join(dir, "backups"))

	if err := os.MkdirAll(filepath.Join(dir, "backups"), 0o755); err != nil {
		t.Fatal(err)
	}
	secret := filepath.Join(dir, "secret.txt")
	if err := os.WriteFile(secret, []byte("top secret"), 0o644); err != nil {
		t.Fatal(err)
	}

	router := setupRouter("test")
	path := "/api/download?model=" + modelName + "&path=" + url.QueryEscape("../secret.txt")

	recorder := doRequest(t, router, path, basicAuthHeader())
	if recorder.Code == http.StatusOK {
		t.Fatalf("路径穿越不应成功，实际返回了内容: %s", recorder.Body.String())
	}
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("路径穿越应返回 404，实际 %d", recorder.Code)
	}
}

// TestDownloadTicketFlow 覆盖浏览器原生下载用的票据：
// 签发需要凭据、票据一次性、绑定具体文件、不能用于其它接口。
func TestDownloadTicketFlow(t *testing.T) {
	dir := t.TempDir()
	const modelName = "download_ticket_test"
	registerLocalTestModel(t, modelName, dir)

	content := []byte("ticket download bytes")
	writeArchive(t, dir, "archive.tar.gz", content)
	writeArchive(t, dir, "other.tar.gz", []byte("other bytes"))

	router := setupRouter("test")
	ticketPath := "/api/download/ticket?model=" + modelName + "&path=archive.tar.gz"
	downloadPath := "/api/download?model=" + modelName + "&path=archive.tar.gz"

	if webAuthConfigured() {
		if recorder := doRequest(t, router, ticketPath, nil); recorder.Code != http.StatusUnauthorized {
			t.Fatalf("未鉴权签发票据应返回 401，实际 %d", recorder.Code)
		}
	}

	recorder := doRequest(t, router, ticketPath, basicAuthHeader())
	if recorder.Code != http.StatusOK {
		t.Fatalf("签发票据失败: %d %s", recorder.Code, recorder.Body.String())
	}

	var issued struct {
		Ticket    string `json:"ticket"`
		ExpiresIn int    `json:"expiresIn"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &issued); err != nil {
		t.Fatalf("解析票据响应失败: %v", err)
	}
	if issued.Ticket == "" || issued.ExpiresIn <= 0 {
		t.Fatalf("票据响应不完整: %+v", issued)
	}

	// 浏览器原生下载：只带票据，不带 Authorization 头。
	ticketURL := downloadPath + "&ticket=" + url.QueryEscape(issued.Ticket)
	recorder = doRequest(t, router, ticketURL, nil)
	if recorder.Code != http.StatusOK || recorder.Body.String() != string(content) {
		t.Fatalf("带票据下载失败: %d %s", recorder.Code, recorder.Body.String())
	}

	// 票据是一次性的。
	if recorder := doRequest(t, router, ticketURL, nil); recorder.Code != http.StatusUnauthorized {
		t.Fatalf("票据应当只能使用一次，实际 %d", recorder.Code)
	}

	// 伪造的票据不放行。
	forged := downloadPath + "&ticket=deadbeef"
	if recorder := doRequest(t, router, forged, nil); recorder.Code != http.StatusUnauthorized {
		t.Fatalf("伪造票据应返回 401，实际 %d", recorder.Code)
	}

	// 票据绑定到具体文件：换一个文件不生效。
	recorder = doRequest(t, router, ticketPath, basicAuthHeader())
	if err := json.Unmarshal(recorder.Body.Bytes(), &issued); err != nil {
		t.Fatal(err)
	}
	otherURL := "/api/download?model=" + modelName + "&path=other.tar.gz&ticket=" + url.QueryEscape(issued.Ticket)
	if recorder := doRequest(t, router, otherURL, nil); recorder.Code != http.StatusUnauthorized {
		t.Fatalf("票据换文件后应当失效，实际 %d", recorder.Code)
	}

	// 票据不能用于其它接口。
	recorder = doRequest(t, router, ticketPath, basicAuthHeader())
	if err := json.Unmarshal(recorder.Body.Bytes(), &issued); err != nil {
		t.Fatal(err)
	}
	if recorder := doRequest(t, router, "/api/config?ticket="+url.QueryEscape(issued.Ticket), nil); recorder.Code != http.StatusUnauthorized {
		t.Fatalf("票据不应能访问其它接口，实际 %d", recorder.Code)
	}
}

// TestDownloadTicketForUnknownModel 确认签发接口也会校验模型是否存在。
func TestDownloadTicketForUnknownModel(t *testing.T) {
	router := setupRouter("test")

	recorder := doRequest(t, router, "/api/download/ticket?model=not_exists&path=a.tar.gz", basicAuthHeader())
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("未知模型应返回 404，实际 %d", recorder.Code)
	}
}
