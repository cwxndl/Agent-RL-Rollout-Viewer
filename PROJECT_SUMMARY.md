# 🎯 Agent RL Rollout Viewer VSCode插件 - 项目总结

## 📊 项目概述

这是一个专为Agent强化学习训练设计的VSCode插件，用于可视化和分析rollout轨迹数据。

### 核心优势
- ✅ 无需手动选择文件，自动扫描多个step文件夹
- ✅ 集成在VSCode中，适合Linux开发环境
- ✅ 左侧TreeView管理，右侧Webview展示
- ✅ 复用你现有的精美可视化界面
- ✅ 支持批量分析和对比

## 🏗️ 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                         VSCode                              │
├─────────────────────┬───────────────────────────────────────┤
│   Activity Bar      │          Main Editor Area             │
│                     │                                       │
│   Agent RL Icon  ─►├─► TreeView Explorer                   │
│                     │   ├── step_1 (10 files)              │
│                     │   ├── step_2 (15 files)              │
│                     │   └── step_3 (12 files)              │
│                     │                                       │
│                     │   Click step ▼                        │
│                     │                                       │
│                     ├─► Webview Panel                       │
│                     │   ┌─────────────────────────────────┐│
│                     │   │  Your Visualizer (viewer.html)  ││
│                     │   │  ┌─────┬────────┬──────────┐   ││
│                     │   │  │问句 │Rollout │详情轨迹  │   ││
│                     │   │  │列表 │ 列表   │          │   ││
│                     │   │  │     │(score) │(markdown)│   ││
│                     │   │  └─────┴────────┴──────────┘   ││
│                     │   └─────────────────────────────────┘│
└─────────────────────┴───────────────────────────────────────┘
```

## 📁 项目结构

```
agent-rl-viewer/
├── package.json              # 插件配置（已完成）
├── tsconfig.json            # TypeScript配置（已完成）
├── build.sh                 # 一键构建脚本（已完成）
├── src/
│   └── extension.ts         # TypeScript源码（已完成）
│       ├── activate()       # 插件激活
│       ├── RolloutTreeProvider # TreeView数据提供者
│       ├── StepItem         # Step节点类
│       └── Commands         # 命令注册
├── media/
│   ├── viewer.html          # 可视化界面（需要修改）
│   └── icon.png            # 插件图标（待添加）
├── out/
│   └── extension.js        # 编译后的JS（构建时生成）
├── README.md               # 项目说明（已完成）
├── SETUP_GUIDE.md          # 安装指南（已完成）
├── QUICK_START.md          # 快速入门（已完成）
├── VIEWER_MODIFICATIONS.md # Viewer修改指南（已完成）
└── PROJECT_SUMMARY.md      # 本文件
```

## 🔑 核心组件

### 1. TreeView Provider (extension.ts)
- 读取配置的rollout文件夹
- 扫描所有`step_*`文件夹
- 统计每个step的JSON文件数
- 提供点击打开功能

### 2. Webview Panel (extension.ts)
- 加载`viewer.html`
- 传递JSON数据给webview
- 处理webview消息

### 3. Viewer HTML (viewer.html)
- 三栏布局可视化
- 问句聚类
- Score排序
- Markdown渲染
- 展开/折叠功能

## 🔄 数据流

```
1. 用户设置rollout文件夹
   ↓
2. TreeView扫描并显示step_*文件夹
   ↓
3. 用户点击某个step
   ↓
4. Extension读取该step下的所有JSON
   ↓
5. 通过postMessage发送给webview
   ↓
6. Webview接收并渲染数据
   ↓
