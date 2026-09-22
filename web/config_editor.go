package web

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
	"gopkg.in/yaml.v3"

	"github.com/gobackup/gobackup/config"
)

// configEditorMu serializes read/modify/write operations. The version check
// protects independent browser sessions; this mutex also prevents two
// requests in the same process from interleaving their atomic replacements.
var configEditorMu sync.Mutex

type configEditorOperation struct {
	Op    string          `json:"op"`
	Path  string          `json:"path"`
	Value json.RawMessage `json:"value"`
}

type configEditorPatchRequest struct {
	Version    string                  `json:"version"`
	Operations []configEditorOperation `json:"operations"`
	Changes    []configEditorOperation `json:"changes"`
}

type configEditorField struct {
	Key          string            `json:"key"`
	Label        string            `json:"label"`
	Type         string            `json:"type"`
	Description  string            `json:"description,omitempty"`
	Required     bool              `json:"required,omitempty"`
	Sensitive    bool              `json:"sensitive,omitempty"`
	Options      []string          `json:"options,omitempty"`
	OptionLabels map[string]string `json:"option_labels,omitempty"`
	// Default is the value the runtime assumes when the key is missing from the
	// YAML file. Without it the editor renders a misleading zero value: a
	// schedule section with only "every"/"at" is enabled at runtime, but the
	// editor used to show its "enabled" switch as off.
	Default any `json:"default,omitempty"`
	// Suggestions are autocomplete hints for a free text field. Unlike Options
	// they do not restrict the value the user may type.
	Suggestions []string `json:"suggestions,omitempty"`
	// TableSelector marks array fields (tables / exclude_tables) that the
	// editor can fill from a live database connection.
	TableSelector bool `json:"table_selector,omitempty"`
}

type configEditorSchema struct {
	Version   int                            `json:"version"`
	Global    []configEditorField            `json:"global"`
	Model     []configEditorField            `json:"model"`
	Databases map[string][]configEditorField `json:"databases"`
	Storages  map[string][]configEditorField `json:"storages"`
	Notifiers map[string][]configEditorField `json:"notifiers"`
	Sections  map[string][]configEditorField `json:"sections"`
}

type configEditorMaskedValue struct {
	Configured bool   `json:"configured"`
	Masked     string `json:"masked"`
}

func getConfigEditor(c *gin.Context) {
	filePath, err := configEditorPath()
	if err != nil {
		writeConfigEditorError(c, http.StatusInternalServerError, err)
		return
	}

	raw, err := os.ReadFile(filePath)
	if err != nil {
		writeConfigEditorError(c, http.StatusInternalServerError, fmt.Errorf("read config: %w", err))
		return
	}

	document, err := decodeYAMLDocument(raw)
	if err != nil {
		writeConfigEditorError(c, http.StatusUnprocessableEntity, fmt.Errorf("parse config: %w", err))
		return
	}

	value, err := yamlDocumentValue(document)
	if err != nil {
		writeConfigEditorError(c, http.StatusUnprocessableEntity, fmt.Errorf("read config values: %w", err))
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"version": hashConfig(raw),
		"config":  sanitizeConfigValue(value),
		// data is kept as a compatibility alias for clients that used the
		// first draft of the editor API.
		"data":   sanitizeConfigValue(value),
		"schema": editorSchema(),
	})
}

func patchConfigEditor(c *gin.Context) {
	var request configEditorPatchRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeConfigEditorError(c, http.StatusBadRequest, fmt.Errorf("invalid patch request: %w", err))
		return
	}

	operations, err := request.operations()
	if err != nil {
		writeConfigEditorError(c, http.StatusBadRequest, err)
		return
	}
	if request.Version == "" {
		writeConfigEditorError(c, http.StatusBadRequest, errors.New("version is required"))
		return
	}

	configEditorMu.Lock()
	defer configEditorMu.Unlock()

	filePath, err := configEditorPath()
	if err != nil {
		writeConfigEditorError(c, http.StatusInternalServerError, err)
		return
	}

	original, err := os.ReadFile(filePath)
	if err != nil {
		writeConfigEditorError(c, http.StatusInternalServerError, fmt.Errorf("read config: %w", err))
		return
	}

	currentVersion := hashConfig(original)
	if request.Version != currentVersion {
		writeConfigEditorConflict(c, currentVersion)
		return
	}

	document, err := decodeYAMLDocument(original)
	if err != nil {
		writeConfigEditorError(c, http.StatusUnprocessableEntity, fmt.Errorf("parse config: %w", err))
		return
	}
	if err := applyConfigEditorOperations(document, operations); err != nil {
		writeConfigEditorError(c, http.StatusBadRequest, err)
		return
	}
	if err := validateConfigDocument(document); err != nil {
		writeConfigEditorError(c, http.StatusUnprocessableEntity, err)
		return
	}

	updated, err := encodeYAMLDocument(document)
	if err != nil {
		writeConfigEditorError(c, http.StatusInternalServerError, fmt.Errorf("encode config: %w", err))
		return
	}
	// Validate the bytes that will actually be written. This catches encoder
	// regressions before the original file is touched.
	updatedDocument, err := decodeYAMLDocument(updated)
	if err != nil {
		writeConfigEditorError(c, http.StatusUnprocessableEntity, fmt.Errorf("validate encoded config: %w", err))
		return
	}
	if err := validateConfigDocument(updatedDocument); err != nil {
		writeConfigEditorError(c, http.StatusUnprocessableEntity, err)
		return
	}

	info, err := os.Stat(filePath)
	if err != nil {
		writeConfigEditorError(c, http.StatusInternalServerError, fmt.Errorf("stat config: %w", err))
		return
	}
	if err := replaceConfigFile(filePath, updated, info.Mode().Perm()); err != nil {
		writeConfigEditorError(c, http.StatusInternalServerError, fmt.Errorf("write config: %w", err))
		return
	}

	if err := config.Reload(); err != nil {
		// A syntactically valid file can still be rejected by the runtime
		// loader. Put the exact previous bytes back before reporting failure.
		restoreErr := replaceConfigFile(filePath, original, info.Mode().Perm())
		if restoreErr == nil {
			_ = config.Reload()
		}
		if restoreErr != nil {
			err = fmt.Errorf("reload config: %w; restore original config: %v", err, restoreErr)
		}
		writeConfigEditorError(c, http.StatusUnprocessableEntity, fmt.Errorf("reload config: %w", err))
		return
	}

	newVersion := hashConfig(updated)
	value, _ := yamlDocumentValue(updatedDocument)
	c.JSON(http.StatusOK, gin.H{
		"message": "configuration saved and reloaded",
		"version": newVersion,
		"config":  sanitizeConfigValue(value),
	})
}

func validateConfigEditor(c *gin.Context) {
	var request configEditorPatchRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeConfigEditorError(c, http.StatusBadRequest, fmt.Errorf("invalid validation request: %w", err))
		return
	}

	operations, err := request.operations()
	if err != nil {
		writeConfigEditorError(c, http.StatusBadRequest, err)
		return
	}

	configEditorMu.Lock()
	defer configEditorMu.Unlock()

	filePath, err := configEditorPath()
	if err != nil {
		writeConfigEditorError(c, http.StatusInternalServerError, err)
		return
	}
	original, err := os.ReadFile(filePath)
	if err != nil {
		writeConfigEditorError(c, http.StatusInternalServerError, fmt.Errorf("read config: %w", err))
		return
	}
	currentVersion := hashConfig(original)
	if request.Version != "" && request.Version != currentVersion {
		writeConfigEditorConflict(c, currentVersion)
		return
	}

	document, err := decodeYAMLDocument(original)
	if err != nil {
		writeConfigEditorError(c, http.StatusUnprocessableEntity, fmt.Errorf("parse config: %w", err))
		return
	}
	if err := applyConfigEditorOperations(document, operations); err != nil {
		writeConfigEditorError(c, http.StatusBadRequest, err)
		return
	}
	if err := validateConfigDocument(document); err != nil {
		writeConfigEditorError(c, http.StatusUnprocessableEntity, err)
		return
	}

	value, _ := yamlDocumentValue(document)
	c.JSON(http.StatusOK, gin.H{
		"valid":   true,
		"version": currentVersion,
		"config":  sanitizeConfigValue(value),
	})
}

