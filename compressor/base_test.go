package compressor

import (
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gobackup/gobackup/config"
	"github.com/longbridgeapp/assert"
	"github.com/spf13/viper"
)

type Monkey struct {
	Base
}

func (c Monkey) perform() (archivePath string, err error) {
	result := "aaa"
	return result, nil
}

func TestBase_archiveFilePath(t *testing.T) {
	viper := viper.New()
	viper.SetDefault("type", "tar")
	viper.SetDefault("filename_format", "backup-2006.01.02.15.04.05")
	model := config.ModelConfig{}
	// 归档文件路径固定是绝对路径：压缩不再用 os.Chdir 切换工作目录，
	// 相对路径会相对于进程 cwd 解析，因此必须先把 TempPath 规范化。
	model.TempPath = t.TempDir()
	model.CompressWith = config.SubConfig{
		Type:  viper.GetString("type"),
		Viper: viper,
	}
	base := newBase(model)
	prefixPath := filepath.Join(model.TempPath, time.Now().Format("backup-2006.01.02.15.04"))
	archivePath := base.archiveFilePath(".tar")
	assert.True(t, strings.HasPrefix(archivePath, prefixPath))
	assert.True(t, strings.HasSuffix(archivePath, ".tar"))
	assert.True(t, filepath.IsAbs(archivePath))
}

func TestBaseInterface(t *testing.T) {
	model := config.ModelConfig{
		Name: "TestMoneky",
	}
	base := newBase(model)
	assert.Equal(t, base.name, model.Name)
	assert.Equal(t, base.model, model)

	c := Monkey{Base: base}
	result, err := c.perform()
	assert.Equal(t, result, "aaa")
	assert.Nil(t, err)
}

func TestRun_EmptyType(t *testing.T) {
	v := viper.New()
	v.SetDefault("filename_format", "2006.01.02.15.04.05")

	model := config.ModelConfig{
		Name:     "TestEmptyType",
		DumpPath: "/tmp/test_dump",
		CompressWith: config.SubConfig{
			Type:  "",
			Viper: v,
		},
		Viper: viper.New(),
	}

	archivePath, err := Run(model)
	assert.Nil(t, err)
	assert.Equal(t, archivePath, "/tmp/test_dump")
}