7. 用户浏览和分析数据
```

## ✅ 已完成的工作

1. ✅ 创建完整的项目结构
2. ✅ 编写TypeScript源码
3. ✅ 配置package.json
4. ✅ 编写构建脚本
5. ✅ 创建详细文档
6. ✅ 设计TreeView和命令
7. ✅ 实现Webview通信

## ⚠️ 需要完成的工作

### 必须完成
1. ❗ **修改viewer.html**
   - 移除文件选择器
   - 添加VSCode API代码
   - 详见 `VIEWER_MODIFICATIONS.md`

2. ❗ **安装依赖并构建**
   ```bash
   cd /mnt/f/future/agent-rl-viewer
   npm install
   ./build.sh
   ```

3. ❗ **安装插件**
   ```bash
   code --install-extension agent-rl-rollout-viewer-0.1.0.vsix
   ```

### 可选完成
4. 🎨 添加图标 (`media/icon.png`)
5. 🎨 自定义样式和主题
6. 📝 添加更多命令（导出、搜索等）
7. 🧪 编写测试

## 📝 关键修改点

### viewer.html需要的修改

#### 删除这部分HTML:
```html
<div class="file-input-wrapper">
    <label for="folderInput" class="btn btn-primary">
        📁 选择文件夹
    </label>
    <input type="file" id="folderInput" webkitdirectory directory multiple>
</div>
```

#### 在`<script>`开始添加:
```javascript
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
```

#### 删除这行:
```javascript
document.getElementById('folderInput').addEventListener('change', handleFiles);
```

## 🚀 使用流程

1. **首次设置**
   ```
   Ctrl+Shift+P → "Agent RL: Set Rollout Folder"
   选择: /mnt/f/future
   ```

2. **日常使用**
   ```
   点击左侧Agent RL图标
   → 显示所有step文件夹
   → 点击step_1
   → 自动展示该step的所有rollout
   → 分析数据
   ```

3. **切换step**
   ```
   直接点击其他step文件夹
   → 新面板打开或切换
   → 对比分析不同step的效果
   ```

## 🎯 适用场景

### 训练监控
- 实时查看每个step的训练质量
- 快速定位问题样本
- 对比不同step的效果

### 数据分析
- 聚类分析相同问题的多次采样
- 按score排序找到最佳/最差样本
- 查看详细的对话轨迹

### 调试优化
- 分析低分样本的失败原因
- 验证高分样本的正确性
- 优化prompt和reward函数

## 💡 最佳实践

1. **组织数据**
   - 保持清晰的文件夹命名：step_1, step_2, ...
   - 统一JSON格式
   - 定期清理旧数据

2. **使用技巧**
   - 设置workspace配置而非全局配置
   - 利用多窗口对比不同step
   - 使用webview的开发者工具调试

3. **性能优化**
   - 单个step不要超过1000个文件
   - 大文件考虑分批加载
   - 定期关闭不用的webview面板

## 🐛 常见问题

### Q: 插件不显示怎么办？
A: 检查：
1. VSCode版本 >= 1.84.0
2. 插件是否正确安装：`code --list-extensions`
3. 查看输出面板的日志

### Q: Webview空白？
A: 检查：
1. `viewer.html`是否正确修改
2. 浏览器控制台是否有错误
3. JSON数据是否正确加载

### Q: 性能问题？
A: 优化：
1. 减少单个step的文件数
2. 优化HTML渲染
3. 使用虚拟滚动

## 📚 参考资料

- [VSCode Extension API](https://code.visualstudio.com/api)
- [TreeView API](https://code.visualstudio.com/api/extension-guides/tree-view)
- [Webview API](https://code.visualstudio.com/api/extension-guides/webview)
- [参考项目：TrajV](https://github.com/LinXueyuanStdio/trajv)

## 🎉 总结

这个插件将你现有的可视化工具完美集成到VSCode中，解决了：
1. ✅ 不需要手动选择文件夹
2. ✅ 支持Linux开发环境
3. ✅ 管理多个step文件夹
4. ✅ 集成在IDE中，提高效率

下一步只需要：
1. 修改`viewer.html`（按照指南操作）
2. 运行`build.sh`构建
3. 安装并使用

祝你使用愉快！🚀
