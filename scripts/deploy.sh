#!/bin/bash
set -euo pipefail

# Claude TIL — Obsidian vault 배포 스크립트
# Usage: ./scripts/deploy.sh /path/to/vault
#   예시: ./scripts/deploy.sh ~/workspace/songyunseop

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Electron 버전 (Obsidian이 사용하는 버전)
ELECTRON_VERSION="${ELECTRON_VERSION:-37.10.2}"

# ── 옵션 파싱 ──────────────────────────────────────────────

REFRESH_SKILLS=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --refresh-skills)
      REFRESH_SKILLS=true
      shift
      ;;
    -*)
      echo "Unknown option: $1"
      echo "Usage: $0 [--refresh-skills] <vault-path>"
      exit 1
      ;;
    *)
      break
      ;;
  esac
done

if [ $# -lt 1 ]; then
  echo "Usage: $0 [--refresh-skills] <vault-path>"
  echo "  예시: $0 ~/workspace/songyunseop"
  echo "  옵션: --refresh-skills  vault의 스킬/규칙 파일을 강제 재설치"
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

# ── 5. 스킬/규칙 강제 재설치 (옵션) ─────────────────────────

if [ "$REFRESH_SKILLS" = true ]; then
  echo "==> 스킬/규칙 파일 강제 재설치 중..."
  SKILLS_DIR="$VAULT_PATH/.claude/skills"
  RULES_DIR="$VAULT_PATH/.claude/rules"

  # 플러그인 관리 스킬 삭제 (plugin-version이 있는 파일만)
  for skill in til backlog research save; do
    SKILL_FILE="$SKILLS_DIR/$skill/SKILL.md"
    if [ -f "$SKILL_FILE" ] && grep -q "plugin-version:" "$SKILL_FILE"; then
      rm "$SKILL_FILE"
      echo "    삭제: $SKILL_FILE"
    fi
  done

  # 플러그인 관리 규칙 삭제 (plugin-version이 있는 파일만)
  for rule in save-rules.md; do
    RULE_FILE="$RULES_DIR/$rule"
    if [ -f "$RULE_FILE" ] && grep -q "plugin-version:" "$RULE_FILE"; then
      rm "$RULE_FILE"
      echo "    삭제: $RULE_FILE"
    fi
  done

  echo "    다음 플러그인 로드 시 최신 버전으로 재설치됩니다."
fi

# ── 완료 ───────────────────────────────────────────────────

echo ""
echo "==> 배포 완료!"
echo "    위치: $PLUGIN_DIR"
echo "    Obsidian을 재시작하거나 플러그인을 다시 로드하세요."
