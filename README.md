# 🤖 Agent RL Rollout Viewer

一个强大的VSCode插件，用于可视化查看和分析Agent强化学习训练过程中的rollout轨迹数据。

## ✨ 特性

- 📁 **智能文件管理**：自动扫描和组织多个step文件夹
- 🎯 **智能聚类**：根据问句自动聚类相同的rollout样本
- 📊 **分数排序**：按reward score降序展示，快速找到最佳轨迹
- 🎨 **优雅UI**：苹果风格设计，支持深色和浅色主题
- 💡 **Markdown渲染**：自动识别并格式化assistant的回复内容
- 🔍 **详细分析**：支持查看完整的对话轨迹、reward详情和元数据
- 📤 **扣分导出**：单条可导出 `<deductions>` 原文或中文 Markdown 扣分报告；当前 Step 下可一键合并导出全部 **deductions**（便于批量总结分析，API 亦支持 `mode=report`）

## 📸 截图

### TreeView Explorer
左侧显示所有step文件夹，点击即可查看

### 三栏可视化界面
- **左栏**：问句列表（自动聚类）
- **中栏**：Rollout样本（按分数排序）
- **右栏**：详细轨迹（可展开/折叠）

## 🚀 快速开始

### 安装

1. 下载 `.vsix` 文件
2. 在VSCode中：`Ctrl+Shift+P` → "Install from VSIX"
3. 选择下载的文件

### 使用

1. **设置Rollout文件夹**
   ```
   Ctrl+Shift+P → "Agent RL: Set Rollout Folder"
   ```

2. **打开Explorer**
   - 点击左侧活动栏的Agent RL图标
   - 查看所有step文件夹

3. **查看数据**
   - 点击任意step文件夹
   - 自动加载并展示该step的所有rollout数据

## 📋 系统要求

- VSCode >= 1.84.0
- Node.js >= 16.0.0（开发时需要）
- Linux / macOS / Windows

## 🛠️ 从源码构建

```bash
# 克隆仓库
git clone https://github.com/cwxndl/Agent-RL-Rollout-Viewer.git
cd agent-rl-viewer

# 安装依赖
npm install

# 编译
npm run compile

# 打包
npm run package

# 安装到VSCode
code --install-extension agent-rl-rollout-viewer-0.1.14.vsix
```

## ⚙️ 配置

在VSCode设置中：

```json
{
  "agentRL.rolloutFolder": "/path/to/your/rollout"
}
```

或通过命令面板：`Agent RL: Set Rollout Folder`

## 📂 数据格式

插件支持以下JSON格式：

```json
{
  "timestamp": "2026-03-18T07:46:23",
  "request_id": "unique-id",
  "messages": [
    {
      "role": "system|user|assistant|tool",
      "content": "..."
    }
  ],
  "reward": {
    "score": 0.95,
    "reward_info": {
      "final_reward": 0.95,
      "llm_reward": 1.0,
      "rule_reward_info": {}
    }
  }
}
```

## 🎯 使用场景

- 🔬 **训练监控**：实时查看RL训练的rollout质量
- 📈 **效果分析**：对比不同step的训练效果
- 🐛 **问题诊断**：快速定位低分样本，分析失败原因
- ✅ **质量检查**：查看高分样本，验证模型能力

## 🤝 贡献

欢迎提交Issue和Pull Request！

## 📄 许可证

MIT License

## 🙏 致谢

- 参考了 [TrajV JSONL Viewer](https://github.com/LinXueyuanStdio/trajv)
- 使用 VSCode Extension API

## 📞 联系

如有问题或建议，请提交Issue
