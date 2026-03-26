# 🔄 使用工作流程详解

## ⚠️ 重要澄清

### viewer.html只需修改一次！
- ✅ 第一次构建时修改viewer.html（添加VSCode API）
- ✅ 之后**永远不需要**再改viewer.html
- ✅ rollout路径是通过VSCode配置动态设置的

### rollout文件夹路径是配置项，不是代码！
- ✅ 可以随时通过命令修改
- ✅ 不同项目可以有不同的配置
- ✅ **无需重新构建插件**

## 📋 完整流程

### 一次性设置（只做一次）

#### 步骤1：构建插件（只做一次）
```bash
cd /mnt/f/future/agent-rl-viewer

# 1. 修改viewer.html（参考VIEWER_MODIFICATIONS.md）
# 这一步只需要做一次！

# 2. 构建插件
./build.sh

# 3. 安装到VSCode
code --install-extension agent-rl-rollout-viewer-0.1.0.vsix
```

**这个过程只需要做一次！**

### 日常使用（每次训练后）

#### 场景1：第一次使用或更换rollout根目录

```bash
# 假设你的新rollout在这里：
# /home/user/experiments/exp_20260323/rollout/
#   ├── step_1/
#   ├── step_2/
#   └── step_3/
```

在VSCode中：
1. 按 `Ctrl+Shift+P`
2. 输入 "Agent RL: Set Rollout Folder"
3. 选择 `/home/user/experiments/exp_20260323/rollout/`
4. 完成！TreeView立即显示所有step

#### 场景2：切换到另一个实验

```bash
# 新的实验rollout在这里：
# /home/user/experiments/exp_20260324/rollout/
#   ├── step_1/
#   ├── step_2/
#   └── step_3/
```

在VSCode中：
1. 按 `Ctrl+Shift+P`
2. 输入 "Agent RL: Set Rollout Folder"
3. 选择 `/home/user/experiments/exp_20260324/rollout/`
4. 完成！TreeView自动更新

**无需修改任何代码，无需重新构建！**

#### 场景3：使用不同项目的配置

如果你有多个项目，每个项目可以有自己的rollout路径：

```bash
# 项目A
/workspace/projectA/.vscode/settings.json
{
  "agentRL.rolloutFolder": "/data/projectA/rollout"
}

# 项目B
/workspace/projectB/.vscode/settings.json
{
  "agentRL.rolloutFolder": "/data/projectB/rollout"
}
```

打开不同项目时，自动使用对应的rollout路径！

## 🔧 配置方式详解

### 方式1：通过命令（推荐，最简单）

```
Ctrl+Shift+P → "Agent RL: Set Rollout Folder" → 选择文件夹
```

优点：
- ✅ 可视化操作
- ✅ 自动刷新TreeView
- ✅ 会保存到全局配置

### 方式2：编辑用户设置（全局配置）

1. 打开VSCode设置：`Ctrl+,`
2. 搜索 "agentRL"
3. 设置 "Rollout Folder"

或直接编辑 `settings.json`：
```json
{
  "agentRL.rolloutFolder": "/path/to/your/rollout"
}
```

### 方式3：编辑workspace设置（项目配置）

在项目根目录创建 `.vscode/settings.json`：
```json
{
  "agentRL.rolloutFolder": "./rollout"
}
```

优点：
- ✅ 相对路径
- ✅ 项目级别配置
- ✅ 可以提交到git

### 方式4：通过环境变量（高级）

可以扩展插件支持环境变量，例如：
```json
{
  "agentRL.rolloutFolder": "${env:ROLLOUT_PATH}"
}
```

## 💡 推荐配置策略

### 个人开发者
使用**全局配置**（方式1或2）：
```json
{
  "agentRL.rolloutFolder": "/home/user/rollouts"
}
```

需要切换时，用命令重新设置。

### 团队协作
使用**workspace配置**（方式3）：
```json
// .vscode/settings.json
{
  "agentRL.rolloutFolder": "${workspaceFolder}/data/rollout"
}
```

这样：
- ✅ 每个人clone代码后自动有正确的路径
- ✅ 可以提交到版本控制
- ✅ 团队成员无需手动配置

### 多实验管理
创建快捷脚本：
```bash
#!/bin/bash
# switch_rollout.sh

# 使用VSCode CLI设置配置
code --user-data-dir ~/.vscode --force \
  --set-configuration "agentRL.rolloutFolder=$1"

echo "Rollout folder set to: $1"
```

使用：
```bash
./switch_rollout.sh /path/to/exp1/rollout
./switch_rollout.sh /path/to/exp2/rollout
```

## 🎯 典型使用场景

### 场景A：训练新模型

