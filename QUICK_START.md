# 🚀 快速入门指南

## 1️⃣ 前置准备

确保你的系统已安装：
- ✅ Node.js (>= 16.0.0)
- ✅ npm (>= 8.0.0)
- ✅ VSCode (>= 1.84.0)

检查版本：
```bash
node --version
npm --version
code --version
```

## 2️⃣ 构建插件

```bash
cd /mnt/f/future/agent-rl-viewer

# 一键构建
./build.sh
```

或者手动构建：
```bash
# 安装依赖
npm install

# 编译TypeScript
npm run compile

# 打包插件
npm run package
```

## 3️⃣ 修改viewer.html

**重要**：需要手动修改 `media/viewer.html` 以支持VSCode通信。

参考 `VIEWER_MODIFICATIONS.md` 文件，主要步骤：

1. 移除文件选择器HTML
2. 在`<script>`开始处添加VSCode API代码
3. 移除`handleFiles`函数调用

## 4️⃣ 安装插件

```bash
code --install-extension agent-rl-rollout-viewer-0.1.0.vsix
```

## 5️⃣ 配置Rollout文件夹

### 方法1：通过命令面板
1. 打开VSCode
2. 按 `Ctrl+Shift+P`
3. 输入 "Agent RL: Set Rollout Folder"
4. 选择你的rollout根目录（如 `/path/to/rollout`）

### 方法2：通过设置文件
编辑 `.vscode/settings.json` 或用户设置：
```json
{
  "agentRL.rolloutFolder": "/mnt/f/future"
}
```

## 6️⃣ 使用插件

1. **打开Explorer**
   - 点击左侧活动栏的 Agent RL 图标
   - 或按 `Ctrl+Shift+E` 后切换到 Agent RL 视图

2. **查看Step列表**
   - TreeView会显示所有 `step_*` 文件夹
   - 每个step旁边显示文件数量

3. **打开Step Viewer**
   - 点击任意step文件夹
   - 右侧会打开可视化面板
   - 自动加载该step的所有JSON文件

4. **分析数据**
   - **左栏**：查看问句聚类
   - **中栏**：浏览rollout样本（按score排序）
   - **右栏**：查看详细轨迹

## 7️⃣ 常用命令

| 命令 | 快捷键 | 说明 |
|------|--------|------|
| Set Rollout Folder | `Ctrl+Shift+P` | 设置rollout根目录 |
| Refresh | 点击刷新按钮 | 刷新step列表 |
| Open Step | 点击step | 打开可视化面板 |

## 8️⃣ 调试开发

### 在VSCode中调试
1. 用VSCode打开 `agent-rl-viewer` 文件夹
2. 按 `F5` 启动调试
3. 在新窗口测试功能
4. 查看调试控制台的日志

### 查看Webview日志
1. 在webview面板上右键
2. 选择 "Open Webview Developer Tools"
3. 查看Console输出

## 9️⃣ 故障排除

### ❌ 构建失败

```bash
# 清理并重新安装
rm -rf node_modules package-lock.json
npm install
npm run compile
```

### ❌ TreeView不显示

检查配置：
```bash
# 查看当前配置
code --list-extensions
# 应该包含 your-name.agent-rl-rollout-viewer
```

### ❌ Webview空白

1. 检查 `viewer.html` 是否正确修改
2. 打开Webview Developer Tools查看错误
3. 确认 `acquireVsCodeApi()` 正确调用

### ❌ 数据加载失败

1. 确认JSON文件格式正确
2. 检查文件权限
3. 查看VSCode输出面板的日志

## 🔟 测试数据

使用你现有的数据：
```
/mnt/f/future/
├── step_1/
│   ├── 20260318_074623_xxx.json
│   ├── 20260318_074624_xxx.json
│   └── ...
├── step_2/
│   └── ...
└── step_3/
    └── ...
```

## 1️⃣1️⃣ 下一步

- ✅ 自定义UI样式
- ✅ 添加过滤和搜索功能
- ✅ 导出分析报告
- ✅ 集成到CI/CD流程

## 📚 更多资源

- [完整安装指南](SETUP_GUIDE.md)
- [Viewer修改指南](VIEWER_MODIFICATIONS.md)
- [VSCode Extension API](https://code.visualstudio.com/api)

## 💡 提示

1. **使用workspace配置**：每个项目可以有不同的rollout路径
2. **定期刷新**：点击刷新按钮更新step列表
3. **多窗口查看**：可以同时打开多个step进行对比
4. **保存状态**：webview会保留上次的查看状态

祝使用愉快！🎉
