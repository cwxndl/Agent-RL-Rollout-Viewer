# 🚀 从零开始 - 完整设置指南

## 📋 需要准备的东西

### 1. 软件环境
- ✅ VSCode（已安装）
- ✅ Node.js >= 16.0.0
- ✅ npm（Node.js自带）

### 2. 你的数据
- ✅ rollout JSON文件（你已经有了，在`/mnt/f/future/step_1`等文件夹中）

### 3. 需要的时间
- ⏰ 首次设置：约15-20分钟
- ⏰ 以后每次使用：30秒

## 🎯 第一步：检查环境

### 检查Node.js是否安装

```bash
node --version
```

**如果看到版本号（如 v18.17.0）**：✅ 已安装，跳到下一步

**如果显示"command not found"**：需要安装Node.js

#### 在Linux/WSL上安装Node.js

```bash
# 方法1：使用nvm（推荐）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18

# 方法2：使用apt（Ubuntu/Debian）
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证安装
node --version
npm --version
```

## 📝 第二步：准备项目文件

你现在已经有了项目框架，在 `/mnt/f/future/agent-rl-viewer/`

让我们看看有什么：

```bash
cd /mnt/f/future/agent-rl-viewer
ls -la
```

应该看到：
```
agent-rl-viewer/
├── package.json          ✅ 有
├── tsconfig.json         ✅ 有
├── build.sh             ✅ 有
├── src/
│   └── extension.ts     ✅ 有
├── media/
│   └── viewer.html      ✅ 有（但需要修改）
└── 各种.md文档          ✅ 有
```

## 🔧 第三步：修改viewer.html（关键！）

这是**唯一需要手动修改的地方**。

### 方法1：自动修改（推荐）

```bash
cd /mnt/f/future/agent-rl-viewer

# 创建自动修改脚本
cat > auto_fix_viewer.sh << 'SCRIPT_EOF'
#!/bin/bash

HTML_FILE="media/viewer.html"

echo "🔧 Fixing viewer.html for VSCode..."

# 备份原文件
cp "$HTML_FILE" "${HTML_FILE}.backup"
echo "✅ Backup created: ${HTML_FILE}.backup"

# 1. 移除文件选择器HTML（整个controls div的内容）
sed -i '/<div class="controls">/,/<\/div>/c\            <div class="controls">\n            <\/div>' "$HTML_FILE"

# 2. 在<script>标签后插入VSCode API代码
sed -i '/<script>/a\
        \/\/ ==================== VSCode Integration ====================\
        const vscode = acquireVsCodeApi();\
\
        window.addEventListener('\''DOMContentLoaded'\'', () => {\
            vscode.postMessage({ command: '\''ready'\'' });\
        });\
\
        window.addEventListener('\''message'\'', event => {\
            const message = event.data;\
            if (message.command === '\''loadData'\'') {\
                const rollouts = message.data;\
                clusterData(rollouts);\
                renderLayout();\
            }\
        });\
        \/\/ ==================== End VSCode Integration ====================\
' "$HTML_FILE"

echo "✅ viewer.html fixed successfully!"
echo "📁 Backup saved as: ${HTML_FILE}.backup"
SCRIPT_EOF

# 执行脚本
chmod +x auto_fix_viewer.sh
./auto_fix_viewer.sh
```

### 方法2：手动修改

如果自动脚本不工作，手动修改：

```bash
# 用你喜欢的编辑器打开
code media/viewer.html
# 或
vim media/viewer.html
```

#### 修改点1：删除文件选择器

找到这部分（大约在第409-416行）：
```html
<div class="controls">
    <div class="file-input-wrapper">
        <label for="folderInput" class="btn btn-primary">
            📁 选择文件夹
        </label>
        <input type="file" id="folderInput" webkitdirectory directory multiple>
    </div>
</div>
```

改为：
```html
<div class="controls">
</div>
```

#### 修改点2：添加VSCode API

找到 `<script>` 标签（大约在第683行），在它**后面**立即添加：

```javascript
<script>
    // ==================== VSCode Integration ====================
    const vscode = acquireVsCodeApi();

    window.addEventListener('DOMContentLoaded', () => {
        vscode.postMessage({ command: 'ready' });
    });

    window.addEventListener('message', event => {
        const message = event.data;
        if (message.command === 'loadData') {
            const rollouts = message.data;
            clusterData(rollouts);
            renderLayout();
        }
    });
    // ==================== End VSCode Integration ====================

    // 原来的代码继续...
    let clusteredData = [];
    ...
```

保存文件。

### 验证修改是否正确

```bash
# 检查是否包含VSCode API代码
grep -n "acquireVsCodeApi" media/viewer.html

# 应该看到类似：
# 685:    const vscode = acquireVsCodeApi();
```

如果看到行号，说明修改成功！✅

## 🏗️ 第四步：构建插件

```bash
cd /mnt/f/future/agent-rl-viewer

# 使用一键构建脚本
./build.sh
```

你会看到类似输出：
```
🚀 Building Agent RL Rollout Viewer...
📦 Installing dependencies...
[等待npm下载依赖，首次可能需要2-3分钟]
🔨 Compiling TypeScript...
📦 Packaging extension...
✅ Build completed successfully!
📦 VSIX file created: agent-rl-rollout-viewer-0.1.0.vsix
```

### 如果构建失败

#### 错误1：npm install失败

