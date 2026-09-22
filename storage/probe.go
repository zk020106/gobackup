package storage

import (
	"errors"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"time"

	"github.com/spf13/viper"

	"github.com/gobackup/gobackup/config"
)

// storageProbeTimeout bounds a storage connection test. Cloud SDKs have their
// own retry logic, so the probe is cancelled from the caller side to keep the
// web API responsive.
const storageProbeTimeout = 20 * time.Second

var supportedProbeTypes = map[string]bool{
	"local": true, "webdav": true, "ftp": true, "scp": true, "sftp": true,
	"oss": true, "gcs": true, "s3": true, "minio": true, "b2": true,
	"us3": true, "cos": true, "kodo": true, "r2": true, "spaces": true,
	"bos": true, "obs": true, "tos": true, "upyun": true, "azure": true,
}

// TestConnection checks that the storage described by params (the same keys as
// the YAML config) can be opened and listed. workdir resolves relative local
// paths the same way a backup run would.
func TestConnection(storageType string, params map[string]any, workdir string) (message string, err error) {
	if !supportedProbeTypes[storageType] {
		return "", fmt.Errorf("暂不支持测试 %q 类型的存储连接", storageType)
	}

	if workdir == "" {
		workdir, _ = os.Getwd()
	}

	if storageType == "local" {
		raw, _ := params["path"].(string)
		if raw != "" && !path.IsAbs(raw) {
			params["path"] = path.Join(filepath.ToSlash(workdir), raw)
		}
	}

	v := viper.New()
	if mergeErr := v.MergeConfigMap(params); mergeErr != nil {
		return "", fmt.Errorf("解析存储配置失败: %w", mergeErr)
	}

	subConfig := config.SubConfig{Name: "probe", Type: storageType, Viper: v}
	probeModel := config.ModelConfig{
		Name:           "probe",
		WorkDir:        workdir,
		DefaultStorage: "probe",
		Storages:       map[string]config.SubConfig{"probe": subConfig},
	}

	// new() panics when the storage cannot be constructed; convert that into a
	// regular error so the API can report it.
	base, store, constructErr := construct(probeModel, subConfig)
	if constructErr != nil {
		return "", constructErr
	}
	_ = base

	type probeOutcome struct {
		message string
		err     error
	}
	done := make(chan probeOutcome, 1)

	go func() {
		defer func() {
			if recovered := recover(); recovered != nil {
				done <- probeOutcome{err: fmt.Errorf("连接失败: %v", recovered)}
			}
		}()

		if openErr := store.open(); openErr != nil {
			done <- probeOutcome{err: openErr}
			return
		}
		defer store.close()

		items, listErr := store.list("/")
		if listErr != nil {
			done <- probeOutcome{err: listErr}
			return
		}

		if storageType == "local" {
			if writeErr := verifyLocalWritable(probeModel, subConfig); writeErr != nil {
				done <- probeOutcome{err: writeErr}
				return
			}
		}

		done <- probeOutcome{
			message: fmt.Sprintf("连接成功：存储可用，当前目录 %d 个文件", len(items)),
		}
	}()

	select {
	case outcome := <-done:
		if outcome.err != nil {
			return "", outcome.err
		}
		return outcome.message, nil
	case <-time.After(storageProbeTimeout):
		return "", fmt.Errorf("连接超时（超过 %s），请检查网络和地址配置", storageProbeTimeout)
	}
}

func construct(model config.ModelConfig, subConfig config.SubConfig) (base Base, store Storage, err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			err = fmt.Errorf("存储配置无效: %v", recovered)
		}
	}()
	base, store = new(model, "", subConfig)
	return base, store, nil
}

func verifyLocalWritable(_ config.ModelConfig, subConfig config.SubConfig) error {
	// This path was already resolved against the workdir in TestConnection, so
	// it is exactly the directory Local.open() just created.
	target := subConfig.Viper.GetString("path")
	if target == "" {
		return errors.New("local path is required")
	}

	file, err := os.CreateTemp(target, ".gobackup-probe-*")
	if err != nil {
		return fmt.Errorf("目录不可写: %v", err)
	}
	name := file.Name()
	_ = file.Close()
	_ = os.Remove(name)
	return nil
}
