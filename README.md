<p align="center">
  <img src="https://user-images.githubusercontent.com/5518/205909959-12b92929-4ac5-4bb5-9111-6f9a3ed76cf6.png" width="130" alt="GoBackup Logo" />
  <h1 align="center">GoBackup (Modern Web Console Edition)</h1>
  <p align="center">轻量、易用、低维护的企业级数据库与文件自动化备份工具，内置现代 Web 可视化管理面板</p>
</p>

---

## 📖 项目简介

**GoBackup** 是一个为应用服务器和中小型业务系统设计的备份工具。内置计划任务（Cron / 定时调度），能够安全、自动地将数据库、文件和配置文件导出、压缩、加密，并统一归档存储至本地或各大云存储服务（如阿里云 OSS、腾讯云 COS、AWS S3、FTP/SFTP、MinIO、WebDAV 等）。

本项目在原生 GoBackup 的高可靠备份内核之上，全面升级了**现代化的 Web 管理控制台**，提供任务中心实时日志流追踪、备份文件可视化浏览下载、在线 YAML 配置校验与编辑、服务健康诊断等功能，实现从命令行到可视化运维的全方位支持。

---

## ✨ 核心特性

- **现代 Web 管理面板**：
  - 基于 React 18 + TanStack Router + Tailwind CSS + Semi UI 构建，极致黑灰极简现代设计，支持深浅色模式与移动端自适应。
  - **任务中心**：历史任务列表、实时执行耗时、运行状态追踪；内置 SSE 实时日志流终端（支持一键回顶、追踪最新、历史任务默认定位于头部）。
  - **备份文件浏览器**：可视化浏览备份归档树，支持文件大小/时间查看、一键安全下载与在线删除。
  - **可视化配置中心**：在线编辑 `gobackup.yml`，内置语法高亮、配置项校验、一键重载配置。
  - **诊断探针**：在线测试数据库连接性与存储后端健康度。
- **全内置单二进制运行**：前端静态资源通过 Go 1.16+ `embed` 完整编译嵌入二进制可执行文件中，无需独立配置 Nginx 或前端 Node 服务，开箱即用。
- **丰富的数据库源支持**：
  - MySQL / MariaDB
  - PostgreSQL
  - Redis (Sync / RDB / Invoke Save)
  - MongoDB
  - SQLite
  - Microsoft SQL Server
  - InfluxDB
  - etcd
  - Firebird
- **多类型存储后端支持**：
  - **本地存储**：Local Storage（自动保留保留天数/周期清理）
  - **网络传输**：FTP、SFTP、SCP（SSH Copy）
  - **对象存储**：AWS S3、阿里云 OSS、腾讯云 COS、七牛云 Kodo、百度云 BOS、华为云 OBS、火山引擎 TOS、Cloudflare R2、MinIO、Google Cloud Storage (GCS)、Azure Blob、Backblaze B2、DigitalOcean Spaces、UCloud US3
  - **标准协议**：WebDAV
- **备份安全与压缩**：
  - 压缩算法：`tgz` (tar.gz)、`tar.bz2`、`tar.xz`、`zip`
  - 安全加密：支持 OpenSSL AES-256 加密保护
  - 分卷切割：支持将超大备份包切分为指定大小（如 1GB/分卷）
- **告警与通知集成**：
  - 备份成功/失败即时通知：飞书 (Feishu)、钉钉 (DingTalk)、邮件 (SMTP)、企业微信/Webhook、Slack、Discord、Telegram、GitHub Issue 等。

---

## 🚀 快速上手：怎么用？

### 1. 准备运行环境

- **数据库客户端工具**：GoBackup 导出数据依赖对应的 CLI 工具，请确保运行机器上已安装且在系统 `PATH` 中：
  - MySQL / MariaDB: `mysqldump`
  - PostgreSQL: `pg_dump`
  - MongoDB: `mongodump`
  - Redis: `redis-cli`
- **Go 环境**（若需从源码编译）：Go 1.20 或更高版本。
- **Node.js 环境**（仅开发或重新打包前端时需要）：Node.js 18+ 及 `pnpm`。

---

### 2. 编写配置文件 `gobackup.yml`

GoBackup 的所有备份模型、调度、存储和 Web 服务都由 YAML 配置文件驱动。

在当前目录或自定义路径下创建 `gobackup.yml`：

