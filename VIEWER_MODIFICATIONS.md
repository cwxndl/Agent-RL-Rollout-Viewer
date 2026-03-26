# Viewer.html 修改指南

需要对 `media/viewer.html` 进行以下修改，使其能够与VSCode webview通信：

## 1. 移除文件选择器

删除以下HTML代码：
```html
<div class="file-input-wrapper">
    <label for="folderInput" class="btn btn-primary">
        📁 选择文件夹
    </label>
    <input type="file" id="folderInput" webkitdirectory directory multiple>
</div>
```

## 2. 在`<script>`标签开始处添加VSCode API

在`<script>`标签的第一行添加：

```javascript
// ==================== VSCode Integration ====================
const vscode = acquireVsCodeApi();

// 通知VSCode准备就绪
window.addEventListener('DOMContentLoaded', () => {
    vscode.postMessage({ command: 'ready' });
});

// 监听来自VSCode的数据
window.addEventListener('message', event => {
    const message = event.data;
    if (message.command === 'loadData') {
        // 接收rollout数据
        const rollouts = message.data;

        // 显示加载状态
        showLoading();

        // 处理数据
        setTimeout(() => {
            clusterData(rollouts);
            renderLayout();
        }, 100);
    }
});
// ==================== End VSCode Integration ====================

```

## 3. 移除文件选择器事件监听

删除以下代码：
```javascript
document.getElementById('folderInput').addEventListener('change', handleFiles);
```

## 4. 移除handleFiles函数（可选）

`handleFiles` 函数可以保留，但不会被调用。数据现在通过VSCode的`postMessage`接收。

## 完整的修改位置

### 修改前：
```html
<script>
    let clusteredData = [];
    let currentClusterIndex = 0;
    let currentRolloutIndex = -1;

    // 文件选择处理
    document.getElementById('folderInput').addEventListener('change', handleFiles);

    async function handleFiles(e) {
        // ...
    }
    // ...
</script>
```

### 修改后：
```html
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
            showLoading();
            setTimeout(() => {
                clusterData(rollouts);
                renderLayout();
            }, 100);
        }
    });
    // ==================== End VSCode Integration ====================

    let clusteredData = [];
    let currentClusterIndex = 0;
    let currentRolloutIndex = -1;

    // 不再需要文件选择器监听
    // async function handleFiles(e) { ... } 可以删除
    // ...
</script>
```

## 5. 测试修改

修改后，可以在浏览器中测试是否有语法错误：

```javascript
// 临时添加测试代码
if (typeof acquireVsCodeApi === 'undefined') {
    // 浏览器环境：使用模拟数据
    console.log('Running in browser mode');
    window.vscode = {
        postMessage: (msg) => console.log('Mock postMessage:', msg)
    };
} else {
    // VSCode webview环境
    window.vscode = acquireVsCodeApi();
}
```

## 自动化修改脚本

也可以使用以下脚本自动修改：

```bash
#!/bin/bash
HTML_FILE="media/viewer.html"

# 备份原文件
cp $HTML_FILE ${HTML_FILE}.backup

# 移除文件选择器
sed -i '/<div class="file-input-wrapper">/,/<\/div>/d' $HTML_FILE

# 移除事件监听
sed -i '/getElementById.*folderInput.*addEventListener/d' $HTML_FILE

echo "✅ Modifications completed!"
echo "Please manually add VSCode API code at the beginning of <script> tag"
```
