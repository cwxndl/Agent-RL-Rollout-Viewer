#!/bin/bash

echo "🚀 Building Agent RL Rollout Viewer..."

# 检查Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js first."
    exit 1
fi

# 检查npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm not found. Please install npm first."
    exit 1
fi

# 安装依赖
echo "📦 Installing dependencies..."
npm install

# 编译TypeScript
echo "🔨 Compiling TypeScript..."
npm run compile

if [ $? -ne 0 ]; then
    echo "❌ Compilation failed!"
    exit 1
fi

# 打包插件
echo "📦 Packaging extension..."
npm run package

if [ $? -ne 0 ]; then
    echo "❌ Packaging failed!"
    exit 1
fi

echo "✅ Build completed successfully!"
echo "📦 VSIX file created in current directory"
echo ""
echo "To install:"
echo "  code --install-extension agent-rl-rollout-viewer-0.1.0.vsix"