func reloadConfigEditor(c *gin.Context) {
	if err := config.Reload(); err != nil {
		writeConfigEditorError(c, http.StatusUnprocessableEntity, fmt.Errorf("reload config: %w", err))
		return
	}

	filePath, err := configEditorPath()
	if err != nil {
		writeConfigEditorError(c, http.StatusInternalServerError, err)
		return
	}
	raw, err := os.ReadFile(filePath)
	if err != nil {
		writeConfigEditorError(c, http.StatusInternalServerError, fmt.Errorf("read config: %w", err))
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"message": "configuration reloaded",
		"version": hashConfig(raw),
	})
}

func (request configEditorPatchRequest) operations() ([]configEditorOperation, error) {
	operations := request.Operations
	if len(operations) == 0 {
		operations = request.Changes
	}
	if operations == nil {
		return nil, errors.New("operations are required")
	}
	for index, operation := range operations {
		operation.Op = strings.ToLower(strings.TrimSpace(operation.Op))
		operations[index].Op = operation.Op
		if operation.Op != "set" && operation.Op != "delete" {
			return nil, fmt.Errorf("operation %d: op must be set or delete", index)
		}
		if operation.Path == "" || (operation.Path[0] != '/' && operation.Path != "") {
			return nil, fmt.Errorf("operation %d: path must be a JSON Pointer", index)
		}
		if operation.Op == "set" && len(operation.Value) == 0 {
			return nil, fmt.Errorf("operation %d: set requires value", index)
		}
		if operation.Op == "set" && !json.Valid(operation.Value) {
			return nil, fmt.Errorf("operation %d: value is not valid JSON", index)
		}
	}
	return operations, nil
}

func configEditorPath() (string, error) {
	filePath := config.ConfigFileUsed()
	if filePath == "" {
		return "", errors.New("configuration file has not been loaded")
	}
	filePath, err := filepath.Abs(filePath)
	if err != nil {
		return "", fmt.Errorf("resolve config path: %w", err)
	}
	if info, err := os.Stat(filePath); err != nil || info.IsDir() {
		if err == nil {
			err = errors.New("path is a directory")
		}
		return "", fmt.Errorf("configuration file is unavailable: %w", err)
	}
	return filePath, nil
}

func writeConfigEditorError(c *gin.Context, status int, err error) {
	c.AbortWithStatusJSON(status, gin.H{"message": err.Error()})
}

func writeConfigEditorConflict(c *gin.Context, currentVersion string) {
	c.AbortWithStatusJSON(http.StatusConflict, gin.H{
		"message":         "configuration changed; reload the latest version before saving",
		"current_version": currentVersion,
	})
}

func hashConfig(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func decodeYAMLDocument(data []byte) (*yaml.Node, error) {
	decoder := yaml.NewDecoder(bytes.NewReader(data))
	var document yaml.Node
	if err := decoder.Decode(&document); err != nil {
		return nil, err
	}
	if document.Kind != yaml.DocumentNode || len(document.Content) != 1 {
		return nil, errors.New("configuration must contain one YAML document")
	}
	var extra yaml.Node
	if err := decoder.Decode(&extra); err != io.EOF {
		if err == nil {
			return nil, errors.New("multiple YAML documents are not supported")
		}
		return nil, err
	}
	return &document, nil
}

func encodeYAMLDocument(document *yaml.Node) ([]byte, error) {
	var buffer bytes.Buffer
	encoder := yaml.NewEncoder(&buffer)
	encoder.SetIndent(2)
	if err := encoder.Encode(document); err != nil {
		return nil, err
	}
	if err := encoder.Close(); err != nil {
		return nil, err
	}
	return buffer.Bytes(), nil
}

func yamlDocumentValue(document *yaml.Node) (any, error) {
	var value any
	if err := document.Decode(&value); err != nil {
		return nil, err
	}
	return normalizeYAMLValue(value), nil
}

func normalizeYAMLValue(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		result := make(map[string]any, len(typed))
		for key, item := range typed {
			result[key] = normalizeYAMLValue(item)
		}
		return result
	case map[any]any:
		result := make(map[string]any, len(typed))
		for key, item := range typed {
			result[fmt.Sprint(key)] = normalizeYAMLValue(item)
		}
		return result
	case []any:
		result := make([]any, len(typed))
		for index, item := range typed {
			result[index] = normalizeYAMLValue(item)
		}
		return result
	default:
		return value
	}
}

func sanitizeConfigValue(value any) any {
	return sanitizeConfigValueWithKey("", value)
}

func sanitizeConfigValueWithKey(key string, value any) any {
	if key != "" && isSensitiveConfigKey(key) {
		configured := value != nil
		if stringValue, ok := value.(string); ok {
			configured = stringValue != ""
		}
		return configEditorMaskedValue{Configured: configured, Masked: "••••••••"}
	}

	switch typed := value.(type) {
	case map[string]any:
		result := make(map[string]any, len(typed))
		for childKey, childValue := range typed {
			result[childKey] = sanitizeConfigValueWithKey(childKey, childValue)
		}
		return result
	case []any:
		result := make([]any, len(typed))
		for index, item := range typed {
			result[index] = sanitizeConfigValueWithKey("", item)
		}
		return result
	default:
		return value
	}
}

func isSensitiveConfigKey(key string) bool {
	normalized := strings.ToLower(strings.ReplaceAll(strings.ReplaceAll(key, "-", "_"), " ", "_"))
	for _, part := range []string{
		"password", "passphrase", "secret", "token", "access_key", "private_key",
		"api_key", "auth_key", "client_secret", "credential",
	} {
		if strings.Contains(normalized, part) {
			return true
		}
	}
	return false
}

func applyConfigEditorOperations(document *yaml.Node, operations []configEditorOperation) error {
	root := document.Content[0]
	for index, operation := range operations {
		segments, err := parseJSONPointer(operation.Path)
		if err != nil {
			return fmt.Errorf("operation %d: %w", index, err)
		}
		switch operation.Op {
		case "set":
			valueNode, err := jsonValueNode(operation.Value)
			if err != nil {
				return fmt.Errorf("operation %d: decode value: %w", index, err)
			}
			if err := setYAMLNode(root, segments, valueNode); err != nil {
				return fmt.Errorf("operation %d: %w", index, err)
			}
		case "delete":
			if err := deleteYAMLNode(root, segments); err != nil {
				return fmt.Errorf("operation %d: %w", index, err)
			}
		}
	}
	return nil
}

func parseJSONPointer(pointer string) ([]string, error) {
	if pointer == "" {
		return nil, nil
	}
	if pointer[0] != '/' {
		return nil, errors.New("path must start with '/'")
	}
	parts := strings.Split(pointer[1:], "/")
	segments := make([]string, len(parts))
	for index, part := range parts {
		var builder strings.Builder
		for cursor := 0; cursor < len(part); cursor++ {
			if part[cursor] != '~' {
				builder.WriteByte(part[cursor])
				continue
			}
			if cursor+1 >= len(part) || (part[cursor+1] != '0' && part[cursor+1] != '1') {
				return nil, errors.New("path contains an invalid escape")
			}
			if part[cursor+1] == '0' {
				builder.WriteByte('~')
			} else {
				builder.WriteByte('/')
			}
			cursor++
		}
		segments[index] = builder.String()
	}
	return segments, nil
}