```yaml
# Web 管理后台配置
web:
  enabled: true
  host: 0.0.0.0      # 监听地址，0.0.0.0 允许公网/局域网访问，127.0.0.1 仅本机访问
  port: 8899         # 访问端口
  username: admin    # 登录用户名
  password: your_secure_password # 登录密码

# 备份任务定义（可配置多个）
models:
  # 示例 1：MySQL 数据库定时备份
  my_mysql_db:
    description: "生产业务 MySQL 数据库备份"
    schedule:
      every: "1day"     # 周期：可填 1day / 2h / 30m 或标准 cron 表达式
      at: "03:30"       # 每天凌晨 03:30 自动执行
    compress_with:
      type: tgz         # 压缩格式：tgz / tar.bz2 / tar.xz / zip
    storages:
      local:
        type: local
        keep: 14        # 自动保留最近 14 份历史备份，过期自动清理
        path: backups/mysql
    databases:
      main_db:
        type: mysql
        host: 127.0.0.1
        port: 3306
        database: my_database
        username: root
        password: "MySecretPassword"
        args: >-
          --default-character-set=utf8mb4
          --single-transaction
          --quick
          --no-tablespaces
          --set-gtid-purged=OFF
          --column-statistics=0

  # 示例 2：服务器配置文件归档备份至云存储
  app_config_backup:
    description: "Nginx 及应用配置备份"
    schedule:
      cron: "0 2 * * *" # 每天凌晨 2 点执行
    archive:
      includes:
        - /etc/nginx/
        - /home/app/config/
      excludes:
        - /home/app/config/*.log
    storages:
      my_oss:
        type: oss
        bucket: my-company-backup
        endpoint: oss-cn-hangzhou.aliyuncs.com
        path: /server_configs
        access_key_id: YOUR_OSS_KEY
        access_key_secret: YOUR_OSS_SECRET
        keep: 30
```

---

### 3. 构建与打包

本项目将现代化前端直接嵌入 Go 二进制，构建步骤如下：

#### 步骤 A：编译前端静态资源
```bash
cd web
pnpm install
pnpm build
cd ..
```
前端编译产物将输出在 `web/dist/` 目录中。

#### 步骤 B：编译 Go 核心程序
- **本地 Windows 环境构建**：
  ```powershell
  go build -o dist\gobackup.exe .
  ```
- **构建 Linux 服务器版本（推荐无依赖静态编译）**：
  ```bash
  # Linux / macOS 下：
  CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o dist/gobackup-linux-amd64 .

  # Windows PowerShell 下：
  $env:CGO_ENABLED="0"; $env:GOOS="linux"; $env:GOARCH="amd64"; go build -ldflags="-s -w" -o dist\gobackup-linux-amd64 .
  ```

---

### 4. 运行服务

GoBackup 支持多种运行方式：

#### 方式一：常驻前台运行（推荐调试或查看实时日志）
```bash
./gobackup run -c ./gobackup.yml
```
> 程序将前台启动，监听指定端口并同时激活定时备份调度引擎。

#### 方式二：后台守护运行（推荐服务器部署）
在独立部署目录下（例如 `/home/db-backup-server/`）：
```bash
nohup ./gobackup-linux-amd64 run -c ./gobackup.yml > gobackup.stdout.log 2>&1 &
```

#### 方式三：使用本地一键运维脚本（推荐）
在程序运行目录下放置 `restart.sh`，实现无需全局 PATH 污染的自包含自治运维：
```bash
# 赋予执行权限
chmod +x restart.sh

# 一键停止旧进程并拉起新服务
./restart.sh
```

`restart.sh` 脚本范例：
```bash
#!/bin/bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "Stopping GoBackup..."
./gobackup-linux-amd64 stop 2>/dev/null || true
pkill -9 -f "gobackup.*run" 2>/dev/null || true
rm -f ~/.gobackup/gobackup.pid
sleep 1

echo "Starting GoBackup in background..."
nohup ./gobackup-linux-amd64 run -c "$DIR/gobackup.yml" > "$DIR/gobackup.stdout.log" 2>&1 &
sleep 2

PID=$(pgrep -f "gobackup-linux-amd64 run" || true)
echo "GoBackup started successfully (PID: $PID)!"
```

---

### 5. 命令行直接执行

除了定时计划与 Web 面板，GoBackup 也支持直接从命令行交互：

