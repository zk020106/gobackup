package web

import (
	"bytes"
	"context"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/spf13/viper"

	"github.com/gobackup/gobackup/config"
)

var (
	serverStartTime = time.Now()
	currentVersion  = "master"
)

type HostInfo struct {
	Hostname     string   `json:"hostname"`
	OS           string   `json:"os"`           // "linux", "windows", "darwin"
	Platform     string   `json:"platform"`     // "Ubuntu 24.04 LTS", "Windows", "openEuler 22.03", etc.
	Distribution string   `json:"distribution"` // "ubuntu", "openeuler", "centos", "windows", etc.
	Arch         string   `json:"arch"`         // "amd64", "arm64", etc.
	CPUCores     int      `json:"cpu_cores"`
	GoVersion    string   `json:"go_version"`
	PreferredPM  string   `json:"preferred_pm"`  // "apt", "dnf", "yum", "apk", "winget", "brew"
	AvailablePMs []string `json:"available_pms"` // detected PMs
}

type RuntimeInfo struct {
	Version       string  `json:"version"`
	PID           int     `json:"pid"`
	StartTime     string  `json:"start_time"`
	UptimeSeconds int64   `json:"uptime_seconds"`
	WorkDir       string  `json:"work_dir"`
	TempDir       string  `json:"temp_dir"`
	ConfigFile    string  `json:"config_file"`
	StateDir      string  `json:"state_dir"`
	MemoryAllocMB float64 `json:"memory_alloc_mb"`
	MemoryTotalMB float64 `json:"memory_total_mb"`
	MemoryUsedMB  float64 `json:"memory_used_mb"`
	MemoryPercent float64 `json:"memory_percent"`
	DiskPath      string  `json:"disk_path"`
	DiskTotalGB   float64 `json:"disk_total_gb"`
	DiskFreeGB    float64 `json:"disk_free_gb"`
	DiskUsedGB    float64 `json:"disk_used_gb"`
	DiskPercent   float64 `json:"disk_percent"`
}

type ToolDefinition struct {
	Name            string
	Category        string // "database", "archive", "security", "network"
	Label           string
	DatabaseType    string
	Description     string
	VersionArgs     []string
	InstallCommands map[string]string
}

type ToolStatus struct {
	Name            string            `json:"name"`
	Category        string            `json:"category"`
	Label           string            `json:"label"`
	DatabaseType    string            `json:"database_type,omitempty"`
	Installed       bool              `json:"installed"`
	Path            string            `json:"path"`
	Version         string            `json:"version"`
	Description     string            `json:"description"`
	InstallCommands map[string]string `json:"install_commands"`
	DefaultCommand  string            `json:"default_command"`
}

type ToolSummary struct {
	TotalDatabaseTools int `json:"total_database_tools"`
	ReadyDatabaseTools int `json:"ready_database_tools"`
	TotalSystemTools   int `json:"total_system_tools"`
	ReadySystemTools   int `json:"ready_system_tools"`
}

type EnvironmentResponse struct {
	Host    HostInfo     `json:"host"`
	Runtime RuntimeInfo  `json:"runtime"`
	Tools   []ToolStatus `json:"tools"`
	Summary ToolSummary  `json:"summary"`
}