func jsonValueNode(raw json.RawMessage) (*yaml.Node, error) {
	var document yaml.Node
	if err := yaml.Unmarshal(raw, &document); err != nil {
		return nil, err
	}
	if document.Kind != yaml.DocumentNode || len(document.Content) != 1 {
		return nil, errors.New("value must be one JSON/YAML value")
	}
	return document.Content[0], nil
}

func setYAMLNode(current *yaml.Node, segments []string, value *yaml.Node) error {
	if len(segments) == 0 {
		if current.Kind != yaml.MappingNode && value.Kind != yaml.MappingNode {
			return errors.New("root configuration must be a map")
		}
		*current = *value
		return nil
	}

	segment := segments[0]
	switch current.Kind {
	case yaml.MappingNode:
		valueIndex := mappingValueIndex(current, segment)
		if len(segments) == 1 {
			if valueIndex >= 0 {
				current.Content[valueIndex] = preserveYAMLNodeComments(current.Content[valueIndex], value)
			} else {
				current.Content = append(current.Content, &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: segment}, value)
			}
			return nil
		}
		if valueIndex < 0 {
			child := &yaml.Node{Kind: yaml.MappingNode, Tag: "!!map"}
			current.Content = append(current.Content, &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: segment}, child)
			return setYAMLNode(child, segments[1:], value)
		}
		return setYAMLNode(current.Content[valueIndex], segments[1:], value)
	case yaml.SequenceNode:
		index, err := sequenceIndex(segment, len(current.Content), len(segments) == 1)
		if err != nil {
			return err
		}
		if len(segments) == 1 {
			if segment == "-" {
				current.Content = append(current.Content, value)
			} else {
				current.Content[index] = preserveYAMLNodeComments(current.Content[index], value)
			}
			return nil
		}
		if index >= len(current.Content) {
			return errors.New("array index is out of range")
		}
		return setYAMLNode(current.Content[index], segments[1:], value)
	default:
		return fmt.Errorf("cannot set %q below a scalar value", segment)
	}
}

func preserveYAMLNodeComments(previous, next *yaml.Node) *yaml.Node {
	if next.HeadComment == "" {
		next.HeadComment = previous.HeadComment
	}
	if next.LineComment == "" {
		next.LineComment = previous.LineComment
	}
	if next.FootComment == "" {
		next.FootComment = previous.FootComment
	}
	return next
}

func deleteYAMLNode(current *yaml.Node, segments []string) error {
	if len(segments) == 0 {
		return errors.New("cannot delete the root configuration")
	}
	if len(segments) == 1 {
		switch current.Kind {
		case yaml.MappingNode:
			valueIndex := mappingValueIndex(current, segments[0])
			if valueIndex >= 0 {
				current.Content = append(current.Content[:valueIndex-1], current.Content[valueIndex+1:]...)
			}
			return nil
		case yaml.SequenceNode:
			index, err := sequenceIndex(segments[0], len(current.Content), false)
			if err != nil {
				return err
			}
			current.Content = append(current.Content[:index], current.Content[index+1:]...)
			return nil
		default:
			return fmt.Errorf("cannot delete %q below a scalar value", segments[0])
		}
	}

	switch current.Kind {
	case yaml.MappingNode:
		valueIndex := mappingValueIndex(current, segments[0])
		if valueIndex < 0 {
			return nil
		}
		return deleteYAMLNode(current.Content[valueIndex], segments[1:])
	case yaml.SequenceNode:
		index, err := sequenceIndex(segments[0], len(current.Content), false)
		if err != nil {
			return err
		}
		return deleteYAMLNode(current.Content[index], segments[1:])
	default:
		return fmt.Errorf("cannot delete %q below a scalar value", segments[0])
	}
}

func mappingValueIndex(node *yaml.Node, key string) int {
	for index := 0; index+1 < len(node.Content); index += 2 {
		if node.Content[index].Value == key {
			return index + 1
		}
	}
	return -1
}

func sequenceIndex(segment string, length int, allowAppend bool) (int, error) {
	if segment == "-" {
		if allowAppend {
			return length, nil
		}
		return 0, errors.New("'-' is only valid when appending to an array")
	}
	index, err := strconv.Atoi(segment)
	if err != nil || index < 0 {
		return 0, fmt.Errorf("invalid array index %q", segment)
	}
	if index >= length {
		return 0, fmt.Errorf("array index %d is out of range", index)
	}
	return index, nil
}

func validateConfigDocument(document *yaml.Node) error {
	value, err := yamlDocumentValue(document)
	if err != nil {
		return fmt.Errorf("decode configuration: %w", err)
	}
	root, ok := value.(map[string]any)
	if !ok {
		return errors.New("configuration root must be a map")
	}

	if webValue, exists := root["web"]; exists {
		web, ok := webValue.(map[string]any)
		if !ok {
			return errors.New("web must be a map")
		}
		if port, exists := web["port"]; exists && !validPortValue(port) {
			return errors.New("web.port must be a number between 1 and 65535")
		}
		if enabled, exists := web["enabled"]; exists {
			if _, ok := enabled.(bool); !ok {
				return errors.New("web.enabled must be a boolean")
			}
		}
	}

	modelsValue, exists := root["models"]
	if !exists {
		return errors.New("models must be configured")
	}
	models, ok := modelsValue.(map[string]any)
	if !ok || len(models) == 0 {
		return errors.New("at least one model must be configured")
	}
	for modelName, modelValue := range models {
		model, ok := modelValue.(map[string]any)
		if !ok {
			return fmt.Errorf("model %s must be a map", modelName)
		}
		storages, ok := model["storages"].(map[string]any)
		if !ok || len(storages) == 0 {
			return fmt.Errorf("no storage found in model %s", modelName)
		}
		for name, storageValue := range storages {
			if err := validateProvider("storage", name, storageValue); err != nil {
				return fmt.Errorf("model %s storage %s: %w", modelName, name, err)
			}
		}

		databases, hasDatabases := model["databases"].(map[string]any)
		archive, hasArchive := model["archive"]
		if (!hasDatabases || len(databases) == 0) && (!hasArchive || archive == nil) {
			return fmt.Errorf("model %s must configure databases or archive", modelName)
		}
		if hasDatabases {
			for name, databaseValue := range databases {
				if err := validateProvider("database", name, databaseValue); err != nil {
					return fmt.Errorf("model %s database %s: %w", modelName, name, err)
				}
			}
		}
		if notifiers, ok := model["notifiers"].(map[string]any); ok {
			for name, notifierValue := range notifiers {
				if err := validateProvider("notifier", name, notifierValue); err != nil {
					return fmt.Errorf("model %s notifier %s: %w", modelName, name, err)
				}
			}
		}
		if schedule, ok := model["schedule"]; ok && schedule != nil {
			scheduleMap, ok := schedule.(map[string]any)
			if !ok {
				return fmt.Errorf("model %s schedule must be a map", modelName)
			}
			if err := validateConfigMapFieldTypes(scheduleMap); err != nil {
				return fmt.Errorf("model %s schedule: %w", modelName, err)
			}
			if err := validateSchedule(scheduleMap); err != nil {
				return fmt.Errorf("model %s schedule: %w", modelName, err)
			}
		}
		for _, sectionName := range []string{"compress_with", "encrypt_with", "split_with"} {
			if section, ok := model[sectionName]; ok && section != nil {
				sectionMap, ok := section.(map[string]any)
				if !ok {
					return fmt.Errorf("model %s %s must be a map", modelName, sectionName)
				}
				if err := validateConfigMapFieldTypes(sectionMap); err != nil {
					return fmt.Errorf("model %s %s: %w", modelName, sectionName, err)
				}
				if err := validateModelSection(sectionName, sectionMap); err != nil {
					return fmt.Errorf("model %s %s: %w", modelName, sectionName, err)
				}
			}
		}
		if archiveValue, ok := model["archive"]; ok && archiveValue != nil {
			archiveMap, ok := archiveValue.(map[string]any)
			if !ok {
				return fmt.Errorf("model %s archive must be a map", modelName)
			}
			if err := validateConfigMapFieldTypes(archiveMap); err != nil {
				return fmt.Errorf("model %s archive: %w", modelName, err)
			}
			includes, ok := archiveMap["includes"].([]any)
			if !ok || len(includes) == 0 {
				return fmt.Errorf("model %s archive.includes must contain at least one path", modelName)
			}
		}
	}
	return nil
}

