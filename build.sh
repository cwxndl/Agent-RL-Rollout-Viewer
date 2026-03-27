#!/usr/bin/env bash
# =============================================================================
# Agent RL Rollout Viewer — 一键安装依赖、编译并生成 VSIX
#
# 用法
#   chmod +x build.sh && ./build.sh
#
# 构建流程（与手动执行等价）
#   1. npm install
#        安装 package.json 中的依赖（typescript、@types/*、@vscode/vsce 等为 devDependencies）
#   2. npm run compile
#        执行 tsc，将 src/ 编译到 out/
#   3. npm run package
#        调用 vsce package；vsce 会先执行 npm run vscode:prepublish（内部再次 compile），
#        再按 .vscodeignore 规则将 out/、media/、README.md、LICENSE 等打入 .vsix
#
# 环境要求（重要）
#   • Node.js 必须为 18 或更高版本，推荐使用 Node 20+
#     当前 @vscode/vsce 依赖链中的 undici 在 Node 16 上会报错：
#       ReferenceError: ReadableStream is not defined
#   • 已安装 npm（一般随 Node 自带）
#
# 可选：指定用于打包的 Node 目录
#   若系统默认 node 仍是 16，可将 Node 20+ 的 bin 目录设为：
#     export NODE_FOR_VSCE=/usr/local/nvm/versions/node/v20.20.2/bin
#     ./build.sh
#   脚本也会自动尝试常见路径：/usr/local/nvm/versions/node/v20.20.2/bin
#
# package.json / 打包约定
#   • 不要同时在 package.json 里写 "files" 字段又在仓库根目录放 .vscodeignore：
#     vsce 会报错「Both a .vscodeignore file and a files property...」二者只保留一种；
#     本仓库使用 .vscodeignore 控制打入 VSIX 的文件。
#   • 扩展运行时无 npm production dependencies，VSIX 主要包含编译后的 out/ 与 media/viewer.html
#
# 输出
#   在本脚本所在目录生成：
#     agent-rl-rollout-viewer-<版本号>.vsix
#   版本号与 package.json 中 "version" 一致。
#
# 安装扩展（示例）
#   code --install-extension "./agent-rl-rollout-viewer-$(node -p "require('./package.json').version").vsix"
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🚀 Building Agent RL Rollout Viewer..."

prepend_node_bin() {
    local d="${1:-}"
    if [[ -n "$d" && -x "${d}/node" ]]; then
        export PATH="${d}:$PATH"
        return 0
    fi
    return 1
}

node_major() {
    node -v 2>/dev/null | sed 's/^v\([0-9]*\).*/\1/' || echo 0
}

# 确保使用 Node 18+（vsce / undici 要求）
MAJOR="$(node_major)"
if [[ "$MAJOR" -lt 18 ]]; then
    if prepend_node_bin "${NODE_FOR_VSCE:-}"; then
        echo "✓ 使用 NODE_FOR_VSCE：$(command -v node) ($(node -v))"
    elif prepend_node_bin "/usr/local/nvm/versions/node/v20.20.2/bin"; then
        echo "✓ 已使用本机 NVM Node 20：$(node -v)"
    elif [[ -n "${NVM_DIR:-}" && -s "${NVM_DIR}/nvm.sh" ]]; then
        # shellcheck source=/dev/null
        source "${NVM_DIR}/nvm.sh"
        nvm use 20 &>/dev/null || nvm use 22 &>/dev/null || true
    elif [[ -s "/usr/local/nvm/nvm.sh" ]]; then
        # shellcheck source=/dev/null
        source "/usr/local/nvm/nvm.sh"
        nvm use 20 &>/dev/null || nvm use 22 &>/dev/null || true
    fi
fi

MAJOR="$(node_major)"
if [[ "$MAJOR" -lt 18 ]]; then
    echo "❌ 需要 Node.js 18+ 才能运行 vsce 打包（检测到: $(node -v 2>/dev/null || echo '无 node')）"
    echo "   请安装 Node 20，或执行：export NODE_FOR_VSCE=/你的/node20/bin  后再运行本脚本。"
    exit 1
fi

if ! command -v npm &>/dev/null; then
    echo "❌ 未找到 npm，请安装 Node.js（含 npm）。"
    exit 1
fi

echo "📌 使用 Node $(node -v)，npm $(npm -v)"

echo "📦 Installing dependencies..."
npm install

echo "🔨 Compiling TypeScript..."
npm run compile

echo "📦 Packaging extension (vsce)..."
npm run package

VERSION="$(node -p "require('./package.json').version")"
VSIX_NAME="agent-rl-rollout-viewer-${VERSION}.vsix"

if [[ ! -f "$VSIX_NAME" ]]; then
    echo "❌ 未找到生成的 $VSIX_NAME"
    exit 1
fi

echo ""
echo "✅ 构建完成"
echo "📦 VSIX: ${SCRIPT_DIR}/${VSIX_NAME}"
echo ""
echo "安装示例："
echo "  code --install-extension \"${SCRIPT_DIR}/${VSIX_NAME}\""