var allToolDefinitions = []ToolDefinition{
	{
		Name:         "mysqldump",
		Category:     "database",
		Label:        "MySQL / MariaDB 逻辑转储",
		DatabaseType: "mysql",
		Description:  "用于导出和备份 MySQL / MariaDB 数据库结构与完整数据 (核心依赖)",
		VersionArgs:  []string{"--version"},
		InstallCommands: map[string]string{
			"apt":     "sudo apt-get update && sudo apt-get install -y default-mysql-client",
			"dnf":     "sudo dnf install -y mysql",
			"yum":     "sudo yum install -y mysql",
			"apk":     "sudo apk add mysql-client",
			"pacman":  "sudo pacman -Sy --noconfirm mariadb-clients",
			"winget":  "winget install Oracle.MySQL",
			"choco":   "choco install mysql-cli -y",
			"windows": "winget install Oracle.MySQL 或将 MySQL 安装路径中的 bin 目录加入环境变量 Path",
			"brew":    "brew install mysql-client",
		},
	},
	{
		Name:         "mysql",
		Category:     "database",
		Label:        "MySQL / MariaDB 客户端工具",
		DatabaseType: "mysql",
		Description:  "用于探测连接有效性及查询数据库元数据",
		VersionArgs:  []string{"--version"},
		InstallCommands: map[string]string{
			"apt":     "sudo apt-get update && sudo apt-get install -y default-mysql-client",
			"dnf":     "sudo dnf install -y mysql",
			"yum":     "sudo yum install -y mysql",
			"apk":     "sudo apk add mysql-client",
			"pacman":  "sudo pacman -Sy --noconfirm mariadb-clients",
			"winget":  "winget install Oracle.MySQL",
			"windows": "winget install Oracle.MySQL",
			"brew":    "brew install mysql-client",
		},
	},
	{
		Name:         "pg_dump",
		Category:     "database",
		Label:        "PostgreSQL 逻辑转储",
		DatabaseType: "postgresql",
		Description:  "用于导出和备份 PostgreSQL 数据库结构与数据 (核心依赖)",
		VersionArgs:  []string{"--version"},
		InstallCommands: map[string]string{
			"apt":     "sudo apt-get update && sudo apt-get install -y postgresql-client",
			"dnf":     "sudo dnf install -y postgresql",
			"yum":     "sudo yum install -y postgresql",
			"apk":     "sudo apk add postgresql-client",
			"pacman":  "sudo pacman -Sy --noconfirm postgresql-libs",
			"winget":  "winget install PostgreSQL.PostgreSQL",
			"windows": "winget install PostgreSQL.PostgreSQL",
			"brew":    "brew install libpq && brew link --force libpq",
		},
	},
	{
		Name:         "psql",
		Category:     "database",
		Label:        "PostgreSQL 客户端工具",
		DatabaseType: "postgresql",
		Description:  "用于测试 PostgreSQL 连接与元数据查询",
		VersionArgs:  []string{"--version"},
		InstallCommands: map[string]string{
			"apt":     "sudo apt-get update && sudo apt-get install -y postgresql-client",
			"dnf":     "sudo dnf install -y postgresql",
			"yum":     "sudo yum install -y postgresql",
			"apk":     "sudo apk add postgresql-client",
			"pacman":  "sudo pacman -Sy --noconfirm postgresql-libs",
			"winget":  "winget install PostgreSQL.PostgreSQL",
			"windows": "winget install PostgreSQL.PostgreSQL",
			"brew":    "brew install libpq && brew link --force libpq",
		},
	},
	{
		Name:         "redis-cli",
		Category:     "database",
		Label:        "Redis 命令行工具",
		DatabaseType: "redis",
		Description:  "用于执行 Redis SYNC / SAVE 指令触发数据持久化与连接测试",
		VersionArgs:  []string{"--version"},
		InstallCommands: map[string]string{
			"apt":     "sudo apt-get update && sudo apt-get install -y redis-tools",
			"dnf":     "sudo dnf install -y redis",
			"yum":     "sudo yum install -y redis",
			"apk":     "sudo apk add redis",
			"pacman":  "sudo pacman -Sy --noconfirm redis",
			"winget":  "choco install redis-64 -y",
			"windows": "choco install redis-64 -y 或通过 Memurai / Redis 官网安装",
			"brew":    "brew install redis",
		},
	},
	{
		Name:         "mongodump",
		Category:     "database",
		Label:        "MongoDB 集合转储",
		DatabaseType: "mongodb",
		Description:  "用于导出和备份 MongoDB 集合及元数据 (核心依赖)",
		VersionArgs:  []string{"--version"},
		InstallCommands: map[string]string{
			"apt":     "sudo apt-get update && sudo apt-get install -y mongodb-database-tools",
			"dnf":     "sudo dnf install -y mongodb-database-tools",
			"yum":     "sudo yum install -y mongodb-org-tools",
			"apk":     "sudo apk add mongodb-tools",
			"pacman":  "sudo pacman -Sy --noconfirm mongodb-tools",
			"winget":  "winget install MongoDB.DatabaseTools",
			"windows": "winget install MongoDB.DatabaseTools",
			"brew":    "brew install mongodb-database-tools",
		},
	},
	{
		Name:         "sqlite3",
		Category:     "database",
		Label:        "SQLite 命令行工具",
		DatabaseType: "sqlite",
		Description:  "用于验证 SQLite 数据库完整性与数据导出",
		VersionArgs:  []string{"--version"},
		InstallCommands: map[string]string{
			"apt":     "sudo apt-get update && sudo apt-get install -y sqlite3",
			"dnf":     "sudo dnf install -y sqlite",
			"yum":     "sudo yum install -y sqlite",
			"apk":     "sudo apk add sqlite",
			"pacman":  "sudo pacman -Sy --noconfirm sqlite",
			"winget":  "winget install SQLite.SQLite",
			"windows": "winget install SQLite.SQLite",
			"brew":    "brew install sqlite",
		},
	},
	{
		Name:         "sqlcmd",
		Category:     "database",
		Label:        "SQL Server 命令行工具",
		DatabaseType: "mssql",
		Description:  "用于执行 Microsoft SQL Server 备份指令",
		VersionArgs:  []string{"-?"},
		InstallCommands: map[string]string{
			"apt":     "sudo apt-get update && sudo apt-get install -y mssql-tools18 unixodbc-dev",
			"dnf":     "sudo dnf install -y mssql-tools18 unixODBC-devel",
			"yum":     "sudo yum install -y mssql-tools18 unixODBC-devel",
			"winget":  "winget install Microsoft.Sqlcmd",
			"windows": "winget install Microsoft.Sqlcmd",
			"brew":    "brew install mssql-tools18",
		},
	},
	{
		Name:         "tar",
		Category:     "archive",
		Label:        "Tar 归档打包工具",
		Description:  "GoBackup 用于将备份数据打包为单一归档文件的核心工具",
		VersionArgs:  []string{"--version"},
		InstallCommands: map[string]string{
			"apt":     "sudo apt-get install -y tar",
			"dnf":     "sudo dnf install -y tar",
			"yum":     "sudo yum install -y tar",
			"apk":     "sudo apk add tar",
			"windows": "Windows 10/11 系统已内置 C:\\Windows\\System32\\tar.exe",
			"brew":    "brew install gnu-tar",
		},
	},
	{
		Name:         "gzip",
		Category:     "archive",
		Label:        "Gzip 压缩工具",
		Description:  "用于将归档生成 .tar.gz / .tgz 压缩包",
		VersionArgs:  []string{"--version"},
		InstallCommands: map[string]string{
			"apt":     "sudo apt-get install -y gzip",
			"dnf":     "sudo dnf install -y gzip",
			"yum":     "sudo yum install -y gzip",
			"apk":     "sudo apk add gzip",
			"windows": "choco install gzip -y",
			"brew":    "brew install gzip",
		},
	},
	{
		Name:         "bzip2",
		Category:     "archive",
		Label:        "Bzip2 压缩工具",
		Description:  "用于生成 .tar.bz2 格式高压缩比备份",
		VersionArgs:  []string{"--help"},
		InstallCommands: map[string]string{
			"apt":     "sudo apt-get install -y bzip2",
			"dnf":     "sudo dnf install -y bzip2",
			"yum":     "sudo yum install -y bzip2",
			"apk":     "sudo apk add bzip2",
			"windows": "choco install bzip2 -y",
			"brew":    "brew install bzip2",
		},
	},
	{
		Name:         "xz",
		Category:     "archive",
		Label:        "XZ 压缩工具",
		Description:  "用于生成 .tar.xz 格式极限压缩率备份",
		VersionArgs:  []string{"--version"},
		InstallCommands: map[string]string{
			"apt":     "sudo apt-get install -y xz-utils",
			"dnf":     "sudo dnf install -y xz",
			"yum":     "sudo yum install -y xz",
			"apk":     "sudo apk add xz",
			"windows": "choco install xz -y",
			"brew":    "brew install xz",
		},
	},
	{
		Name:         "openssl",
		Category:     "security",
		Label:        "OpenSSL 加密工具",
		Description:  "用于对备份文件进行 AES-256 加密保护",
		VersionArgs:  []string{"version"},
		InstallCommands: map[string]string{
			"apt":     "sudo apt-get install -y openssl",
			"dnf":     "sudo dnf install -y openssl",
			"yum":     "sudo yum install -y openssl",
			"apk":     "sudo apk add openssl",
			"winget":  "winget install ShiningLight.OpenSSL",
			"windows": "winget install ShiningLight.OpenSSL 或 choco install openssl -y",
			"brew":    "brew install openssl",
		},
	},
	{
		Name:         "curl",
		Category:     "network",
		Label:        "cURL 网络传输",
		Description:  "用于网络健康探测与 Webhook 告警通知",
		VersionArgs:  []string{"--version"},
		InstallCommands: map[string]string{
			"apt":     "sudo apt-get install -y curl",
			"dnf":     "sudo dnf install -y curl",
			"yum":     "sudo yum install -y curl",
			"apk":     "sudo apk add curl",
			"windows": "Windows 10/11 系统已内置 C:\\Windows\\System32\\curl.exe",
			"brew":    "brew install curl",
		},
	},
	{
		Name:         "ssh",
		Category:     "network",
		Label:        "SSH 安全客户端",
		Description:  "用于 SCP / SFTP 存储认证与远程脚本执行",
		VersionArgs:  []string{"-V"},
		InstallCommands: map[string]string{
			"apt":     "sudo apt-get install -y openssh-client",
			"dnf":     "sudo dnf install -y openssh-clients",
			"yum":     "sudo yum install -y openssh-clients",
			"apk":     "sudo apk add openssh-client",
			"windows": "在 Windows 设置 -> 系统 -> 可选功能 中添加 OpenSSH 客户端",
			"brew":    "brew install openssh",
		},
	},
	{
		Name:         "rsync",
		Category:     "network",
		Label:        "Rsync 增量同步工具",
		Description:  "用于本地与异地服务器大文件差异同步",
		VersionArgs:  []string{"--version"},
		InstallCommands: map[string]string{
			"apt":     "sudo apt-get install -y rsync",
			"dnf":     "sudo dnf install -y rsync",
			"yum":     "sudo yum install -y rsync",
			"apk":     "sudo apk add rsync",
			"windows": "choco install rsync -y",
			"brew":    "brew install rsync",
		},
	},
}