func validateSchedule(schedule map[string]any) error {
	enabled := true
	if value, exists := schedule["enabled"]; exists {
		var ok bool
		enabled, ok = value.(bool)
		if !ok {
			return errors.New("enabled must be a boolean")
		}
	}
	if !enabled {
		return nil
	}

	cron := nonEmptyConfigValue(schedule, "cron")
	every := nonEmptyConfigValue(schedule, "every")
	if !cron && !every {
		return errors.New("cron or every is required when enabled")
	}
	if nonEmptyConfigValue(schedule, "at") && !every {
		return errors.New("at requires every")
	}
	return nil
}

func validateModelSection(sectionName string, section map[string]any) error {
	typeValue, _ := section["type"].(string)
	switch sectionName {
	case "compress_with":
		if typeValue == "" {
			return nil
		}
		if !supportedCompressionTypes[typeValue] {
			return fmt.Errorf("unsupported type %q", typeValue)
		}
	case "encrypt_with":
		if typeValue == "" {
			return nil
		}
		if typeValue != "openssl" {
			return fmt.Errorf("unsupported type %q", typeValue)
		}
		if !nonEmptyConfigValue(section, "password") {
			return errors.New("password is required for openssl encryption")
		}
	case "split_with":
		if !nonEmptyConfigValue(section, "chunk_size") {
			return errors.New("chunk_size is required")
		}
	}
	return nil
}

var supportedCompressionTypes = map[string]bool{
	"gz": true, "tgz": true, "taz": true, "tar.gz": true,
	"Z": true, "taZ": true, "tar.Z": true,
	"bz2": true, "tbz": true, "tbz2": true, "tar.bz2": true,
	"lz": true, "tar.lz": true,
	"lzma": true, "tlz": true, "tar.lzma": true,
	"lzo": true, "tar.lzo": true,
	"xz": true, "txz": true, "tar.xz": true,
	"zst": true, "tzst": true, "tar.zst": true,
	"tar": true,
}

func nonEmptyConfigValue(values map[string]any, key string) bool {
	value, exists := values[key]
	if !exists || value == nil {
		return false
	}
	if text, ok := value.(string); ok {
		return strings.TrimSpace(text) != ""
	}
	if list, ok := value.([]any); ok {
		return len(list) > 0
	}
	return true
}

func validPortValue(value any) bool {
	switch typed := value.(type) {
	case int:
		return typed > 0 && typed <= 65535
	case int64:
		return typed > 0 && typed <= 65535
	case uint64:
		return typed > 0 && typed <= 65535
	case float64:
		return typed > 0 && typed <= 65535 && typed == float64(int(typed))
	case string:
		port, err := strconv.Atoi(typed)
		return err == nil && port > 0 && port <= 65535
	default:
		return false
	}
}

func validateProvider(kind, name string, value any) error {
	provider, ok := value.(map[string]any)
	if !ok {
		return errors.New("configuration must be a map")
	}
	typeValue, ok := provider["type"].(string)
	if !ok || strings.TrimSpace(typeValue) == "" {
		// A few historical configurations omit `type` when the node name is
		// itself a supported provider name. Preserve those files while still
		// requiring the field for newly-created arbitrary nodes.
		if supportedProviderName(kind, name) {
			typeValue = strings.ToLower(name)
		} else {
			return errors.New("type is required")
		}
	}
	supported := map[string]map[string]bool{
		"database": {
			"mysql": true, "mariadb": true, "redis": true, "postgresql": true,
			"mongodb": true, "sqlite": true, "mssql": true, "influxdb2": true,
			"etcd": true, "firebird": true,
		},
		"storage": {
			"local": true, "webdav": true, "ftp": true, "scp": true, "sftp": true,
			"oss": true, "gcs": true, "s3": true, "minio": true, "b2": true,
			"us3": true, "cos": true, "kodo": true, "r2": true, "spaces": true,
			"bos": true, "obs": true, "tos": true, "upyun": true, "azure": true,
		},
		"notifier": {
			"mail": true, "webhook": true, "feishu": true, "dingtalk": true,
			"discord": true, "slack": true, "github": true, "telegram": true,
			"postmark": true, "sendgrid": true, "ses": true, "resend": true,
			"wxwork": true, "googlechat": true, "healthchecks": true,
		},
	}
	if !supported[kind][typeValue] {
		return fmt.Errorf("unsupported type %q", typeValue)
	}
	if err := validateConfigMapFieldTypes(provider); err != nil {
		return err
	}
	if port, exists := provider["port"]; exists && !validPortValue(port) {
		return errors.New("port must be a number between 1 and 65535")
	}
	return validateProviderParameters(kind, typeValue, provider)
}

func validateProviderParameters(kind, typeValue string, provider map[string]any) error {
	require := func(keys ...string) error {
		for _, key := range keys {
			if !nonEmptyConfigValue(provider, key) {
				return fmt.Errorf("%s is required", key)
			}
		}
		return nil
	}

	switch kind {
	case "database":
		switch typeValue {
		case "mysql", "mariadb", "postgresql", "mssql":
			if !boolConfigValue(provider, "all_databases") {
				return require("database")
			}
		case "mongodb":
			if !boolConfigValue(provider, "all_databases") &&
				!nonEmptyConfigValue(provider, "uri") && !nonEmptyConfigValue(provider, "database") {
				return errors.New("uri or database is required")
			}
		case "sqlite":
			return require("path")
		case "influxdb2":
			if err := require("host", "token"); err != nil {
				return err
			}
			if !boolConfigValue(provider, "all_databases") &&
				!nonEmptyConfigValue(provider, "bucket") && !nonEmptyConfigValue(provider, "bucket_id") {
				return errors.New("bucket or bucket_id is required")
			}
		case "etcd":
			endpoint := nonEmptyConfigValue(provider, "endpoint")
			endpoints := nonEmptyConfigValue(provider, "endpoints")
			if endpoint == endpoints {
				return errors.New("exactly one of endpoint or endpoints is required")
			}
		}
	case "storage":
		switch typeValue {
		case "local":
			return require("path")
		case "webdav":
			return require("root")
		case "ftp":
			return require("host", "username", "password")
		case "scp", "sftp":
			return require("host", "path")
		case "s3", "oss", "gcs", "minio", "b2", "us3", "cos", "kodo", "r2", "spaces", "bos", "obs", "tos", "upyun":
			return require("bucket")
		case "azure":
			if !nonEmptyConfigValue(provider, "account") && !nonEmptyConfigValue(provider, "bucket") {
				return errors.New("account is required")
			}
			return require("tenant_id", "client_id", "client_secret")
		}
	case "notifier":
		switch typeValue {
		case "mail":
			return require("host", "username", "to")
		case "webhook", "feishu", "dingtalk", "discord", "slack", "wxwork", "googlechat", "healthchecks":
			return require("url")
		case "github":
			return require("url", "token")
		case "telegram":
			return require("token", "chat_id")
		case "postmark", "sendgrid", "resend":
			return require("from", "to", "token")
		case "ses":
			return require("from", "to")
		}
	}
	return nil
}

