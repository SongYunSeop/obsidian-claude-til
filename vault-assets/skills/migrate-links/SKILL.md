---
name: migrate-links
description: "vault의 [[wikilink]]를 표준 마크다운 링크로 일괄 변환"
argument-hint: ""
plugin-version: "__PLUGIN_VERSION__"
---

# Migrate Links Skill

vault에 남아있는 `[[wikilink]]` 형식을 표준 마크다운 링크 `[text](path.md)`로 일괄 변환한다.

## 활성화 조건

- "/migrate-links"
- "위키링크 변환해줘", "wikilink를 마크다운 링크로 바꿔줘"

## 비활성화 조건

- 새 TIL 작성, 백로그 조회 등 다른 작업

## CLI 도구

플러그인 배포 시 `.obsidian/plugins/claude-til/migrate-links.mjs`가 함께 설치된다.
이 CLI는 `src/migrate-links.ts`의 테스트된 순수 함수를 번들링한 것이다.

```bash
# vault 디렉토리에서 실행
node .obsidian/plugins/claude-til/migrate-links.mjs . scan      # Phase 1: 스캔
node .obsidian/plugins/claude-til/migrate-links.mjs . migrate   # Phase 2: 변환
node .obsidian/plugins/claude-til/migrate-links.mjs . verify    # Phase 3: 검증
```

## 변환 규칙

| 기존 패턴 | 변환 결과 |
|-----------|-----------|
| `[[til/cat/slug\|Display]]` | `[Display](til/cat/slug.md)` |
| `[[til/cat/slug]]` | `[til/cat/slug](til/cat/slug.md)` |
| `[[path\|name]]` (테이블 내 이스케이프) | `[name](path.md)` |

- 경로에 `.md` 확장자가 없으면 자동 추가
- 경로에 이미 `.md`가 있으면 중복 추가하지 않음

## 워크플로우

### Phase 1: 스캔

`node .obsidian/plugins/claude-til/migrate-links.mjs . scan` 을 실행한다.

출력 결과를 사용자에게 보여준 뒤, wikilink가 없으면 종료한다.
wikilink가 있으면 `AskUserQuestion`으로 변환 진행 여부를 확인한다 ("변환 진행" / "취소").

### Phase 2: 변환

`node .obsidian/plugins/claude-til/migrate-links.mjs . migrate` 를 실행한다.

### Phase 3: 검증

`node .obsidian/plugins/claude-til/migrate-links.mjs . verify` 를 실행한다.

- 잔여 wikilink가 있으면 목록을 출력하고 "수동 확인이 필요한 wikilink가 남아있습니다" 안내
- 잔여 wikilink가 없으면 "모든 wikilink가 변환되었습니다" 확인

### Phase 4: 결과 요약 + 커밋

변경된 파일을 하나의 atomic commit으로 커밋한다:
- 커밋 메시지: `♻️ refactor: [[wikilink]] → 표준 마크다운 링크 일괄 변환`
- push는 하지 않는다 (로컬 커밋만)

## 주의사항

- 코드 블록(``` ``` ```) 내부의 wikilink는 변환하지 않는다
- 마크다운 테이블 내 `\|`로 이스케이프된 파이프는 올바르게 처리한다
- 변환 전 Phase 1에서 반드시 사용자 확인을 받는다
