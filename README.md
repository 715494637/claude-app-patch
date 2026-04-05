# Claude Desktop Patcher

一键解锁 Claude Desktop (Windows) 隐藏功能的补丁工具。

## 解锁功能

| 功能 | 说明 |
|------|------|
| **Code Tab** | 绕过平台/VM 检查，直接启用代码编辑器侧边栏 |
| **开发者特性** | 绕过 `isPackaged` 检查，启用开发者模式 |
| **Operon** | 解锁 Operon 功能（直接返回 supported） |
| **Computer Use** | 绕过平台检查，启用计算机使用功能 |
| **默认侧边栏** | 将默认 `sidebarMode` 设为 `"code"` |

## 使用方法

```bash
# 1. 安装依赖
npm install

# 2. 运行补丁（自动查找 Claude 安装目录）
node patch-claude.js

# 3. 仅预览，不实际修改
node patch-claude.js --dry-run
```

## 工作原理

1. 自动定位 Claude Desktop 的 `app.asar` 文件
2. 解包 → 应用补丁 → 重新打包
3. 重新计算完整性哈希并写回可执行文件
4. 补丁完成后直接启动 Claude Desktop

## 环境要求

- **Windows** (目前仅支持 Windows)
- **Node.js** ≥ 18
- **Claude Desktop** 已安装

## 免责声明

本工具仅供学习和研究用途。使用本工具修改 Claude Desktop 可能违反 Anthropic 的服务条款，请自行承担风险。