func boolConfigValue(values map[string]any, key string) bool {
	value, ok := values[key]
	return ok && value == true
}

func supportedProviderName(kind, name string) bool {
	name = strings.ToLower(name)
	switch kind {
	case "database":
		return map[string]bool{
			"mysql": true, "mariadb": true, "redis": true, "postgresql": true,
			"mongodb": true, "sqlite": true, "mssql": true, "influxdb2": true,
			"etcd": true, "firebird": true,
		}[name]
	case "storage":
		return map[string]bool{
			"local": true, "webdav": true, "ftp": true, "scp": true, "sftp": true,
			"oss": true, "gcs": true, "s3": true, "minio": true, "b2": true,
			"us3": true, "cos": true, "kodo": true, "r2": true, "spaces": true,
			"bos": true, "obs": true, "tos": true, "upyun": true, "azure": true,
		}[name]
	case "notifier":
		return map[string]bool{
			"mail": true, "webhook": true, "feishu": true, "dingtalk": true,
			"discord": true, "slack": true, "github": true, "telegram": true,
			"postmark": true, "sendgrid": true, "ses": true, "resend": true,
			"wxwork": true, "googlechat": true, "healthchecks": true,
		}[name]
	default:
		return false
	}
}

func validateConfigMapFieldTypes(values map[string]any) error {
	for key, value := range values {
		switch key {
		case "enabled", "tls", "explicit_tls", "no_check_certificate", "invoke_save", "all_databases", "salt", "base64", "openssl", "on_success", "on_failure", "numeric_suffixes", "oplog", "skip_verify", "http_debug", "trust_server_certificate", "force_path_style":
			if _, ok := value.(bool); !ok {
				return fmt.Errorf("%s must be a boolean", key)
			}
		case "port":
			if !validPortValue(value) {
				return errors.New("port must be a number between 1 and 65535")
			}
		case "keep", "timeout", "max_retries", "suffix_length":
			if !validIntegerValue(value) {
				return fmt.Errorf("%s must be a number", key)
			}
		case "includes", "excludes", "tables", "exclude_tables", "exclude_tables_prefix", "skip_databases", "endpoints":
			if _, ok := value.([]any); !ok {
				return fmt.Errorf("%s must be an array", key)
			}
		}
	}
	return nil
}

func validIntegerValue(value any) bool {
	switch typed := value.(type) {
	case int, int64, uint64:
		return true
	case float64:
		return typed == float64(int(typed))
	case string:
		_, err := strconv.Atoi(typed)
		return err == nil
	default:
		return false
	}
}

// ---- 配置编辑器文案：字段标签、说明与可选值 ----
//
// 下面几张表只影响界面显示，配置文件里真实写入的仍然是英文字段名。

var fieldLabels = map[string]string{
	"access_key_id":            "Access Key ID",
	"account":                  "存储账号",
	"after_script":             "备份后脚本",
	"all_databases":            "备份所有数据库",
	"args":                     "附加参数",
	"at":                       "执行时刻",
	"authdb":                   "认证数据库",
	"base64":                   "Base64 输出",
	"before_script":            "备份前脚本",
	"bucket":                   "存储桶 Bucket",
	"bucket_id":                "存储桶 ID",
	"chat_id":                  "会话 ID",
	"chiper":                   "加密算法",
	"chunk_size":               "分片大小",
	"client_id":                "客户端 ID",
	"client_secret":            "客户端密钥",
	"compress":                 "压缩方式",
	"container":                "容器名",
	"credentials":              "凭据内容",
	"credentials_file":         "凭据文件",
	"cron":                     "Cron 表达式",
	"database":                 "数据库名",
	"default_storage":          "默认存储",
	"description":              "模型说明",
	"enabled":                  "是否启用",
	"endpoint":                 "服务地址",
	"endpoints":                "服务地址列表",
	"every":                    "执行间隔",
	"exclude_tables":           "排除的表",
	"exclude_tables_prefix":    "按前缀排除",
	"excludes":                 "排除路径",
	"explicit_tls":             "显式 TLS",
	"filename_format":          "文件名格式",
	"force_path_style":         "强制路径风格",
	"from":                     "发件人",
	"headers":                  "请求头",
	"host":                     "主机地址",
	"http_debug":               "HTTP 调试日志",
	"includes":                 "包含路径",
	"invoke_save":              "保存后再备份",
	"keep":                     "保留份数",
	"max_retries":              "最大重试次数",
	"message_thread_id":        "话题 ID",
	"method":                   "请求方法",
	"mode":                     "备份模式",
	"no_check_certificate":     "跳过证书校验",
	"numeric_suffixes":         "使用数字后缀",
	"on_exit":                  "脚本执行时机",
	"on_failure":               "失败时通知",
	"on_success":               "成功时通知",
	"openssl":                  "使用 openssl 命令",
	"oplog":                    "备份 Oplog",
	"org":                      "组织",
	"org_id":                   "组织 ID",
	"passphrase":               "私钥口令",
	"password":                 "密码",
	"path":                     "路径",
	"port":                     "端口",
	"private_key":              "私钥文件",
	"rdb_path":                 "RDB 文件路径",
	"region":                   "区域 Region",
	"role":                     "角色",
	"root":                     "根目录",
	"salt":                     "启用 Salt",
	"secret_access_key":        "Secret Access Key",
	"skip_databases":           "跳过的数据库",
	"skip_verify":              "跳过证书校验",
	"socket":                   "Socket 路径",
	"sslmode":                  "SSL 模式",
	"storage_class":            "存储级别",
	"suffix_length":            "后缀位数",
	"tables":                   "指定的表",
	"tenant_id":                "租户 ID",
	"timeout":                  "超时时间（秒）",
	"tls":                      "启用 TLS",
	"to":                       "收件人",
	"token":                    "Token",
	"trust_server_certificate": "信任服务器证书",
	"type":                     "类型",
	"uri":                      "连接串 URI",
	"url":                      "通知地址",
	"username":                 "用户名",
	"workdir":                  "工作目录",
}

