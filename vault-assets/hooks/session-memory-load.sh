#!/bin/bash
# Oh My TIL — Session memory load hook
# Scans the filesystem for recently modified TIL files and injects context at session start
# No save hook needed — reads file mtimes directly

TIL_PATH="${OH_MY_TIL_PATH:-til}"

# Check if TIL directory exists
if [ ! -d "$TIL_PATH" ]; then
  exit 0
fi

# Find TIL files modified in the last 24 hours
recent_files=()
while IFS= read -r f; do
  [ -n "$f" ] && recent_files+=("$f")
done < <(find "$TIL_PATH" -name "*.md" -not -name "backlog.md" -mmin -1440 2>/dev/null | head -20)

if [ ${#recent_files[@]} -eq 0 ]; then
  exit 0
fi

echo "📚 최근 학습 컨텍스트:"
echo ""
echo "최근 24시간 내 작업한 TIL:"

for f in "${recent_files[@]}"; do
  title=$(grep -m1 "^# " "$f" 2>/dev/null | sed 's/^# //')
  category=$(echo "$f" | sed "s|^$TIL_PATH/||" | cut -d'/' -f1)
  if [ -n "$title" ]; then
    echo "  - $title ($category) — $f"
  else
    echo "  - $f ($category)"
  fi
done

echo ""
echo "이전 작업을 이어가려면 해당 파일을 참조하세요."