```bash
# 后台启动守护进程
./gobackup start -c ./gobackup.yml

# 重启实例（默认后台平滑重启）
./gobackup restart -c ./gobackup.yml

# 重启并在前台保持运行
./gobackup restart -f -c ./gobackup.yml

# 停止正在运行的 GoBackup 实例
./gobackup stop

# 立即执行一次指定的备份模型（忽略调度时间）
./gobackup perform -m my_mysql_db -c ./gobackup.yml

# 立即执行全部备份模型
./gobackup perform -c ./gobackup.yml

# 查看帮助信息
./gobackup --help
```

---

## 🖥️ Web 管理界面使用说明

启动带有 `web.enabled: true` 的服务后，在浏览器中打开对应地址（例如 `http://<服务器IP>:8899`）：

1. **登录控制台**：输入 `gobackup.yml` 中配置的 `username` 与 `password`。
2. **总览看板 (Overview)**：
   - 查看所有已配置的模型列表、下次调度执行倒计时、最近一次执行结果。
   - 点击 **“立即备份”** 按钮可一键手工触发备份。
3. **任务中心 (Tasks)**：
   - 记录每一次备份的历史执行记录，包括触发时间、耗时、状态（Success / Failed / Running）。
   - 点击 **“查看日志”**：实时查看执行控制台日志流。历史任务将自动停在日志起始处，正在执行的任务会自动跟随最新输出；页面右上角提供“回到顶部”和“跳到最新”便捷按钮。
4. **备份文件管理 (File Browser)**：
   - 浏览各个存储端上的归档包列表、文件体积、生成时间。
   - 提供直接浏览器下载链接与文件清理操作。
5. **在线配置 (Config Editor)**：
   - 可视化查看与编辑服务器上的 `gobackup.yml`。
   - 带有 YAML 语法验证，保存后支持配置热加载。
   - 数据库连接测试时**智能预检 dump 工具**：测试 MySQL 时自动检测宿主机是否存在 `mysqldump`，未安装时即时弹出告警并提供对应操作系统的安装命令。
6. **环境检测 (Environment Diagnostics)**：
   - **系统硬件与宿主信息**：自动探测宿主机操作系统、内核版本、架构、CPU 核心数、内存使用率、备份目录磁盘空间及进程状态。
   - **16 种常用工具就绪体检**：全景覆盖主流数据库客户端与导出工具（MySQL `mysqldump`/`mysql`、PostgreSQL `pg_dump`/`psql`、MongoDB `mongodump`、Redis `redis-cli`、SQLite `sqlite3`、SQL Server `sqlcmd`）以及打包压缩与传输工具（`tar`、`gzip`、`bzip2`、`xz`、`openssl`、`curl`、`ssh`、`rsync`）。
   - **动态安装命令生成**：自动识别服务器包管理系统，精准匹配对应的安装命令（Ubuntu/Debian `apt`、openEuler/统信UOS/麒麟/CentOS `dnf`/`yum`、Alpine `apk`、Windows `winget`/PowerShell、macOS `brew`），支持一键复制以及展开跨平台对比。

---

## ⚙️ 目录结构与隔离规范

推荐将 GoBackup 部署在独立的应用目录下（例如 `/home/db-backup-server/`），保持目录自治，不侵入系统全局环境变量：

```text
/home/db-backup-server/
├── gobackup-linux-amd64    # 独立可执行二进制文件
├── gobackup.yml            # 配置文件
├── restart.sh              # 本地重启脚本（建议软链接为 ./restart）
├── gobackup.stdout.log     # 标准输出日志
└── backups/                # 本地存储模式下的备份文件存放目录
```

- **状态与全局日志目录**：GoBackup 运行时会将 PID 文件与执行日志保存至 `~/.gobackup/`（或由环境变量 `GOBACKUP_DIR` 指定的路径）。

---

## 🛠️ 本地二次开发调试

如果你需要对管理界面或后端逻辑进行扩展开发：

### 前端开发调试
```bash
cd web
pnpm install
pnpm dev
```
本地 Vite 开发服务器默认运行在 `http://localhost:5173`，并通过反向代理转发 `/api` 请求到本地 GoBackup 后端端口。

### 后端开发调试
```bash
# 在项目根目录下，直接前台运行本地 Go 进程
go run . run -c ./gobackup.yml
```

---

## 📄 开源协议

本项目基于 [MIT License](LICENSE) 协议开源。