var fieldDescriptions = map[string]string{
	"access_key_id":            "对象存储的访问密钥 ID",
	"account":                  "Azure 存储账号",
	"after_script":             "备份结束后执行的脚本（依赖 sh，Windows 不可用）",
	"all_databases":            "备份整个实例；不能与“指定的表 / 排除的表”同时使用",
	"args":                     "追加给底层命令的额外参数，多个参数用空格分隔",
	"at":                       "执行时刻，例如 04:05",
	"authdb":                   "认证使用的数据库，默认 admin",
	"base64":                   "加密结果使用 Base64 编码",
	"before_script":            "备份开始前执行的脚本（依赖 sh，Windows 不可用）",
	"bucket":                   "对象存储的桶名称",
	"bucket_id":                "InfluxDB 存储桶 ID",
	"chat_id":                  "Telegram 会话 ID",
	"chiper":                   "调用 openssl 时使用的加密算法",
	"chunk_size":               "单个分片大小，例如 1GB、500MB",
	"client_id":                "Azure AD 应用客户端 ID",
	"client_secret":            "Azure AD 应用客户端密钥",
	"compress":                 "PostgreSQL 压缩方式，可写成 gzip:9 指定压缩级别",
	"container":                "Azure Blob 容器名",
	"credentials":              "GCS 服务账号凭据的 JSON 内容",
	"credentials_file":         "GCS 服务账号凭据文件路径",
	"cron":                     "5 段 Cron 表达式，例如 5 4 * * sun 表示每周日 04:05",
	"database":                 "要备份的数据库名",
	"default_storage":          "该模型默认使用的存储名称",
	"description":              "给这个模型起个方便识别的说明",
	"enabled":                  "关闭后该功能不生效",
	"endpoint":                 "自定义服务地址，留空使用官方默认地址",
	"endpoints":                "多个接入地址，每行一个",
	"every":                    "执行间隔，支持 30s、1h、1day 等写法",
	"exclude_tables":           "这些表不参与备份",
	"exclude_tables_prefix":    "按前缀排除集合",
	"excludes":                 "这些路径不打包",
	"explicit_tls":             "FTP 显式 TLS（FTPES）",
	"filename_format":          "Go 时间格式，例如 2006.01.02.15.04.05",
	"force_path_style":         "以路径风格访问，MinIO 等自建服务需要开启",
	"from":                     "发件人地址",
	"headers":                  "自定义 HTTP 请求头",
	"host":                     "服务端地址，本机可填 127.0.0.1",
	"http_debug":               "输出 HTTP 请求日志，便于排查问题",
	"includes":                 "需要打包的文件或目录，每行一个",
	"invoke_save":              "备份前先让 Redis 执行 SAVE，保证数据最新",
	"keep":                     "只保留最近 N 份备份，0 表示不自动清理",
	"max_retries":              "上传失败时的最大重试次数",
	"message_thread_id":        "Telegram 话题 ID，普通会话可留空",
	"method":                   "发送通知使用的 HTTP 方法",
	"mode":                     "sync 直接复制 RDB 文件；copy 先让 Redis 保存再复制",
	"no_check_certificate":     "不校验服务端证书",
	"numeric_suffixes":         "分片后缀使用数字而不是字母",
	"on_exit":                  "脚本在成功、失败还是一直执行",
	"on_failure":               "备份失败时发送通知",
	"on_success":               "备份成功时发送通知",
	"openssl":                  "调用系统 openssl 命令加解密，而不是内置实现",
	"oplog":                    "同时备份 oplog，用于增量恢复",
	"org":                      "InfluxDB 组织名称",
	"org_id":                   "InfluxDB 组织 ID",
	"passphrase":               "私钥口令；私钥未加密时留空",
	"password":                 "连接密码；敏感字段只显示掩码，未修改不会覆盖原值",
	"path":                     "目录或文件路径：存储地址 / SQLite 文件 / 远端目录",
	"port":                     "默认端口：MySQL 3306、PostgreSQL 5432、Redis 6379、SSH 22",
	"private_key":              "SSH 私钥文件，例如 ~/.ssh/id_rsa",
	"rdb_path":                 "Redis RDB 文件路径，mode=sync 时必填",
	"region":                   "对象存储区域，例如 ap-southeast-1",
	"role":                     "Firebird 角色",
	"root":                     "WebDAV 根路径",
	"salt":                     "加密时加入随机盐",
	"secret_access_key":        "对象存储的访问密钥，请妥善保管",
	"skip_databases":           "备份时跳过的数据库，每行一个",
	"skip_verify":              "跳过 HTTPS 证书校验，用于自签名证书",
	"socket":                   "Unix socket 路径；填写后 host 与 port 会被忽略（Windows 不支持）",
	"sslmode":                  "PostgreSQL 的 SSL 连接模式",
	"storage_class":            "对象存储级别，例如 STANDARD、STANDARD_IA、GLACIER",
	"suffix_length":            "分片文件后缀的数字位数",
	"tables":                   "只备份这些表，留空表示整库；每行一个表名",
	"tenant_id":                "Azure AD 租户 ID",
	"timeout":                  "网络操作超时秒数",
	"tls":                      "使用 TLS 加密连接",
	"to":                       "收件人地址，多个用英文逗号分隔",
	"token":                    "访问令牌或密钥",
	"trust_server_certificate": "信任服务端的自签名证书",
	"type":                     "类型决定这个条目下面可以填哪些字段",
	"uri":                      "完整的 MongoDB 连接串，填写后 host/port 可留空",
	"url":                      "接收通知的地址（Webhook / 机器人地址）",
	"username":                 "连接使用的账号",
	"workdir":                  "运行的临时目录，留空使用系统临时目录",
}

// fieldOptions 是内置枚举值：这些字段与其让用户手输，不如给出下拉选项。
var fieldOptions = map[string][]string{
	"mode":    {"sync", "copy"},
	"sslmode": {"disable", "allow", "prefer", "require", "verify-ca", "verify-full"},
	"on_exit": {"always", "success", "failure"},
	"chiper":  {"aes-256-cbc", "aes-192-cbc", "aes-128-cbc"},
	"method":  {"POST", "GET"},
}

var fieldOptionLabels = map[string]map[string]string{
	"mode": {
		"sync": "sync（直接复制 RDB 文件）",
		"copy": "copy（先让 Redis 保存再复制）",
	},
	"sslmode": {
		"disable":     "disable（不使用 SSL）",
		"allow":       "allow（优先非 SSL）",
		"prefer":      "prefer（优先 SSL）",
		"require":     "require（必须使用 SSL）",
		"verify-ca":   "verify-ca（校验证书）",
		"verify-full": "verify-full（校验证书和主机名）",
	},
	"on_exit": {
		"always":  "always（成功失败都执行）",
		"success": "success（仅成功时执行）",
		"failure": "failure（仅失败时执行）",
	},
	"chiper": {
		"aes-256-cbc": "aes-256-cbc（推荐）",
		"aes-192-cbc": "aes-192-cbc",
		"aes-128-cbc": "aes-128-cbc",
	},
}

// fieldSuggestions 是自由文本字段的候选项。它只影响界面上的下拉建议，
// 不会限制用户输入其它值，所以像 every / at 这种既能选也允许手填的字段
// 用它比用 Options 更合适。
var fieldSuggestions = map[string][]string{
	"every": {
		"30s", "1m", "5m", "15m", "30m",
		"1h", "2h", "6h", "12h",
		"1day", "2days", "1week", "2weeks", "1month",
	},
	"at": {
		"00:00", "01:00", "02:00", "03:00", "03:30", "04:00",
		"05:00", "06:00", "08:00", "12:00", "18:00", "22:00", "23:00",
	},
	"cron": {
		"0 3 * * *", "30 3 * * *", "0 4 * * sun", "0 */6 * * *", "0 3 1 * *",
	},
	"chunk_size": {
		"100MB", "500MB", "1GB", "2GB", "5GB", "10GB",
	},
	"filename_format": {
		"2006.01.02.15.04.05", "2006-01-02-15-04-05", "20060102150405", "2006.01.02",
	},
	"storage_class": {
		"STANDARD", "STANDARD_IA", "INTELLIGENT_TIERING", "GLACIER", "DEEP_ARCHIVE",
	},
	"region": {
		"us-east-1", "us-west-2", "ap-southeast-1", "ap-northeast-1",
		"cn-hangzhou", "cn-beijing", "cn-shanghai", "cn-guangzhou",
	},
	"sslmode": {
		"disable", "allow", "prefer", "require", "verify-ca", "verify-full",
	},
}

var compressorTypes = []string{
	"tgz", "tar.gz", "tar", "tar.bz2", "tar.xz", "tar.zst", "tar.lzma", "tar.Z", "tar.lz", "tar.lzo",
}