// detectPreferredPM returns preferred package manager and all available ones.
func detectPreferredPM(distro string) (string, []string) {
	pms := []string{"dnf", "apt-get", "apt", "yum", "apk", "pacman", "zypper", "winget", "choco", "brew"}
	available := []string{}
	for _, pm := range pms {
		if _, err := exec.LookPath(pm); err == nil {
			if pm == "apt-get" {
				pm = "apt"
			}
			if !hasString(available, pm) {
				available = append(available, pm)
			}
		}
	}

	if runtime.GOOS == "windows" {
		if hasString(available, "winget") {
			return "winget", available
		}
		return "windows", available
	}
	if runtime.GOOS == "darwin" {
		return "brew", available
	}

	// Linux selection based on existing binary or distro
	if hasString(available, "dnf") {
		return "dnf", available
	}
	if hasString(available, "apt") {
		return "apt", available
	}
	if hasString(available, "yum") {
		return "yum", available
	}
	if hasString(available, "apk") {
		return "apk", available
	}
	if hasString(available, "pacman") {
		return "pacman", available
	}

	// Fallback based on distro string
	d := strings.ToLower(distro)
	switch {
	case strings.Contains(d, "ubuntu"), strings.Contains(d, "debian"), strings.Contains(d, "deepin"), strings.Contains(d, "uos"):
		return "apt", available
	case strings.Contains(d, "openeuler"), strings.Contains(d, "anolis"), strings.Contains(d, "kylin"), strings.Contains(d, "centos"), strings.Contains(d, "rhel"), strings.Contains(d, "rocky"), strings.Contains(d, "fedora"):
		return "dnf", available
	case strings.Contains(d, "alpine"):
		return "apk", available
	default:
		return "apt", available
	}
}

