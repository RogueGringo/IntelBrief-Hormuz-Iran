#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════╗
# ║  VALOR ENERGY PARTNERS — Zero-Setup Launcher                   ║
# ║  Clone → Run. Nothing else required.                           ║
# ╚══════════════════════════════════════════════════════════════════╝
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Colors ──────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BLUE='\033[0;34m'; MAGENTA='\033[0;35m'
BOLD='\033[1m'; DIM='\033[2m'; RESET='\033[0m'

banner() {
    echo ""
    echo -e "${CYAN}${BOLD}"
    echo "  ██╗   ██╗ █████╗ ██╗      ██████╗ ██████╗ "
    echo "  ██║   ██║██╔══██╗██║     ██╔═══██╗██╔══██╗"
    echo "  ██║   ██║███████║██║     ██║   ██║██████╔╝"
    echo "  ╚██╗ ██╔╝██╔══██║██║     ██║   ██║██╔══██╗"
    echo "   ╚████╔╝ ██║  ██║███████╗╚██████╔╝██║  ██║"
    echo "    ╚═══╝  ╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═╝  ╚═╝"
    echo -e "${RESET}"
    echo -e "${DIM}  Strategic Intelligence Brief — Strait of Hormuz${RESET}"
    echo -e "${DIM}  Effects-Based Analysis Engine${RESET}"
    echo ""
}

step() { echo -e "  ${GREEN}▸${RESET} ${BOLD}$1${RESET}"; }
info() { echo -e "  ${DIM}  $1${RESET}"; }
warn() { echo -e "  ${YELLOW}⚠${RESET} $1"; }
fail() { echo -e "  ${RED}✗${RESET} $1"; exit 1; }
ok()   { echo -e "  ${GREEN}✓${RESET} $1"; }

# ── Detect Environment ─────────────────────────────────────────────
detect_env() {
    if [ -n "${SPACE_ID:-}" ] || [ -n "${HF_SPACE_ID:-}" ]; then
        echo "huggingface"
    elif [ -f "/.dockerenv" ]; then
        echo "docker"
    else
        echo "local"
    fi
}

# ── Find Python ────────────────────────────────────────────────────
find_python() {
    for cmd in python3 python; do
        if command -v "$cmd" &>/dev/null; then
            local ver
            ver=$("$cmd" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null || echo "0.0")
            local major minor
            major=$(echo "$ver" | cut -d. -f1)
            minor=$(echo "$ver" | cut -d. -f2)
            if [ "$major" -gt 3 ] || { [ "$major" -eq 3 ] && [ "$minor" -ge 9 ]; }; then
                echo "$cmd"
                return 0
            fi
        fi
    done
    return 1
}

# ── Ensure pip packages ───────────────────────────────────────────
ensure_pip_pkg() {
    local pkg="$1"
    local import_name="${2:-$1}"
    if ! "$PYTHON" -c "import $import_name" &>/dev/null; then
        info "Installing $pkg..."
        if "$PYTHON" -m pip install --quiet "$pkg" 2>/dev/null || \
           "$PYTHON" -m pip install --quiet --user "$pkg" 2>/dev/null; then
            : # installation succeeded
        else
            "$PYTHON" -m pip install "$pkg" || \
                fail "Unable to install $pkg via pip. See the pip error output above."
        fi
    fi
}

# ══════════════════════════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════════════════
banner

ENV=$(detect_env)
step "Environment detected: ${CYAN}${ENV}${RESET}"

# ── Python ──
step "Locating Python 3.9+..."
PYTHON=$(find_python) || fail "Python 3.9+ required. Install from https://python.org"
PYVER=$("$PYTHON" --version 2>&1)
ok "Found ${PYVER} → $PYTHON"

# ── Ensure pip ──
step "Ensuring pip..."
"$PYTHON" -m ensurepip --upgrade &>/dev/null 2>&1 || true
"$PYTHON" -m pip --version &>/dev/null 2>&1 || fail "pip not available"
ok "pip ready"

# ── Core dependencies for launcher ──
step "Bootstrapping launcher dependencies..."
ensure_pip_pkg "psutil"
ensure_pip_pkg "feedparser"
ensure_pip_pkg "yfinance"
ok "Core dependencies ready"

# ── Check Node.js for frontend builds ──
NODE_AVAILABLE=false
if command -v node &>/dev/null; then
    NODE_VER=$(node --version 2>/dev/null || echo "unknown")
    ok "Node.js ${NODE_VER} available"
    NODE_AVAILABLE=true
else
    warn "Node.js not found — frontend build unavailable (backend-only mode)"
fi

echo ""
echo -e "${DIM}  ─────────────────────────────────────────────────${RESET}"
echo ""

# ── Hand off to Python launcher ──
exec "$PYTHON" "${SCRIPT_DIR}/launcher/main.py" \
    --env "$ENV" \
    --node-available "$NODE_AVAILABLE" \
    "$@"
