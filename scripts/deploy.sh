#!/bin/bash
set -euo pipefail

# Claude TIL — Obsidian vault 배포 스크립트
# Usage: ./scripts/deploy.sh /path/to/vault
#   예시: ./scripts/deploy.sh ~/workspace/my-vault

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Electron 버전 (Obsidian이 사용하는 버전)
# ELECTRON_VERSION 환경변수를 설정하거나, macOS Obsidian에서 자동 감지
if [ -z "${ELECTRON_VERSION:-}" ]; then
  # macOS: Obsidian.app에서 Electron 버전 자동 감지
  PLIST="/Applications/Obsidian.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Resources/Info.plist"
  if [ -f "$PLIST" ]; then
    ELECTRON_VERSION=$(/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" "$PLIST" 2>/dev/null || true)
  fi

  if [ -z "${ELECTRON_VERSION:-}" ]; then
    echo "Error: Electron 버전을 감지할 수 없습니다."
    echo "  ELECTRON_VERSION 환경변수를 설정해주세요."
    echo "  예: ELECTRON_VERSION=37.10.2 npm run deploy -- /path/to/vault"
    echo ""
    echo "  Obsidian 개발자 도구(Ctrl+Shift+I)에서 확인:"
    echo "    process.versions.electron"
    exit 1
  fi
  echo "    Electron 버전 자동 감지: ${ELECTRON_VERSION}"
fi

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
  echo "  예시: $0 ~/workspace/my-vault"
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
cp "$PROJECT_DIR/migrate-links.mjs" "$PLUGIN_DIR/migrate-links.mjs"

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

# ── 4. node-pty Electron 재빌드 (버전 변경 시에만) ──────────

ELECTRON_VERSION_FILE="$PLUGIN_DIR/.electron-version"
LAST_ELECTRON_VERSION=""
if [ -f "$ELECTRON_VERSION_FILE" ]; then
  LAST_ELECTRON_VERSION=$(cat "$ELECTRON_VERSION_FILE")
fi

if [ "$LAST_ELECTRON_VERSION" = "$ELECTRON_VERSION" ]; then
  echo "==> node-pty 재빌드 스킵 (Electron ${ELECTRON_VERSION} 동일)"
else
  echo "==> node-pty를 Electron ${ELECTRON_VERSION}에 맞춰 재빌드 중..."
  cd "$PROJECT_DIR"
  npx @electron/rebuild -m "$PLUGIN_DIR/node_modules/node-pty" -v "$ELECTRON_VERSION" 2>&1
  echo "$ELECTRON_VERSION" > "$ELECTRON_VERSION_FILE"
fi

# ── 5. 스킬/규칙 강제 재설치 (옵션) ─────────────────────────

if [ "$REFRESH_SKILLS" = true ]; then
  echo "==> 스킬/규칙 파일 강제 재설치 중..."
  SKILLS_DIR="$VAULT_PATH/.claude/skills"
  RULES_DIR="$VAULT_PATH/.claude/rules"
  ASSETS_DIR="$PROJECT_DIR/vault-assets"
  PLUGIN_VERSION=$(node -p "require('$PROJECT_DIR/manifest.json').version")

  # 기존 플러그인 관리 스킬 삭제 (plugin-version이 있는 파일만 자동 탐색)
  if [ -d "$SKILLS_DIR" ]; then
    find "$SKILLS_DIR" -name "SKILL.md" -type f | while read -r SKILL_FILE; do
      if grep -q "plugin-version:" "$SKILL_FILE"; then
        rm "$SKILL_FILE"
        echo "    삭제: $SKILL_FILE"
      fi
    done
  fi

  # 기존 플러그인 관리 규칙 삭제
  if [ -d "$RULES_DIR" ]; then
    find "$RULES_DIR" -name "*.md" -type f | while read -r RULE_FILE; do
      if grep -q "plugin-version:" "$RULE_FILE"; then
        rm "$RULE_FILE"
        echo "    삭제: $RULE_FILE"
      fi
    done
  fi

  # vault-assets/skills/ 에서 최신 스킬 설치
  for SKILL_SRC in "$ASSETS_DIR"/skills/*/SKILL.md; do
    SKILL_NAME=$(basename "$(dirname "$SKILL_SRC")")
    DEST_DIR="$SKILLS_DIR/$SKILL_NAME"
    mkdir -p "$DEST_DIR"
    sed "s/__PLUGIN_VERSION__/$PLUGIN_VERSION/g" "$SKILL_SRC" > "$DEST_DIR/SKILL.md"
    echo "    설치: $DEST_DIR/SKILL.md"
  done

  # vault-assets/rules/ 에서 최신 규칙 설치
  for RULE_SRC in "$ASSETS_DIR"/rules/*.md; do
    RULE_NAME=$(basename "$RULE_SRC")
    mkdir -p "$RULES_DIR"
    sed "s/__PLUGIN_VERSION__/$PLUGIN_VERSION/g" "$RULE_SRC" > "$RULES_DIR/$RULE_NAME"
    echo "    설치: $RULES_DIR/$RULE_NAME"
  done

  echo "    스킬/규칙 재설치 완료."
fi

# ── 완료 ───────────────────────────────────────────────────

echo ""
echo "==> 배포 완료!"
echo "    위치: $PLUGIN_DIR"
echo "    Obsidian을 재시작하거나 플러그인을 다시 로드하세요."
