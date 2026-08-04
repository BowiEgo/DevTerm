#!/usr/bin/env bash
# ============================================
#  DevTerm — 引导脚本 (macOS / Linux)
#
#  npm 安装 (推荐):
#    npx @bowiego/dev-term [--default]
#
#  本地脚本:
#    ./setup.sh [--default] [--nvim] [--wezterm] [--herdr] [--pi]
#  远程管道:
#    curl -fsSL https://raw.githubusercontent.com/BowiEgo/DevTerm/main/setup.sh | bash
# ============================================

set -o pipefail

# ── 颜色 ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m'

success() { echo -e "  ${GREEN}✓${NC} $*"; }
warn()    { echo -e "  ${YELLOW}⚠${NC}  $*"; }
err()     { echo -e "  ${RED}✗${NC} $*"; }
info()    { echo -e "  ${GRAY}$*${NC}"; }

# ── 平台检测 ──
case "$(uname -s)" in
    Darwin)  OS="macos" ;;
    Linux)   OS="linux" ;;
    *_NT*)   OS="windows" ;;
    *)       err "不支持的操作系统: $(uname -s)"; exit 1 ;;
esac

# ── 执行模式：本地脚本 vs 远程管道 ──
if [[ -f "$0" && "$0" == *.sh ]]; then
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    IS_PIPED=false
else
    SCRIPT_DIR=""  # 稍后克隆
    IS_PIPED=true
    REPO_URL="${DEVTERM_REPO:-https://github.com/BowiEgo/DevTerm.git}"
    REPO_BRANCH="${DEVTERM_BRANCH:-main}"
fi

# ── 代理检测 ──
echo ""
echo -e "  ${CYAN}DevTerm · 引导${NC}  (${OS})"
echo ""
info "当前 http_proxy  = ${http_proxy:-未设置}"
info "当前 https_proxy = ${https_proxy:-未设置}"
echo ""
default="${https_proxy:-${http_proxy:-http://127.0.0.1:7897}}"
info "代理地址（回车=默认/当前，直接输入覆盖，输入 direct=直连）"
printf "  > "
if [ -t 0 ]; then
    read -e -i "$default" -r proxy_ok
else
    read -r proxy_ok
    proxy_ok="${proxy_ok:-$default}"
fi

case "$proxy_ok" in
    ""|direct|none|off)
        warn "已选择直连（不使用代理）"
        ;;
    *)
        export http_proxy="$proxy_ok"
        export https_proxy="$proxy_ok"
        export HTTP_PROXY="$proxy_ok"
        export HTTPS_PROXY="$proxy_ok"
        export all_proxy="$proxy_ok"
        success "已使用代理: $proxy_ok"
        info "验证代理连通性..."
        if curl -s --proxy "$proxy_ok" --max-time 8 -o /dev/null -w "%{http_code}" https://raw.githubusercontent.com 2>/dev/null | grep -q "200\|301\|302"; then
            success "代理可用"
        else
            warn "代理验证失败，继续尝试直连（可能较慢）"
        fi
        ;;
esac
echo ""

# ── 确保 Node.js (>= 18) ──
get_node_major() {
    local v
    v="$(node -v 2>/dev/null)" || return 0
    v="${v#v}"
    echo "${v%%.*}"
}

node_major="$(get_node_major)"
if [ "${node_major:-0}" -ge 18 ]; then
    success "Node.js $(node -v) 已就绪"
else
    info "未检测到 Node.js (>= 18)，正在安装..."

    install_node() {
        case "$OS" in
            windows)
                err "Windows 请使用 setup.ps1 (PowerShell) 引导脚本"
                return 1
                ;;
            macos)
                if command -v brew &>/dev/null; then
                    info "通过 Homebrew 安装 Node.js..."
                    brew install node
                else
                    err "未找到 Homebrew，请先安装: https://brew.sh"
                    return 1
                fi
                ;;
            linux)
                if command -v apt &>/dev/null; then
                    info "通过 apt 安装 Node.js..."
                    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
                    sudo apt install -y nodejs
                elif command -v dnf &>/dev/null; then
                    info "通过 dnf 安装 Node.js..."
                    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo -E bash -
                    sudo dnf install -y nodejs
                elif command -v pacman &>/dev/null; then
                    info "通过 pacman 安装 Node.js..."
                    sudo pacman -S --noconfirm nodejs npm
                elif command -v zypper &>/dev/null; then
                    info "通过 zypper 安装 Node.js..."
                    sudo zypper install -y nodejs npm
                elif command -v apk &>/dev/null; then
                    info "通过 apk 安装 Node.js..."
                    sudo apk add nodejs npm
                else
                    err "未检测到支持的包管理器，请手动安装 Node.js: https://nodejs.org"
                    return 1
                fi
                ;;
        esac
    }

    if ! install_node; then
        err "Node.js 安装失败"
        exit 1
    fi

    node_major="$(get_node_major)"
    if [ "${node_major:-0}" -lt 18 ]; then
        err "Node.js 安装失败（版本 < 18），请手动安装: https://nodejs.org"
        exit 1
    fi
    success "Node.js $(node -v) 已就绪"
fi

# ── 克隆项目（仅远程管道模式）──
if $IS_PIPED; then
    SCRIPT_DIR="$(mktemp -d /tmp/devterm.XXXXXX)"
    info "克隆 DevTerm 到 ${SCRIPT_DIR} ..."
    if command -v git &>/dev/null; then
        git clone --depth 1 --branch "$REPO_BRANCH" "$REPO_URL" "$SCRIPT_DIR" 2>&1 | while IFS= read -r line; do info "  git: $line"; done
        if [[ ${PIPESTATUS[0]} -ne 0 ]]; then
            err "克隆失败，请检查网络或手动下载: $REPO_URL"
            exit 1
        fi
    else
        TARBALL="${REPO_URL%.git}/archive/refs/heads/${REPO_BRANCH}.tar.gz"
        info "下载: ${TARBALL}"
        curl -fsSL "$TARBALL" | tar xz -C "$SCRIPT_DIR" --strip-components=1
        if [[ ${PIPESTATUS[0]} -ne 0 ]]; then
            err "下载失败，请检查网络"
            rm -rf "$SCRIPT_DIR"
            exit 1
        fi
    fi
    success "项目就绪: ${SCRIPT_DIR}"
fi

# ── 安装依赖 ──
if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
    info "安装依赖..."
    (cd "$SCRIPT_DIR" && npm install --silent) || {
        err "依赖安装失败"
        exit 1
    }
    success "依赖安装完成"
fi

# ── 运行 ──
info "启动 DevTerm..."
cd "$SCRIPT_DIR"
if [ -f "$SCRIPT_DIR/outfile.cjs" ]; then
    node outfile.cjs "$@"
else
    info "未找到编译产物，使用 tsx 运行源码..."
    npx tsx ./index.ts "$@"
fi
echo ""
info "DevTerm 已完成 — 终端保持打开"
