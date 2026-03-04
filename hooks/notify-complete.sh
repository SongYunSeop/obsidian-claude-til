#!/bin/bash
# Oh My TIL — Task completion notification hook

TITLE="Oh My TIL"
MESSAGE="작업이 완료되었습니다"

if [[ "$OSTYPE" == "darwin"* ]]; then
  if command -v terminal-notifier &>/dev/null; then
    terminal-notifier -title "$TITLE" -message "$MESSAGE" -sound default 2>/dev/null
  else
    osascript -e "display notification \"$MESSAGE\" with title \"$TITLE\" sound name \"default\"" 2>/dev/null
  fi
elif command -v notify-send &>/dev/null; then
  notify-send "$TITLE" "$MESSAGE" 2>/dev/null
fi
