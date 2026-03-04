---
description: Obsidian vault에 Oh My TIL 플러그인을 설치하거나 업데이트합니다
plugin-version: __PLUGIN_VERSION__
---

# setup-obsidian

현재 디렉토리에 Obsidian Oh My TIL 플러그인을 설치하거나 업데이트합니다.

## 실행 조건

- 현재 디렉토리에 `.obsidian/` 폴더가 있어야 합니다 (Obsidian vault)
- 없으면 사용자에게 알려주고 중단합니다

## 실행 방법

다음 명령을 실행하세요:

```bash
npx oh-my-til init "$(pwd)"
```

## 완료 후

- 설치 결과를 사용자에게 요약합니다
- Obsidian을 재시작하고 설정 > Community plugins에서 **Oh My TIL**을 활성화하도록 안내합니다
- 이미 설치되어 있었다면 업데이트되었음을 알립니다