```bash
# 使用国内镜像
npm config set registry https://registry.npmmirror.com
npm install
```

#### 错误2：权限问题

```bash
# 确保有执行权限
chmod +x build.sh
./build.sh
```

#### 错误3：找不到vsce

```bash
# 手动安装vsce
npm install -g @vscode/vsce
npm run package
```

## 📦 第五步：安装插件到VSCode

### 方法1：命令行安装（推荐）

```bash
cd /mnt/f/future/agent-rl-viewer

# 安装刚才生成的.vsix文件
code --install-extension agent-rl-rollout-viewer-0.1.0.vsix
```

如果成功，会看到：
```
Installing extensions...
Extension 'agent-rl-rollout-viewer' was successfully installed.
```

### 方法2：通过VSCode界面安装

1. 打开VSCode
2. 按 `Ctrl+Shift+P`
3. 输入 "Install from VSIX"
4. 选择文件：`/mnt/f/future/agent-rl-viewer/agent-rl-rollout-viewer-0.1.0.vsix`
5. 等待安装完成
6. 重新加载VSCode窗口

### 验证安装

```bash
# 列出所有已安装的插件
code --list-extensions | grep agent-rl

# 应该看到：
# your-name.agent-rl-rollout-viewer
```

或者在VSCode中：
1. 按 `Ctrl+Shift+X` 打开扩展面板
2. 搜索 "Agent RL"
3. 应该能看到你的插件

## 🎯 第六步：配置rollout文件夹

### 现在开始使用！

1. **打开VSCode**（如果还没打开）

2. **设置rollout文件夹路径**

   按 `Ctrl+Shift+P`，输入：
   ```
   Agent RL: Set Rollout Folder
   ```

   选择你的rollout根目录：
   ```
   /mnt/f/future
   ```

   或者在Windows路径下：
   ```
   F:\future
   ```

3. **查看TreeView**

   点击左侧活动栏的图标（应该有一个Agent RL的图标）

   如果没看到图标，按 `Ctrl+Shift+E` 打开Explorer，然后找到 "ROLLOUT EXPLORER" 部分

4. **你应该看到**

   ```
   ROLLOUT EXPLORER
   ├── 📁 step_1 (XX files)
   ├── 📁 step_2 (XX files)
   └── 📁 step_3 (XX files)
   ```

5. **点击任意step**

   比如点击 `step_1`，右侧会打开一个新的面板，展示该step的所有rollout数据

6. **查看数据**

   - 左栏：问句列表
   - 中栏：Rollout样本（按score排序）
   - 右栏：详细轨迹

## 🎉 完成！

恭喜！你已经成功设置并可以使用了。

## 📝 快速命令备忘

```bash
# 切换到不同的rollout文件夹（在VSCode中）
Ctrl+Shift+P → "Agent RL: Set Rollout Folder"

# 刷新step列表
点击TreeView上的刷新按钮

# 打开step
点击TreeView中的step文件夹
```

## 🔍 故障排除

### 问题1：TreeView不显示任何内容

**检查清单：**
```bash
# 1. 确认插件已安装
code --list-extensions | grep agent-rl

# 2. 确认配置已设置
# 在VSCode中按 Ctrl+, 搜索 "agentRL.rolloutFolder"

# 3. 确认路径正确
ls /mnt/f/future/step_1  # 应该能看到JSON文件

# 4. 点击TreeView上的刷新按钮
```

### 问题2：点击step后webview空白

**调试步骤：**
1. 在webview上右键
2. 选择 "Open Webview Developer Tools"
3. 查看Console是否有错误
4. 如果看到 "acquireVsCodeApi is not defined"，说明viewer.html修改不正确

### 问题3：修改后重新构建

```bash
cd /mnt/f/future/agent-rl-viewer

# 1. 修改代码（如果需要）
# 2. 重新编译
npm run compile

# 3. 重新打包
npm run package

# 4. 卸载旧版本
code --uninstall-extension your-name.agent-rl-rollout-viewer

# 5. 安装新版本
code --install-extension agent-rl-rollout-viewer-0.1.0.vsix

# 6. 重新加载VSCode
```

## 📊 检查点

完成后，你应该能做到：
- ✅ 在VSCode左侧看到Agent RL Explorer
- ✅ 看到所有step_*文件夹列表
- ✅ 点击step后能看到可视化面板
- ✅ 能浏览和分析rollout数据
- ✅ 可以随时切换不同的rollout文件夹

## 🎯 下一步

现在你已经设置完成，可以：
1. 开始分析你的rollout数据
2. 对比不同step的训练效果
3. 查找低分样本进行调试
4. 验证高分样本的正确性

## 💡 额外提示

### 在Linux服务器上使用

如果你的rollout数据在远程Linux服务器上：

1. 安装 "Remote - SSH" 插件
2. 连接到服务器
3. 在远程服务器上安装Agent RL插件
4. 设置服务器上的rollout路径
5. 正常使用！

### 创建快捷方式

在 `.bashrc` 或 `.zshrc` 中添加：
```bash
alias open-rollout='code /mnt/f/future'
```

以后直接运行 `open-rollout` 就能打开VSCode并配置好路径。

---

**有问题？** 检查这些文档：
- [QUICK_START.md](QUICK_START.md) - 快速入门
- [USAGE_WORKFLOW.md](USAGE_WORKFLOW.md) - 使用流程
- [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) - 项目架构

祝使用愉快！🎉
