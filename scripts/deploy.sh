#!/bin/bash
set -euo pipefail

# Claude TIL — Obsidian vault 배포 스크립트
# Usage: ./scripts/deploy.sh /path/to/vault
#   예시: ./scripts/deploy.sh ~/workspace/songyunseop

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Electron 버전 (Obsidian이 사용하는 버전)
ELECTRON_VERSION="${ELECTRON_VERSION:-37.10.2}"

# ── 인자 검증 ──────────────────────────────────────────────

if [ $# -lt 1 ]; then
  echo "Usage: $0 <vault-path>"
  echo "  예시: $0 ~/workspace/songyunseop"
  exit 1
fi

VAULT_PATH="$1"

if [ ! -d "$VAULT_PATH/.obsidian" ]; then
  echo "Error: '$VAULT_PATH'는 Obsidian vault가 아닙니다 (.obsidian 폴더 없음)"
  exit 1
fi

PLUGIN_DIR="$VAULT_PATH/.obsidian/plugins/claude-til"

# ── 1. 빌드 ───────────────────────────────────────────────

echo "==> 플러그인 빌드 중..."
cd "$PROJECT_DIR"
npm run build

# ── 2. 플러그인 디렉토리 생성 + 에셋 복사 ─────────────────

echo "==> 플러그인 에셋 복사 중..."
mkdir -p "$PLUGIN_DIR"

cp "$PROJECT_DIR/main.js" "$PLUGIN_DIR/main.js"
cp "$PROJECT_DIR/manifest.json" "$PLUGIN_DIR/manifest.json"
cp "$PROJECT_DIR/styles.css" "$PLUGIN_DIR/styles.css"

# ── 3. 네이티브 의존성 설치 ────────────────────────────────

echo "==> 네이티브 모듈 설치 중..."

# 플러그인 폴더에 package.json 생성 (없으면)
if [ ! -f "$PLUGIN_DIR/package.json" ]; then
  cat > "$PLUGIN_DIR/package.json" << 'EOF'
{
  "name": "claude-til",
  "version": "1.0.0",
  "private": true,
  "type": "commonjs",
  "dependencies": {
    "ajv": "^8.18.0",
    "ajv-formats": "^3.0.1",
    "node-pty": "^1.1.0"
  }
}
EOF
fi

cd "$PLUGIN_DIR"
npm install --production 2>&1

# ── 4. node-pty Electron 재빌드 ────────────────────────────

echo "==> node-pty를 Electron ${ELECTRON_VERSION}에 맞춰 재빌드 중..."
cd "$PROJECT_DIR"
npx @electron/rebuild -m "$PLUGIN_DIR/node_modules/node-pty" -v "$ELECTRON_VERSION" 2>&1

# ── 완료 ───────────────────────────────────────────────────

echo ""
echo "==> 배포 완료!"
echo "    위치: $PLUGIN_DIR"
echo "    Obsidian을 재시작하거나 플러그인을 다시 로드하세요."
