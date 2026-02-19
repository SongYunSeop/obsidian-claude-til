---
name: backlog
description: "학습 백로그를 조회하고 진행 상황을 보여준다"
argument-hint: "[카테고리]"
disable-model-invocation: true
plugin-version: "__PLUGIN_VERSION__"
---

# Backlog Skill

학습 백로그를 조회하고 진행 상황을 요약한다.

## 활성화 조건

- "/backlog"
- "/backlog <카테고리>"

## 비활성화 조건

- 새 백로그를 만들거나 항목을 추가하고 싶을 때 → `/research` 사용
- 특정 개념을 학습하고 싶을 때 → `/til` 사용
- 백로그 항목을 완료 처리하고 싶을 때 → `/til`로 학습 후 자동 체크되거나 직접 편집

## MCP 도구 활용

`claude-til` MCP 서버가 연결되어 있으면 MCP 도구를 우선 사용한다:

- **전체 조회** (`/backlog`): `til_backlog_status` 도구로 진행률 데이터를 가져온다
- **카테고리 조회** (`/backlog 카테고리`): `til_backlog_status` 도구에 `category` 인수를 전달한다. 섹션별 상세 내역이 필요하면 파일을 직접 읽는다

MCP 도구를 사용할 수 없는 경우 아래 워크플로우대로 파일을 직접 읽는다.

## 워크플로우

### 인수가 없을 때 (`/backlog`)

1. `./til/*/backlog.md` 파일을 Glob으로 모두 찾는다
2. 각 백로그 파일을 읽어서 다음을 요약한다:
   - 카테고리명
   - 전체 항목 수
   - 완료 항목 수 (`- [x]`)
   - 미완료 항목 수 (`- [ ]`)
   - 진행률 (%)
   - 최근 학습일 (frontmatter `updated` 필드)
3. 전체 백로그 요약을 테이블로 보여준다

### 인수가 있을 때 (`/backlog 카테고리`)

1. `./til/{카테고리}/backlog.md` 파일을 읽는다
2. 파일이 없으면 "해당 카테고리에 백로그가 없습니다"라고 알린다
3. 파일이 있으면 다음을 보여준다:
   - 진행률 요약 (완료/전체)
   - 섹션별(선행 지식/핵심 개념/심화) 미완료 항목 목록
   - 완료된 항목은 `- [x] 항목명 ✅` 형식으로 체크박스와 체크마크를 함께 표시하여 시각적으로 구분

## 출력 형식

### 전체 조회 (`/backlog`)

```
📋 학습 백로그 현황

| 카테고리 | 진행률 | 완료 | 최근 학습 | 진행바 |
|---------|--------|------|----------|--------|
| [claude-code](til/claude-code/backlog.md) | 30% | 4/13 | 2026-02-15 | ████░░░░░░ |
| [javascript](til/javascript/backlog.md) | 0% | 0/8 | 2026-02-10 | ░░░░░░░░░░ |

총 21개 항목 중 4개 완료
```

카테고리명은 `[카테고리명](til/{카테고리}/backlog.md)` 마크다운 링크로 출력하여 클릭 시 해당 백로그 파일로 이동할 수 있게 한다.

### 카테고리 조회 (`/backlog claude-code`)

```
📋 [claude-code](til/claude-code/backlog.md) 백로그 (4/13 완료, 30%)

## 선행 지식 (2/4)
- [x] [CLAUDE.md](til/claude-code/claude-md.md) ✅
- [x] [Settings와 Configuration](til/claude-code/settings.md) ✅
- [ ] [Permission 모드](til/claude-code/permission-mode.md)
- [ ] [CLI 레퍼런스(CLI Reference)](til/claude-code/cli-reference.md)

## 핵심 개념 (1/5)
- [x] [Hooks](til/claude-code/hooks.md) ✅
- [ ] [MCP(Model Context Protocol)](til/claude-code/mcp.md)
- [ ] [Context 관리(Context Management)](til/claude-code/context-management.md)
- [ ] [Agent Teams](til/claude-code/agent-teams.md)
- [ ] [IDE Integration](til/claude-code/ide-integration.md)

## 심화 (1/4)
- [ ] [GitHub Actions와 CI/CD](til/claude-code/github-actions-ci-cd.md)
- ...
```

- 완료된 항목은 `- [x] [항목명](경로.md) ✅` 형식으로 링크 + 체크마크를 함께 표시한다
- 각 항목의 링크는 backlog.md 파일에 이미 `[표시명](til/{카테고리}/{slug}.md)` 형태로 저장되어 있으므로, 해당 링크를 그대로 출력한다
- backlog.md의 원본 링크를 파싱하여 출력한다. 원본에 링크가 없는 항목은 일반 텍스트로 출력한다

## 주의사항

- 백로그 파일을 수정하지 않는다 (읽기 전용)
- 진행률 바는 10칸 기준으로 표시한다 (█ = 완료, ░ = 미완료)
- 한국어로 출력한다

## 피해야 할 실패 모드

- **백로그 파일 수정**: 이 스킬은 읽기 전용이다. 절대 backlog.md를 편집하지 않는다
- **잘못된 카운팅**: `- [x]`와 `- [ ]`를 정확히 세어야 한다. 섹션 헤딩(`##`)이나 백로그 링크(`- [backlog](backlog.md)`)를 항목으로 잘못 세지 않는다
- **섹션 누락**: 카테고리 조회 시 모든 섹션(선행 지식/핵심 개념/심화/생태계 등)을 빠짐없이 보여준다
