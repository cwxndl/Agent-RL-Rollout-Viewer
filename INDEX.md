# 📚 Agent RL Rollout Viewer - 文档索引

欢迎使用Agent RL Rollout Viewer VSCode插件！

## 🎯 从这里开始

### 我是新手，该看哪个文档？
👉 请阅读 **[QUICK_START.md](QUICK_START.md)** - 10分钟快速上手

### 我需要详细的安装步骤
👉 请阅读 **[SETUP_GUIDE.md](SETUP_GUIDE.md)** - 完整安装指南

### 我想了解项目架构
👉 请阅读 **[PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)** - 项目总结

### 我需要修改viewer.html
👉 请阅读 **[VIEWER_MODIFICATIONS.md](VIEWER_MODIFICATIONS.md)** - 修改指南

### 我想看项目介绍
👉 请阅读 **[README.md](README.md)** - 项目README

## 📖 文档列表

| 文档 | 内容 | 适合人群 |
|------|------|----------|
| [README.md](README.md) | 项目介绍、特性、快速开始 | 所有人 |
| [QUICK_START.md](QUICK_START.md) | 10分钟快速入门 | 新手 |
| [SETUP_GUIDE.md](SETUP_GUIDE.md) | 详细安装和配置指南 | 需要深入了解的人 |
| [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) | 项目架构、设计、实现细节 | 开发者 |
| [VIEWER_MODIFICATIONS.md](VIEWER_MODIFICATIONS.md) | viewer.html修改指南 | 需要集成的人 |
| [INDEX.md](INDEX.md) | 本文档，文档导航 | 所有人 |

## 🚀 快速导航

### 安装流程
1. [查看前置要求](QUICK_START.md#1️⃣-前置准备)
2. [构建插件](QUICK_START.md#2️⃣-构建插件)
3. [修改viewer.html](VIEWER_MODIFICATIONS.md)
4. [安装到VSCode](QUICK_START.md#4️⃣-安装插件)
5. [配置使用](QUICK_START.md#5️⃣-配置rollout文件夹)

### 使用流程
1. [设置rollout文件夹](QUICK_START.md#5️⃣-配置rollout文件夹)
2. [打开TreeView](QUICK_START.md#6️⃣-使用插件)
3. [查看step数据](SETUP_GUIDE.md#2-浏览rollout数据)
4. [分析轨迹](README.md#-特性)

### 开发调试
1. [本地调试](QUICK_START.md#8️⃣-调试开发)
2. [查看日志](QUICK_START.md#查看webview日志)
3. [故障排除](QUICK_START.md#9️⃣-故障排除)

## 💡 常见场景

### 场景1：第一次使用
```
1. 阅读 QUICK_START.md
2. 运行 ./build.sh
3. 按照 VIEWER_MODIFICATIONS.md 修改HTML
4. 安装插件
5. 设置rollout文件夹
6. 开始使用
```

### 场景2：遇到问题
```
1. 查看 QUICK_START.md 的故障排除部分
2. 检查 SETUP_GUIDE.md 的调试章节
3. 查看VSCode输出面板
4. 打开Webview开发者工具
```

### 场景3：想要定制
```
1. 阅读 PROJECT_SUMMARY.md 了解架构
2. 修改 media/viewer.html 定制UI
3. 修改 src/extension.ts 添加新功能
4. 重新构建并测试
```

### 场景4：团队使用
```
1. 分享 README.md 介绍项目
2. 提供 QUICK_START.md 快速上手
3. 配置workspace settings.json
4. 统一rollout文件夹结构
```

## 🛠️ 核心文件说明

| 文件路径 | 说明 | 何时修改 |
|---------|------|----------|
| `package.json` | 插件配置 | 添加命令/视图/配置 |
| `src/extension.ts` | 主要逻辑 | 添加新功能 |
| `media/viewer.html` | 可视化界面 | 定制UI |
| `tsconfig.json` | TS配置 | 很少修改 |
| `build.sh` | 构建脚本 | 很少修改 |

## 🎯 核心概念

### TreeView
- 左侧活动栏的文件树视图
- 显示所有step文件夹
- 代码：`RolloutTreeProvider`

### Webview
- 右侧的可视化面板
- 加载`viewer.html`
- 代码：`vscode.window.createWebviewPanel`

### 数据流
```
Extension ←→ Webview
  ↓              ↓
读取JSON    显示可视化
  ↓              ↓
postMessage → 传递数据
```

## 📞 获取帮助

### 文档没有解决我的问题？
1. 查看VSCode输出面板的日志
2. 打开Webview开发者工具
3. 检查浏览器控制台错误
4. 查阅VSCode Extension API文档

### 发现Bug？
请提供：
1. VSCode版本
2. 插件版本
3. 错误日志
4. 复现步骤

### 想要新功能？
欢迎提出建议！

## 🎉 快速命令参考

```bash
# 构建
./build.sh

# 或手动构建
npm install
npm run compile
npm run package

# 安装
code --install-extension agent-rl-rollout-viewer-0.1.0.vsix

# 调试
# 1. 在VSCode中打开项目文件夹
# 2. 按F5
```

## 📊 项目状态

- [x] 项目结构创建
- [x] TypeScript代码编写
- [x] 配置文件完成
- [x] 文档编写完成
- [ ] viewer.html修改（需要手动完成）
- [ ] 插件构建
- [ ] 插件安装
- [ ] 实际使用测试

---

**下一步**：按照 [QUICK_START.md](QUICK_START.md) 开始构建和使用！