var compressorTypeLabels = map[string]string{
	"tgz":      "tgz / tar.gz（gzip，最常用）",
	"tar.gz":   "tar.gz（同 tgz）",
	"tar":      "tar（仅打包，不压缩）",
	"tar.bz2":  "tar.bz2（bzip2，体积更小）",
	"tar.xz":   "tar.xz（xz，压缩率最高）",
	"tar.zst":  "tar.zst（zstd，速度快）",
	"tar.lzma": "tar.lzma（lzma）",
	"tar.Z":    "tar.Z（compress）",
	"tar.lz":   "tar.lz（lzip）",
	"tar.lzo":  "tar.lzo（lzop）",
}

var encryptorTypes = []string{"openssl"}

var encryptorTypeLabels = map[string]string{
	"openssl": "openssl（使用 openssl 加解密）",
}

var databaseTypeLabels = map[string]string{
	"mysql":      "mysql（MySQL）",
	"mariadb":    "mariadb（MariaDB）",
	"postgresql": "postgresql（PostgreSQL）",
	"redis":      "redis（Redis）",
	"mongodb":    "mongodb（MongoDB）",
	"sqlite":     "sqlite（SQLite 文件）",
	"mssql":      "mssql（SQL Server）",
	"influxdb2":  "influxdb2（InfluxDB 2.x）",
	"etcd":       "etcd（etcd 快照）",
	"firebird":   "firebird（Firebird）",
}

var storageTypeLabels = map[string]string{
	"local":  "local（本机目录）",
	"ftp":    "ftp（FTP 服务器）",
	"sftp":   "sftp（SFTP over SSH）",
	"scp":    "scp（SCP 复制）",
	"webdav": "webdav（WebDAV，如坚果云）",
	"s3":     "s3（Amazon S3 及兼容服务）",
	"minio":  "minio（自建 MinIO）",
	"oss":    "oss（阿里云对象存储）",
	"cos":    "cos（腾讯云 COS）",
	"obs":    "obs（华为云 OBS）",
	"bos":    "bos（百度云 BOS）",
	"tos":    "tos（火山引擎 TOS）",
	"kodo":   "kodo（七牛云 Kodo）",
	"upyun":  "upyun（又拍云）",
	"us3":    "us3（UCloud US3）",
	"r2":     "r2（Cloudflare R2）",
	"spaces": "spaces（DigitalOcean Spaces）",
	"b2":     "b2（Backblaze B2）",
	"gcs":    "gcs（Google Cloud Storage）",
	"azure":  "azure（Microsoft Azure Blob）",
}

var notifierTypeLabels = map[string]string{
	"mail":         "mail（邮件 SMTP）",
	"webhook":      "webhook（自定义 HTTP 回调）",
	"feishu":       "feishu（飞书）",
	"dingtalk":     "dingtalk（钉钉）",
	"wxwork":       "wxwork（企业微信）",
	"telegram":     "telegram（Telegram）",
	"slack":        "slack（Slack）",
	"discord":      "discord（Discord）",
	"github":       "github（评论 Issue）",
	"googlechat":   "googlechat（Google Chat）",
	"healthchecks": "healthchecks（Healthchecks 心跳）",
	"postmark":     "postmark（邮件服务）",
	"sendgrid":     "sendgrid（邮件服务）",
	"resend":       "resend（邮件服务）",
	"ses":          "ses（AWS 邮件服务）",
}

// webFields 是 Web 管理界面自身的配置，字段名和连接数据库的同名，所以单独给一套文案。
func webFields() []configEditorField {
	list := fields("host", "port", "username", "password", "enabled")
	list[0].Label = "Web 监听地址"
	list[0].Description = "本机访问填 127.0.0.1，局域网访问填 0.0.0.0"
	list[1].Label = "Web 监听端口"
	list[1].Description = "默认 2703，浏览器访问 http://地址:端口"
	list[2].Label = "登录用户名"
	list[2].Description = "登录 Web 界面使用的账号"
	list[3].Label = "登录密码"
	list[3].Description = "登录 Web 界面使用的密码"
	list[4].Label = "启用 Web 界面"
	list[4].Description = "关闭后 run/start 不再启动 HTTP 服务"
	return list
}

func fieldLabel(key string) string {
	if label, ok := fieldLabels[key]; ok {
		return label
	}
	return key
}

func fields(keys ...string) []configEditorField {
	result := make([]configEditorField, 0, len(keys))
	for _, key := range keys {
		fieldType := "string"
		sensitive := isSensitiveConfigKey(key)
		switch key {
		case "enabled", "tls", "explicit_tls", "no_check_certificate", "invoke_save", "all_databases", "salt", "base64", "openssl", "on_success", "on_failure", "numeric_suffixes", "oplog", "skip_verify", "http_debug", "trust_server_certificate", "force_path_style":
			fieldType = "boolean"
		case "port", "keep", "timeout", "max_retries", "suffix_length", "message_thread_id":
			fieldType = "number"
		case "includes", "excludes", "tables", "exclude_tables", "exclude_tables_prefix", "skip_databases", "endpoints":
			fieldType = "array"
		case "headers":
			fieldType = "object"
		}
		result = append(result, configEditorField{
			Key:           key,
			Label:         fieldLabel(key),
			Type:          fieldType,
			Description:   fieldDescriptions[key],
			Sensitive:     sensitive,
			Options:       fieldOptions[key],
			OptionLabels:  fieldOptionLabels[key],
			Suggestions:   fieldSuggestions[key],
			TableSelector: key == "tables" || key == "exclude_tables",
		})
	}
	return result
}

// withDefaults records the effective value the runtime assumes when a key is
// missing. It is applied per section because the same key name can differ:
// a model schedule is enabled by default, while the web block is not.
func withDefaults(list []configEditorField, defaults map[string]any) []configEditorField {
	result := make([]configEditorField, 0, len(list))
	for _, field := range list {
		if value, ok := defaults[field.Key]; ok {
			field.Default = value
		}
		result = append(result, field)
	}
	return result
}

// groupTypeOptions 给一组条目（数据库、存储、通知）的 type 字段补上下拉选项，
// 可选值就是这一组里支持的所有类型。
func groupTypeOptions(group map[string][]configEditorField, labels map[string]string) map[string][]configEditorField {
	types := make([]string, 0, len(group))
	for name := range group {
		types = append(types, name)
	}
	sort.Strings(types)

	result := make(map[string][]configEditorField, len(group))
	for name, list := range group {
		result[name] = typeOptions(list, types, labels)
	}
	return result
}

func typeOptions(list []configEditorField, types []string, labels map[string]string) []configEditorField {
	result := make([]configEditorField, 0, len(list))
	for _, field := range list {
		if field.Key == "type" {
			field.Options = types
			field.OptionLabels = labels
		}
		result = append(result, field)
	}
	return result
}

