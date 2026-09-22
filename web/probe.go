package web

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/gobackup/gobackup/database"
	"github.com/gobackup/gobackup/model"
	"github.com/gobackup/gobackup/storage"
)

// configProbeRequest is sent by the configuration editor. Value is the current
// (possibly unsaved) provider node from the form; masked secrets are filled in
// from the saved YAML at Path.
type configProbeRequest struct {
	Kind   string          `json:"kind"`
	Type   string          `json:"type"`
	Path   string          `json:"path"`
	Model  string          `json:"model"`
	Action string          `json:"action"`
	Value  json.RawMessage `json:"value"`
}

// POST /api/config/probe
func probeConfig(c *gin.Context) {
	var request configProbeRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeConfigEditorError(c, http.StatusBadRequest, fmt.Errorf("invalid probe request: %w", err))
		return
	}

	if request.Kind != "database" && request.Kind != "storage" {
		writeConfigEditorError(c, http.StatusBadRequest, fmt.Errorf("kind must be database or storage"))
		return
	}
	if request.Type == "" {
		writeConfigEditorError(c, http.StatusBadRequest, fmt.Errorf("type is required"))
		return
	}
	if request.Action == "" {
		request.Action = "test"
	}

	params := map[string]any{}
	if len(request.Value) > 0 {
		var decoded any
		if err := json.Unmarshal(request.Value, &decoded); err != nil {
			writeConfigEditorError(c, http.StatusBadRequest, fmt.Errorf("invalid value: %w", err))
			return
		}
		if normalized, ok := normalizeYAMLValue(decoded).(map[string]any); ok {
			params = normalized
		}
	}
	params = resolveMaskedValues(params, request.Path)

	result := database.ProbeResult{}
	var err error
	switch request.Kind {
	case "database":
		switch request.Action {
		case "tables":
			result, err = database.ListTables(request.Type, params)
		case "databases":
			result, err = database.ListDatabases(request.Type, params)
		default:
			result, err = database.TestConnection(request.Type, params)
		}
	case "storage":
		var message string
		message, err = storage.TestConnection(request.Type, params, resolveWorkDir(request.Model))
		result = database.ProbeResult{Message: message}
	}

	if err != nil {
		// A failed connection is a normal probe result, not an HTTP error: the
		// editor shows the message inline.
		c.JSON(http.StatusOK, gin.H{
			"ok":      false,
			"message": err.Error(),
		})
		return
	}

	response := gin.H{
		"ok":        true,
		"message":   result.Message,
		"tables":    result.Tables,
		"databases": result.Databases,
	}

	if request.Kind == "database" {
		dumpTool, dumpFound, dumpPath, installCmd := CheckDumpTool(request.Type)
		if dumpTool != "" {
			response["dump_tool"] = dumpTool
			response["dump_tool_found"] = dumpFound
			response["dump_tool_path"] = dumpPath
			response["dump_tool_command"] = installCmd

			if !dumpFound {
				warning := fmt.Sprintf("\n\n⚠️ 提示：数据库网络连接成功，但服务器缺少备份核心工具 [%s]，实际备份时将无法导出数据！", dumpTool)
				if len(installCmd) > 0 {
					warning += fmt.Sprintf("\n推荐安装命令：%s", installCmd)
				}
				response["message"] = result.Message + warning
			}
		}
	}

	c.JSON(http.StatusOK, response)
}

type maskedConfigValue struct {
	Configured bool   `json:"configured"`
	Masked     string `json:"masked"`
}

// resolveMaskedValues fills masked secrets in the draft node from the saved
// YAML at the same JSON Pointer, so "test connection" works without retyping
// passwords that the editor intentionally never echoes back.
func resolveMaskedValues(draft map[string]any, pointer string) map[string]any {
	if pointer == "" {
		return draft
	}

	saved := savedConfigValueAt(pointer)
	if saved == nil {
		return draft
	}

	merged, ok := mergeMaskedValue(draft, saved).(map[string]any)
	if !ok {
		return draft
	}
	return merged
}

func mergeMaskedValue(draft any, saved any) any {
	draftMap, ok := draft.(map[string]any)
	if !ok {
		return draft
	}
	savedMap, _ := saved.(map[string]any)

	result := make(map[string]any, len(draftMap))
	for key, value := range draftMap {
		if marker, ok := value.(map[string]any); ok && isMaskedMarker(marker) {
			if configured, _ := marker["configured"].(bool); configured {
				if savedValue, exists := savedMap[key]; exists {
					result[key] = savedValue
				}
			}
			continue
		}
		if childMap, ok := value.(map[string]any); ok {
			result[key] = mergeMaskedValue(childMap, savedMap[key])
			continue
		}
		result[key] = value
	}
	return result
}

func isMaskedMarker(value map[string]any) bool {
	if len(value) != 2 {
		return false
	}
	_, hasMasked := value["masked"].(string)
	_, hasConfigured := value["configured"].(bool)
	return hasMasked && hasConfigured
}

// savedConfigValueAt reads the value at a JSON Pointer from the config file on
// disk and expands ${ENV} placeholders the same way the runtime loader does.
func savedConfigValueAt(pointer string) any {
	filePath, err := configEditorPath()
	if err != nil {
		return nil
	}
	raw, err := os.ReadFile(filePath)
	if err != nil {
		return nil
	}
	document, err := decodeYAMLDocument(raw)
	if err != nil {
		return nil
	}
	value, err := yamlDocumentValue(document)
	if err != nil {
		return nil
	}

	segments, err := parseJSONPointer(pointer)
	if err != nil {
		return nil
	}

	current := value
	for _, segment := range segments {
		switch typed := current.(type) {
		case map[string]any:
			current = typed[segment]
		case []any:
			index, err := strconv.Atoi(segment)
			if err != nil || index < 0 || index >= len(typed) {
				return nil
			}
			current = typed[index]
		default:
			return nil
		}
	}
	return expandEnvValues(current)
}

func expandEnvValues(value any) any {
	switch typed := value.(type) {
	case string:
		return os.ExpandEnv(typed)
	case map[string]any:
		result := make(map[string]any, len(typed))
		for key, child := range typed {
			result[key] = expandEnvValues(child)
		}
		return result
	case []any:
		result := make([]any, len(typed))
		for index, child := range typed {
			result[index] = expandEnvValues(child)
		}
		return result
	default:
		return value
	}
}

func resolveWorkDir(modelName string) string {
	if modelName != "" {
		if m := model.GetModelByName(modelName); m != nil && m.Config.WorkDir != "" {
			return m.Config.WorkDir
		}
	}
	workdir, err := os.Getwd()
	if err != nil {
		return ""
	}
	return workdir
}