func hasString(list []string, item string) bool {
	for _, s := range list {
		if s == item {
			return true
		}
	}
	return false
}

// GetToolInstallCommand returns the best command to install toolName on host.
func GetToolInstallCommand(toolName, preferredPM string) string {
	for _, def := range allToolDefinitions {
		if def.Name == toolName {
			if cmd, ok := def.InstallCommands[preferredPM]; ok && len(cmd) > 0 {
				return cmd
			}
			if cmd, ok := def.InstallCommands["apt"]; ok && len(cmd) > 0 {
				return cmd
			}
		}
	}
	return ""
}

// CheckDumpTool checks if the required dump tool for dbType is installed.
func CheckDumpTool(dbType string) (toolName string, found bool, path string, installCmd string) {
	switch dbType {
	case "mysql", "mariadb":
		toolName = "mysqldump"
	case "postgresql":
		toolName = "pg_dump"
	case "mongodb":
		toolName = "mongodump"
	case "redis":
		toolName = "redis-cli"
	case "sqlite":
		toolName = "sqlite3"
	case "mssql":
		toolName = "sqlcmd"
	default:
		return "", true, "", ""
	}

	p, err := exec.LookPath(toolName)
	found = (err == nil)
	path = p

	_, distro := getPlatformInfo()
	preferredPM, _ := detectPreferredPM(distro)
	installCmd = GetToolInstallCommand(toolName, preferredPM)
	return toolName, found, path, installCmd
}

