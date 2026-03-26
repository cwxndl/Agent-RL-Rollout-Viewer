# Agent RL Rollout Viewer - VSCode插件安装指南

## 📦 项目结构

```
agent-rl-viewer/
├── package.json          # 插件配置文件
├── src/
│   └── extension.ts     # TypeScript源代码
├── media/
│   ├── viewer.html      # 可视化界面（需要修改）
│   └── icon.png         # 插件图标
├── tsconfig.json        # TypeScript配置
└── README.md
```

## 🚀 安装步骤

### 1. 安装依赖

```bash
cd /mnt/f/future/agent-rl-viewer
npm install
```

### 2. 配置TypeScript

创建 `tsconfig.json`:

```bash
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2020",
    "outDir": "out",
    "lib": ["ES2020"],
    "sourceMap": true,
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "exclude": ["node_modules", ".vscode-test"]
}
EOF
```

### 3. 修改viewer.html以支持VSCode通信

在 `media/viewer.html` 的 `<script>` 标签开始处添加：

```javascript
// VSCode API
const vscode = acquireVsCodeApi();

// 通知VSCode准备就绪
vscode.postMessage({ command: 'ready' });

// 监听来自VSCode的数据
window.addEventListener('message', event => {
    const message = event.data;
    if (message.command === 'loadData') {
        // 接收rollout数据并处理
        const rollouts = message.data;
        clusterData(rollouts);
        renderLayout();
    }
});

// 移除原来的文件选择handleFiles函数，改为从VSCode接收数据
```

### 4. 编译TypeScript

```bash
npm run compile
```

### 5. 打包插件

```bash
npm run package
```

这将生成 `agent-rl-rollout-viewer-0.1.0.vsix` 文件

### 6. 安装到VSCode

方法一：命令行安装
```bash
code --install-extension agent-rl-rollout-viewer-0.1.0.vsix
```

方法二：VSCode内安装
1. 打开VSCode
2. 按 `Ctrl+Shift+P`
3. 输入 "Install from VSIX"
4. 选择生成的 `.vsix` 文件

## 📝 使用方法

### 1. 设置Rollout文件夹

1. 按 `Ctrl+Shift+P`
2. 输入 "Agent RL: Set Rollout Folder"
3. 选择你的rollout根目录（包含step_1, step_2等文件夹）

### 2. 浏览Rollout数据

1. 点击左侧活动栏的 Agent RL Viewer 图标
2. 在TreeView中会显示所有step文件夹
3. 点击任意step，会在右侧打开可视化面板
4. 自动加载该step下的所有JSON文件

### 3. 查看轨迹

- 左栏：问句列表（自动聚类）
- 中栏：Rollout列表（按score排序）
- 右栏：详细轨迹（支持展开/折叠）

## 🔧 开发调试

### 在VSCode中调试插件

1. 用VSCode打开 `agent-rl-viewer` 文件夹
2. 按 `F5` 启动调试
3. 会打开一个新的VSCode窗口（Extension Development Host）
4. 在新窗口中测试插件功能

### 修改后重新编译

```bash
npm run watch  # 自动监听文件变化并编译
```

## 📂 配置示例

在VSCode设置中（settings.json）：

```json
{
  "agentRL.rolloutFolder": "/path/to/your/rollout"
}
```

## 🎯 核心功能

### TreeView功能
- ✅ 显示所有step文件夹
- ✅ 显示每个step的文件数量
- ✅ 点击打开step viewer
- ✅ 刷新按钮

### Webview功能
- ✅ 三栏布局（问句、rollout、详情）
- ✅ 自动聚类相同问句
- ✅ 按score降序排列
- ✅ Markdown渲染最后的assistant回复
- ✅ 展开/折叠消息
- ✅ 苹果风格UI

## 🐛 故障排除

### 问题1：npm install失败

```bash
# 使用国内镜像
npm config set registry https://registry.npmmirror.com
npm install
```

### 问题2：编译失败

确保TypeScript版本正确：
```bash
npm install -D typescript@latest
```

### 问题3：插件无法加载

检查VSCode版本是否 >= 1.84.0：
```bash
code --version
```

## 📚 进阶定制

### 添加图标

将图标文件放在 `media/icon.png`（推荐128x128px）

### 修改样式

编辑 `media/viewer.html` 中的 `<style>` 部分

### 添加新命令

1. 在 `package.json` 的 `contributes.commands` 中添加
2. 在 `src/extension.ts` 中注册命令处理

## 🔄 更新版本

1. 修改 `package.json` 中的 `version`
2. 重新编译：`npm run compile`
3. 重新打包：`npm run package`
4. 重新安装：`code --install-extension agent-rl-rollout-viewer-x.x.x.vsix`

## 💡 最佳实践

1. **使用workspace配置**：每个项目可以设置不同的rollout文件夹
2. **利用TreeView过滤**：只显示需要的step
3. **使用快捷键**：自定义键盘快捷键快速打开
4. **保持更新**：定期更新插件以获得新功能

## 📞 支持

如有问题，请查看：
- VSCode插件开发文档：https://code.visualstudio.com/api
- TypeScript文档：https://www.typescriptlang.org/docs