func editorSchema() configEditorSchema {
	schema := configEditorSchema{
		Version: 1,
		Global:  webFields(),
		Model:   fields("description", "workdir", "default_storage", "before_script", "after_script"),
		Databases: map[string][]configEditorField{
			"mysql":      fields("type", "host", "port", "socket", "database", "username", "password", "args", "tables", "exclude_tables", "all_databases", "before_script", "after_script", "on_exit"),
			"mariadb":    fields("type", "host", "port", "socket", "database", "username", "password", "args", "tables", "exclude_tables", "all_databases", "before_script", "after_script", "on_exit"),
			"postgresql": fields("type", "host", "port", "socket", "database", "username", "password", "sslmode", "compress", "args", "tables", "exclude_tables", "all_databases", "before_script", "after_script", "on_exit"),
			"redis":      fields("type", "mode", "host", "port", "socket", "rdb_path", "invoke_save", "password", "args"),
			"mongodb":    fields("type", "host", "port", "database", "username", "password", "uri", "authdb", "exclude_tables", "exclude_tables_prefix", "oplog", "args", "all_databases"),
			"sqlite":     fields("type", "path"),
			"mssql":      fields("type", "host", "port", "database", "username", "password", "trust_server_certificate", "all_databases", "skip_databases", "args"),
			"influxdb2":  fields("type", "host", "token", "bucket", "bucket_id", "org", "org_id", "skip_verify", "http_debug", "all_databases"),
			"etcd":       fields("type", "endpoint", "endpoints", "args"),
			"firebird":   fields("type", "host", "port", "database", "username", "password", "role", "args"),
		},
		Storages: map[string][]configEditorField{
			"local":  fields("type", "keep", "path"),
			"webdav": fields("type", "keep", "root", "path", "username", "password"),
			"ftp":    fields("type", "keep", "path", "host", "port", "timeout", "username", "password", "tls", "explicit_tls", "no_check_certificate"),
			"scp":    fields("type", "keep", "path", "host", "port", "timeout", "username", "password", "private_key", "passphrase"),
			"sftp":   fields("type", "keep", "path", "host", "port", "timeout", "username", "password", "private_key", "passphrase"),
			"s3":     fields("type", "keep", "bucket", "region", "path", "endpoint", "access_key_id", "secret_access_key", "token", "storage_class", "timeout", "max_retries", "force_path_style"),
			"oss":    fields("type", "keep", "bucket", "region", "path", "endpoint", "access_key_id", "secret_access_key", "token", "storage_class", "timeout", "max_retries", "force_path_style"),
			"gcs":    fields("type", "keep", "bucket", "path", "credentials", "credentials_file", "timeout"),
			"minio":  fields("type", "keep", "bucket", "region", "path", "endpoint", "access_key_id", "secret_access_key", "token", "storage_class", "timeout", "max_retries", "force_path_style"),
			"b2":     fields("type", "keep", "bucket", "region", "path", "endpoint", "access_key_id", "secret_access_key", "token", "storage_class", "timeout", "max_retries", "force_path_style"),
			"us3":    fields("type", "keep", "bucket", "region", "path", "endpoint", "access_key_id", "secret_access_key", "token", "storage_class", "timeout", "max_retries", "force_path_style"),
			"cos":    fields("type", "keep", "bucket", "region", "path", "endpoint", "access_key_id", "secret_access_key", "token", "storage_class", "timeout", "max_retries", "force_path_style"),
			"kodo":   fields("type", "keep", "bucket", "region", "path", "endpoint", "access_key_id", "secret_access_key", "token", "storage_class", "timeout", "max_retries", "force_path_style"),
			"r2":     fields("type", "keep", "bucket", "region", "path", "endpoint", "account_id", "access_key_id", "secret_access_key", "token", "storage_class", "timeout", "max_retries", "force_path_style"),
			"spaces": fields("type", "keep", "bucket", "region", "path", "endpoint", "access_key_id", "secret_access_key", "token", "storage_class", "timeout", "max_retries", "force_path_style"),
			"bos":    fields("type", "keep", "bucket", "region", "path", "endpoint", "access_key_id", "secret_access_key", "token", "storage_class", "timeout", "max_retries", "force_path_style"),
			"obs":    fields("type", "keep", "bucket", "region", "path", "endpoint", "access_key_id", "secret_access_key", "token", "storage_class", "timeout", "max_retries", "force_path_style"),
			"tos":    fields("type", "keep", "bucket", "region", "path", "endpoint", "access_key_id", "secret_access_key", "token", "storage_class", "timeout", "max_retries", "force_path_style"),
			"upyun":  fields("type", "keep", "bucket", "region", "path", "endpoint", "access_key_id", "secret_access_key", "token", "storage_class", "timeout", "max_retries", "force_path_style"),
			"azure":  fields("type", "keep", "account", "bucket", "container", "path", "tenant_id", "client_id", "client_secret", "timeout"),
		},
		Notifiers: map[string][]configEditorField{
			"mail":         fields("type", "on_success", "on_failure", "host", "port", "username", "password", "from", "to", "tls"),
			"webhook":      fields("type", "on_success", "on_failure", "url"),
			"feishu":       fields("type", "on_success", "on_failure", "url"),
			"dingtalk":     fields("type", "on_success", "on_failure", "url"),
			"discord":      fields("type", "on_success", "on_failure", "url"),
			"slack":        fields("type", "on_success", "on_failure", "url", "token"),
			"telegram":     fields("type", "on_success", "on_failure", "token", "endpoint", "chat_id", "message_thread_id"),
			"github":       fields("type", "on_success", "on_failure", "token", "url"),
			"postmark":     fields("type", "on_success", "on_failure", "token", "from", "to"),
			"sendgrid":     fields("type", "on_success", "on_failure", "token", "from", "to"),
			"ses":          fields("type", "on_success", "on_failure", "access_key_id", "secret_access_key", "token", "region", "from", "to"),
			"resend":       fields("type", "on_success", "on_failure", "token", "from", "to"),
			"wxwork":       fields("type", "on_success", "on_failure", "url"),
			"googlechat":   fields("type", "on_success", "on_failure", "url", "method", "headers"),
			"healthchecks": fields("type", "on_success", "on_failure", "url"),
		},
		Sections: map[string][]configEditorField{
			"schedule":      fields("enabled", "cron", "every", "at"),
			"compress_with": fields("type", "filename_format", "args"),
			"encrypt_with":  fields("type", "password", "salt", "base64", "openssl", "chiper", "args"),
			"archive":       fields("includes", "excludes"),
			"split_with":    fields("chunk_size", "suffix_length", "numeric_suffixes"),
		},
	}

	schema.Databases = groupTypeOptions(schema.Databases, databaseTypeLabels)
	schema.Storages = groupTypeOptions(schema.Storages, storageTypeLabels)
	schema.Notifiers = groupTypeOptions(schema.Notifiers, notifierTypeLabels)
	schema.Sections["compress_with"] = typeOptions(schema.Sections["compress_with"], compressorTypes, compressorTypeLabels)
	schema.Sections["encrypt_with"] = typeOptions(schema.Sections["encrypt_with"], encryptorTypes, encryptorTypeLabels)

	// A schedule section without an explicit "enabled" key is enabled at
	// runtime, so the editor must not show that switch as off.
	schema.Sections["schedule"] = withDefaults(schema.Sections["schedule"], map[string]any{
		"enabled": true,
	})
	return schema
}

func replaceConfigFile(filePath string, data []byte, mode os.FileMode) error {
	directory := filepath.Dir(filePath)
	temp, err := os.CreateTemp(directory, ".gobackup-config-*")
	if err != nil {
		return err
	}
	tempPath := temp.Name()
	defer os.Remove(tempPath)
	if mode == 0 {
		mode = 0600
	}
	if err := temp.Chmod(mode); err != nil {
		_ = temp.Close()
		return err
	}
	if _, err := temp.Write(data); err != nil {
		_ = temp.Close()
		return err
	}
	if err := temp.Sync(); err != nil {
		_ = temp.Close()
		return err
	}
	if err := temp.Close(); err != nil {
		return err
	}

	if runtime.GOOS != "windows" {
		return os.Rename(tempPath, filePath)
	}

	backupPath := filePath + ".gobackup-editor-backup"
	_ = os.Remove(backupPath)
	if err := os.Rename(filePath, backupPath); err != nil {
		return err
	}
	if err := os.Rename(tempPath, filePath); err != nil {
		_ = os.Rename(backupPath, filePath)
		return err
	}
	if err := os.Remove(backupPath); err != nil {
		return err
	}
	return nil
}
