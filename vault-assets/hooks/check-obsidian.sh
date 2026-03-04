#!/bin/bash
# Oh My TIL — SessionStart hook: detect Obsidian vault and suggest plugin setup

# Skip if not in an Obsidian vault
[ ! -d ".obsidian" ] && exit 0

# Skip if oh-my-til plugin is already installed
[ -d ".obsidian/plugins/oh-my-til" ] && exit 0

echo "Obsidian vault를 감지했지만 oh-my-til 플러그인이 설치되어 있지 않습니다."
echo "Obsidian 터미널 임베딩, 파일 감시, 대시보드를 사용하려면 /oh-my-til:setup-obsidian 을 실행하세요."
