package compressor

import (
	"os/exec"
	"path/filepath"

	"github.com/gobackup/gobackup/helper"
)

type Tar struct {
	Base
}

func (tar *Tar) perform() (archivePath string, err error) {
	filePath := tar.archiveFilePath(tar.ext)

	opts := tar.options()
	opts = append(opts, filePath)
	// 显式用 -C 指定工作目录，避免为了打一个相对路径而 os.Chdir 到进程级
	// 全局工作目录（备份并发执行时会互相影响）。
	opts = append(opts, "-C", filepath.Dir(tar.model.DumpPath), tar.name)
	archivePath = filePath

	_, err = helper.Exec("tar", opts...)

	return
}

func (tar *Tar) options() (opts []string) {
	if helper.IsGnuTar {
		opts = append(opts, "--ignore-failed-read")
	}

	var useCompressProgram bool
	if len(tar.parallelProgram) > 0 {
		if path, err := exec.LookPath(tar.parallelProgram); err == nil {
			useCompressProgram = true
			opts = append(opts, "--use-compress-program", path)
		}
	}
	if !useCompressProgram {
		opts = append(opts, "-a")
	}
	opts = append(opts, "-cf")

	args := tar.viper.GetString("args")
	if len(args) > 0 {
		opts = append(opts, args)
	}

	return
}
