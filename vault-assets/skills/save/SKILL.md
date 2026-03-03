---
name: save
description: "학습 내용을 TIL 파일로 저장하고 Daily 노트, MOC, 백로그를 일괄 업데이트"
argument-hint: "[주제] [카테고리]"
plugin-version: "__PLUGIN_VERSION__"
---

# Save Skill

학습 대화 → TIL 파일 저장 → Daily/MOC/백로그 업데이트 → 문서 리뷰 → 커밋.

## MCP 도구

- `til_get_context`: 관련 TIL·백로그 파악
- `til_list`: 기존 TIL 중복 확인
- `til_save_note`: TIL 노트 저장 (frontmatter/경로 규칙 서버 보장, auto_check_backlog로 백로그 자동 체크)
- `vault_get_active_file`: 사용자 파일 컨텍스트

## Step 1: 컨텍스트 확인

1. 주제·카테고리 파악. 불명확하면 사용자에게 질문.
2. `Read`로 `til/{category}/{slug}.md` 파일 존재 여부 확인.

## Step 2: 링크 후보 파악

1. `til_get_context` 또는 MOC/백로그로 기존 TIL·백로그 항목 파악
2. 기존 TIL/백로그 항목 → 본문에서 마크다운 링크 사용
3. 존재하지 않는 개념 → 사용자에게 확인 후 관련 노트에만 추가

## Step 3: TIL 파일 저장

경로: `./til/{카테고리}/{주제슬러그}.md` (슬러그: 영문 소문자, 하이픈)

**새 파일 저장**: `til_save_note` MCP 도구로 저장. frontmatter(title, date, category, tags, aliases)와 경로 규칙을 서버가 보장한다.

```
til_save_note(category, slug, title, content, tags, date, fmCategory, aliases, auto_check_backlog: true)
```

- `date`: `date +%Y-%m-%dT%H:%M:%S` 명령으로 로컬 시각을 조회하여 전달
- `tags`: 반드시 "til" 포함
- `aliases`: ["한글 제목", "영문 제목"]
- `content`: frontmatter 제외한 본문 마크다운

**동일 슬러그 파일 있을 때** (Step 1에서 `Read`로 감지):
- `/til` 심화 학습이 연속된 경우만 자동 병합 (기존 내용 유지 + 보강, `updated` 추가)
- 그 외: 사용자에게 병합/덮어쓰기 확인
- 병합 시에는 `til_save_note` 대신 직접 Read→Edit으로 기존 내용에 보강

### TIL 본문 템플릿

```markdown
# 제목

> [!tldr] 한줄 요약

## 핵심 내용
## 예시
## 참고 자료
- [제목](URL)
## 관련 노트
- [TIL](til/{카테고리}/{slug}.md)
```

- 링크: `[표시명](til/{카테고리}/{slug}.md)` — `[[위키링크]]` 금지

## Step 4: 연관 파일 업데이트

아래 3개 파일을 **직접** 순차 업데이트한다 (subagent 사용 금지):

1. Daily 노트 (`./Daily/YYYY-MM-DD.md`): 카테고리별 TIL 링크 추가 (없으면 생성)
2. TIL MOC (`./til/TIL MOC.md`): 카테고리 섹션에 항목 추가 (없으면 생성)
3. 백로그: `til_save_note`의 `auto_check_backlog: true`로 이미 처리됨 (별도 호출 불필요)

Daily/MOC: Read → 위치 확인 → Edit. 파일 없으면 생성.

## Step 5: 문서 리뷰

저장된 TIL 전체 내용 표시 → `AskUserQuestion`으로 확인 ("확인 완료" / "수정 필요").

## Step 6: 복습 등록

`AskUserQuestion`으로 "이 TIL을 복습 대상에 추가할까요?" 질문.
사용자 동의 시 `til_review_update` (action: "review", grade: 4) 호출하여 SRS 메타데이터 생성.

## Step 7: git commit

`📝 til: {한글 제목}({영문 제목}) - {카테고리}` (push 안 함)

## 규칙

- frontmatter 필수: date, category, tags, aliases (누락 시 저장 전 보완)
- tags에 반드시 "til" 포함 (정적 사이트 필터 기준)
- `[[위키링크]]` 금지 — `[표시명](경로)` 형식만 사용
- TIL만 저장하고 Daily/MOC/백로그 누락하지 않는다
- Callout 활용: `> [!tldr]`, `> [!example]`, `> [!warning]`, `> [!tip]`
- 복잡한 개념은 Mermaid 다이어그램으로 시각화 (TIL당 최대 1개)
- 민감 정보 대체값 사용
- 한국어 작성, 기술 용어 원어 병기