```bash
# 1. 开始训练，rollout输出到 /data/exp_v1/rollout/
python train.py --output /data/exp_v1/rollout

# 2. 在VSCode中查看
Ctrl+Shift+P → Set Rollout Folder → /data/exp_v1/rollout

# 3. 点击step_1查看第一个step的数据
# 4. 点击step_2查看第二个step的数据
# ...继续训练和查看
```

### 场景B：对比不同实验

```bash
# 实验1的数据在 /data/exp_v1/rollout/
# 实验2的数据在 /data/exp_v2/rollout/

# 方法1：打开两个VSCode窗口
# 窗口1: Ctrl+Shift+P → Set Rollout Folder → /data/exp_v1/rollout
# 窗口2: Ctrl+Shift+P → Set Rollout Folder → /data/exp_v2/rollout
# 并排查看对比

# 方法2：在一个窗口中切换
# 先看实验1
Ctrl+Shift+P → Set Rollout Folder → /data/exp_v1/rollout
# 记录关键指标

# 再看实验2
Ctrl+Shift+P → Set Rollout Folder → /data/exp_v2/rollout
# 对比指标
```

### 场景C：Linux服务器上使用

```bash
# SSH到服务器
ssh user@server

# 启动VSCode Server（使用code-server或Remote SSH）
# 然后在本地VSCode中：

# 1. 连接到远程服务器
Ctrl+Shift+P → "Remote-SSH: Connect to Host"

# 2. 设置rollout文件夹
Ctrl+Shift+P → "Agent RL: Set Rollout Folder"
# 选择：/home/user/experiments/rollout

# 3. 正常使用，就像本地一样！
```

## 🔄 数据流示意图

```
┌─────────────────────────────────────────────┐
│  VSCode 配置系统                             │
│  ┌─────────────────────────────────────┐   │
│  │ agentRL.rolloutFolder               │   │
│  │ = "/path/to/rollout"               │   │
│  └─────────────────────────────────────┘   │
└──────────────┬──────────────────────────────┘
               │ 读取配置
               ▼
┌─────────────────────────────────────────────┐
│  插件 Extension                              │
│  ┌─────────────────────────────────────┐   │
│  │ RolloutTreeProvider                 │   │
│  │ 1. 读取配置的路径                   │   │
│  │ 2. 扫描step_*文件夹                │   │
│  │ 3. 显示在TreeView                   │   │
│  └─────────────────────────────────────┘   │
└──────────────┬──────────────────────────────┘
               │ 用户点击step
               ▼
┌─────────────────────────────────────────────┐
│  Webview Panel                               │
│  ┌─────────────────────────────────────┐   │
│  │ viewer.html                          │   │
│  │ 1. 接收JSON数据                     │   │
│  │ 2. 聚类和排序                       │   │
│  │ 3. 可视化展示                       │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

## ⚡ 性能和限制

### 文件数量建议
- ✅ 单个step < 1000个JSON文件：流畅
- ⚠️ 单个step 1000-5000个文件：可能略慢
- ❌ 单个step > 5000个文件：建议分批或采样

### 优化建议
1. **定期清理**：删除不需要的旧step
2. **采样**：训练时可以采样保存（如每10个保存1个）
3. **分批**：大实验可以分多个rollout文件夹

## 🐛 常见问题

### Q: 修改了配置，TreeView没更新？
A: 点击TreeView上的刷新按钮，或重新加载VSCode窗口

### Q: 想要不同项目用不同的rollout路径？
A: 使用workspace配置（.vscode/settings.json）

### Q: 可以使用相对路径吗？
A: 可以！在workspace配置中使用相对路径，如 `"./data/rollout"`

### Q: 每次打开VSCode都要重新设置吗？
A: 不需要！配置会保存，下次打开自动生效

### Q: 可以通过命令行切换rollout路径吗？
A: 目前需要通过VSCode UI，但可以扩展插件添加CLI支持

## 📊 总结对比

| 项目 | 是否需要重新构建 | 是否需要修改代码 | 操作复杂度 |
|------|------------------|------------------|------------|
| 修改viewer.html | ✅ 是（仅第一次） | ✅ 是（仅第一次） | 中 |
| 切换rollout路径 | ❌ 否 | ❌ 否 | 低 |
| 添加新功能 | ✅ 是 | ✅ 是 | 高 |
| 使用插件 | ❌ 否 | ❌ 否 | 极低 |

## 🎉 关键要点

1. **viewer.html只需修改一次**，之后永远不用改
2. **rollout路径是配置项**，可以随时更改
3. **不需要重新构建插件**，配置即改即生效
4. **支持多项目配置**，每个项目独立
5. **支持Linux环境**，通过Remote SSH使用

---

希望这能让你更清楚地理解使用流程！如有疑问，随时询问。
