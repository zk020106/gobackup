package web

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/gobackup/gobackup/config"
	"github.com/longbridgeapp/assert"
)

func init() {
	if err := config.Init("../gobackup_test.yml"); err != nil {
		panic(err.Error())
	}
}

func assertMatchJSON(t *testing.T, expected map[string]any, actual string) {
	t.Helper()

	expectedJSON, err := json.Marshal(expected)
	assert.NoError(t, err)
	assert.Equal(t, string(expectedJSON), actual)
}

func invokeHttp(method string, path string, headers map[string]string, data map[string]any) (statusCode int, body string) {
	r := setupRouter("master")
	w := httptest.NewRecorder()

	bodyBytes, err := json.Marshal(data)
	if err != nil {
		panic(err)
	}

	req, _ := http.NewRequest(method, path, bytes.NewBuffer(bodyBytes))
	for key := range headers {
		req.Header.Add(key, headers[key])
	}

	if len(data) > 0 {
		req.Header.Add("Content-Type", "application/json")
	}

	r.ServeHTTP(w, req)

	return w.Code, w.Body.String()
}

func TestAPIStatus(t *testing.T) {
	code, body := invokeHttp("GET", "/status", nil, nil)

	assert.Equal(t, 200, code)
	assertMatchJSON(t, gin.H{"message": "GoBackup is running.", "version": "master"}, body)
}

func TestAPIGetModels(t *testing.T) {
	// /api 需要鉴权，带着当前配置的凭据访问。
	code, _ := invokeHttp("GET", "/api/config", basicAuthHeader(), nil)

	assert.Equal(t, 200, code)
}

func TestAPIPostPeform(t *testing.T) {
	code, body := invokeHttp("POST", "/api/perform", basicAuthHeader(), gin.H{"model": "test_model"})

	assert.Equal(t, 200, code)
	assertMatchJSON(t, gin.H{"message": "Backup: test_model performed in background."}, body)
}
