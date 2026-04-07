# Claude Desktop Patch

让 Claude Desktop (Windows) 接入自定义 API 端点，支持三种方案。

![alt text](image.png)

---

## 方案对比

| | 方案 1 - 3P Gateway | 方案 2 - 3P HTTP Patch | 方案 3 - 官方版补丁 |
|---|---|---|---|
| **目录** | `scheme-3p-gateway/` | `scheme-3p-http-patch/` | `scheme-full-patch/` |
| **原理** | 仅写注册表，利用官方 3P 接口 | 注册表 + 去除 HTTPS 限制 | 便携副本 + 功能解锁补丁 |
| **是否修改文件** | 否 | 是（便携副本） | 是（便携副本） |
| **需要登录** | 否 | 否 | 是（Anthropic 账号） |
| **端点要求** | **HTTPS** | HTTP / HTTPS 均可 | — |
| **推荐程度** | ⭐ 推荐 | 需要 HTTP 时使用 | 需要官方功能解锁时使用 |

---

## 环境要求

- **Windows**（目前仅支持 Windows）
- **Node.js** >= 18（[下载](https://nodejs.org)）
- **Claude Desktop** 已安装（[下载](https://claude.ai/download)）
- 网络代理（如果你所在地区无法直连 claude.ai）

---

## ⭐ 方案 1 - 3P Gateway（推荐）

> 仅写注册表，不修改任何 Claude 文件。通过官方 3P Gateway 接口将请求路由到自定义端点，免登录。

### 前提

- 你的 API 端点必须是 **HTTPS**（Claude Desktop 强制要求）

### 使用

```powershell
# 交互式（自动检测 ~/.claude/settings.json 配置）
.\scheme-3p-gateway\setup.bat

# 直接复用 CLI 配置
powershell -File scheme-3p-gateway\setup.ps1 -FromCli

# 手动指定
powershell -File scheme-3p-gateway\setup.ps1 -BaseUrl "https://your-api.com" -ApiKey "sk-xxx"

# 查看当前配置
powershell -File scheme-3p-gateway\setup.ps1 -Status
```

### 卸载

```powershell
.\scheme-3p-gateway\uninstall.bat
```

### 注册表位置

写入 `HKCU\SOFTWARE\Policies\Claude`（或 `HKLM`），包含：

| 键 | 说明 |
|---|---|
| `custom3pProvider` | `gateway` |
| `custom3pBaseUrl` | 你的 API 端点 |
| `custom3pApiKey` | API Key |
| `custom3pModels` | 模型列表 JSON（可选） |

---

## 方案 2 - 3P Gateway + HTTP Patch

> 在方案 1 基础上，去除 HTTPS 限制。适合使用 `http://localhost` 等本地端点的场景。免登录。

### 原理

1. 复制官方 Claude 到本地 `claude-portable/` 目录
2. 解包 `app.asar` → 移除 Zod HTTPS 校验 → 重新打包
3. 关闭 Electron fuse 完整性校验
4. 写入 3P Gateway 注册表

### 使用

```powershell
# 需要管理员权限
cd scheme-3p-http-patch
node setup.js
```

脚本会自动读取 `~/.claude/settings.json` 中的配置。

### 卸载

```powershell
cd scheme-3p-http-patch
node setup.js --uninstall
```

---

## 方案 3 - 官方版补丁（需登录）

> 需要 Anthropic 账号登录。在官方版基础上解锁隐藏功能。

### 解锁功能

| 功能 | 说明 |
|---|---|
| **Code Tab** | 绕过平台/VM 检查，启用代码编辑器 |
| **Operon** | 解锁 Operon 功能 |
| **Computer Use** | 绕过平台检查，启用计算机使用 |
| **Feature Flags** | 解锁全部功能开关 |
| **CLI 环境变量** | 自动读取 `~/.claude/settings.json` 的 `env` 字段 |
| **DevTools** | Ctrl+Shift+I / F12 打开开发者工具 |
| **中文界面** | 强制 zh-CN 语言 |
| **遥测关闭** | 禁用所有遥测上报 |

### 使用

```powershell
# 需要管理员权限
cd scheme-full-patch
node setup.js
```

### 卸载

```powershell
cd scheme-full-patch
node setup.js --uninstall
```

### Claude Code 环境变量

补丁版会自动读取 `~/.claude/settings.json` 中的 `env` 字段，注入到 Claude Code 子进程：

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:8317",
    "ANTHROPIC_AUTH_TOKEN": "sk-xxx",
    "ANTHROPIC_MODEL": "your-model-id"
  }
}
```

---

## GitHub Release

本项目通过 GitHub Action 每日自动检测 Claude Desktop 新版本。发现更新时自动创建 Release，包含：

| 文件 | 说明 |
|---|---|
| `Claude-Desktop-vX.X.X-x64.exe` | 官方安装包 |
| `scheme-3p-gateway.zip` | 方案 1：3P Gateway（免登录，HTTPS） |
| `scheme-3p-http-patch.zip` | 方案 2：HTTP Patch（免登录，HTTP+HTTPS） |
| `scheme-full-patch.zip` | 方案 3：官方版补丁（需登录，功能解锁） |

前往 [Releases](../../releases) 页面下载。

---

## 项目结构

```
claude-app-patch/
├── scheme-3p-gateway/        # 方案1：3P Gateway（免登录，HTTPS）
│   ├── setup.ps1
│   ├── setup.bat
│   └── uninstall.bat
├── scheme-3p-http-patch/     # 方案2：3P + HTTP Patch（免登录）
│   ├── setup.js
│   ├── setup.bat
│   └── uninstall.bat
├── scheme-full-patch/        # 方案3：官方版补丁（需登录）
│   ├── setup.js
│   ├── setup.bat
│   └── uninstall.bat
├── scripts/
│   ├── check-version.js      # 版本检测脚本
│   └── version.txt           # 当前跟踪版本
├── .github/workflows/
│   └── check-update.yml      # 自动检测 + Release
├── package.json
└── README.md
```

---

## 常见问题

**Q: 方案 1 提示 URL 必须是 HTTPS？**
A: Claude Desktop 官方 3P Gateway 强制要求 HTTPS 端点。如果你的端点是 HTTP（如 localhost），请使用方案 2。

**Q: 补丁后 Claude 更新了怎么办？**
A: 方案 2 和 3 使用便携副本，不影响官方安装。官方更新后重新运行 setup 即可。方案 1 无需重新操作。

**Q: 为什么不直接修改官方安装目录？**
A: Claude Desktop 通过 MSIX 安装在 `WindowsApps` 目录，该目录有系统级写保护，即使管理员也无法修改。因此方案 2/3 采用便携副本方式。

---

## 夹带私货

gemini，claude，openAI全模型，包含纯血高速opus4.6（可以用所有检测工具测试）
也有性价比opus4.6(提示词污染)渠道可以免费用哦，
注册、签到、拉新都送token

中转链接：
https://new2.882111.xyz/

交流群

![alt text](6ce0d5bd6137a53e49e0426764008c5e.png)