func collectToolStatus(preferredPM string) ([]ToolStatus, ToolSummary) {
	result := make([]ToolStatus, 0, len(allToolDefinitions))
	summary := ToolSummary{}

	for _, def := range allToolDefinitions {
		status := ToolStatus{
			Name:            def.Name,
			Category:        def.Category,
			Label:           def.Label,
			DatabaseType:    def.DatabaseType,
			Description:     def.Description,
			InstallCommands: def.InstallCommands,
		}

		if defaultCmd, ok := def.InstallCommands[preferredPM]; ok {
			status.DefaultCommand = defaultCmd
		} else if defaultCmd, ok := def.InstallCommands["apt"]; ok {
			status.DefaultCommand = defaultCmd
		}

		p, err := exec.LookPath(def.Name)
		if err == nil {
			status.Installed = true
			status.Path = p
			status.Version = runToolVersion(p, def.VersionArgs)
		} else {
			status.Installed = false
		}

		if def.Category == "database" {
			summary.TotalDatabaseTools++
			if status.Installed {
				summary.ReadyDatabaseTools++
			}
		} else {
			summary.TotalSystemTools++
			if status.Installed {
				summary.ReadySystemTools++
			}
		}

		result = append(result, status)
	}

	return result, summary
}

func runToolVersion(binaryPath string, args []string) string {
	if len(args) == 0 {
		return "已就绪"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
	defer cancel()

	cmd := exec.CommandContext(ctx, binaryPath, args...)
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	_ = cmd.Run()

	output := out.String()
	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		if len(line) > 0 {
			if len(line) > 90 {
				return line[:90] + "..."
			}
			return line
		}
	}
	return "已就绪"
}

// GET /api/system/environment
func getSystemEnvironment(c *gin.Context) {
	hostname, _ := os.Hostname()
	platform, distro := getPlatformInfo()
	preferredPM, availablePMs := detectPreferredPM(distro)

	host := HostInfo{
		Hostname:     hostname,
		OS:           runtime.GOOS,
		Platform:     platform,
		Distribution: distro,
		Arch:         runtime.GOARCH,
		CPUCores:     runtime.NumCPU(),
		GoVersion:    runtime.Version(),
		PreferredPM:  preferredPM,
		AvailablePMs: availablePMs,
	}

	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)
	allocMB := float64(memStats.Alloc) / (1024 * 1024)

	totalMB, usedMB, memPercent, ok := getSystemMemory()
	if !ok {
		totalMB = allocMB
		usedMB = allocMB
		memPercent = 0
	}

	workDir, _ := os.Getwd()
	tempDir := viper.GetString("workdir")
	if len(tempDir) == 0 {
		tempDir = viper.GetString("web.workdir")
	}
	if len(tempDir) == 0 {
		tempDir = os.TempDir()
	}

	checkDiskDir := tempDir
	if len(checkDiskDir) == 0 {
		checkDiskDir = config.GoBackupDir
	}
	if len(checkDiskDir) == 0 {
		checkDiskDir = workDir
	}

	probeDir := checkDiskDir
	for {
		if _, err := os.Stat(probeDir); err == nil {
			break
		}
		parent := filepath.Dir(probeDir)
		if parent == probeDir || parent == "." || parent == "" {
			break
		}
		probeDir = parent
	}

	diskTotalGB, diskFreeGB, diskUsedGB, diskPercent, _ := getSystemDisk(probeDir)

	now := time.Now()
	uptime := int64(now.Sub(serverStartTime).Seconds())

	runtimeInfo := RuntimeInfo{
		Version:       currentVersion,
		PID:           os.Getpid(),
		StartTime:     serverStartTime.Format("2006-01-02 15:04:05"),
		UptimeSeconds: uptime,
		WorkDir:       workDir,
		TempDir:       tempDir,
		ConfigFile:    viper.ConfigFileUsed(),
		StateDir:      config.GoBackupDir,
		MemoryAllocMB: allocMB,
		MemoryTotalMB: totalMB,
		MemoryUsedMB:  usedMB,
		MemoryPercent: memPercent,
		DiskPath:      checkDiskDir,
		DiskTotalGB:   diskTotalGB,
		DiskFreeGB:    diskFreeGB,
		DiskUsedGB:    diskUsedGB,
		DiskPercent:   diskPercent,
	}

	tools, summary := collectToolStatus(preferredPM)

	c.JSON(http.StatusOK, EnvironmentResponse{
		Host:    host,
		Runtime: runtimeInfo,
		Tools:   tools,
		Summary: summary,
	})
}
