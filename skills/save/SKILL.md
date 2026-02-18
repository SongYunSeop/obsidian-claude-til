---
name: save
description: "학습 내용을 TIL 파일로 저장하고 Daily 노트, MOC, 백로그를 일괄 업데이트"
argument-hint: "[주제] [카테고리]"
plugin-version: "0.2.0"
---

# Save Skill

학습 대화의 결과물을 Obsidian 호환 TIL 마크다운으로 저장하고, 연관 파일(Daily 노트, TIL MOC, 백로그)을 빠짐없이 업데이트한다.

핵심 원칙은 `.claude/rules/save-rules.md`에 항상 로드되어 있다. 이 스킬은 상세 템플릿과 워크플로우를 정의한다.

## 활성화 조건

- "저장해줘", "저장", "정리해줘", "TIL로 만들어줘"
- "/save"
- `/til` Phase 2 완료 후 사용자가 저장을 요청할 때

## 비활성화 조건

- 학습 대화 없이 호출 (저장할 내용이 없음) → "저장할 학습 내용이 없습니다" 안내
- 이미 저장된 TIL 파일을 수정하고 싶을 때 → 직접 파일 편집
- 백로그만 확인하고 싶을 때 → `/backlog` 사용

## MCP 도구 활용

`claude-til` MCP 서버가 연결되어 있으면 MCP 도구를 활용한다:

- **저장 전**: `til_list`로 기존 TIL 목록을 확인하여 동일/유사 주제 중복 방지
- **저장 전**: `vault_search`로 vault 내 관련 노트를 검색하여 `[[wikilink]]` 후보 파악
- **저장 전**: `vault_get_active_file`로 사용자가 보고 있는 파일 컨텍스트 확인

MCP 도구를 사용할 수 없는 경우에도 워크플로우는 정상 동작한다.

## 워크플로우

### Step 1: 컨텍스트 확인

1. 현재 대화에서 학습한 주제를 파악한다
2. 카테고리가 지정되지 않았으면 주제에 맞는 카테고리를 자동 추천한다
3. 주제나 카테고리가 불명확하면 사용자에게 질문한다

### Step 2: TIL 파일 저장

1. 학습 내용을 아래 템플릿에 맞춰 정리한다
2. `./til/{카테고리}/{주제슬러그}.md`에 저장한다
3. 동일 슬러그가 있으면 사용자에게 확인한다

### Step 3: Daily 노트 업데이트

해당 날짜의 Daily 노트(`./Daily/YYYY-MM-DD.md`)에 카테고리별로 그룹핑하여 링크를 추가한다.

### Step 4: TIL MOC 업데이트

`./til/TIL MOC.md`의 해당 카테고리에 항목을 추가한다.

### Step 5: 백로그 체크

해당 카테고리 백로그(`./til/{카테고리}/backlog.md`)에 항목이 있으면 `[x]`로 체크하고 wikilink를 경로 기반으로 업데이트한다.

### Step 6: 완료 안내

저장된 파일 경로를 사용자에게 안내한다.

### Step 7: git commit

변경된 파일(TIL, Daily 노트, MOC, 백로그)을 하나의 atomic commit으로 커밋한다.

- 커밋 메시지 형식: `📝 til: {한글 제목}({영문 제목}) - {카테고리}`
- 예: `📝 til: 클로저(Closure) - javascript`
- push는 하지 않는다 (로컬 커밋만)
- Step 1~6이 모두 완료된 후에만 커밋한다

### Step 8: 안내

컨텍스트가 길어졌다면 `/compact`를 실행하라고 안내한다.

## 저장 경로 규칙

```
./til/
├── TIL MOC.md              ← Obsidian MOC (Map of Content)
├── javascript/
│   ├── closure.md
│   └── event-loop.md
├── rust/
│   └── ownership.md
└── devops/
    └── docker-network.md
```

- 기본 경로: `./til/{카테고리}/{주제슬러그}.md`
- 카테고리 폴더가 없으면 자동 생성
- 주제 슬러그: 영문 소문자, 하이픈 구분 (예: `event-loop`, `docker-network`)
- 날짜는 파일명이 아닌 frontmatter `date` 필드에 기록한다

## TIL 마크다운 템플릿

```markdown
---
date: YYYY-MM-DD
category: 카테고리
tags:
  - til
  - 태그1
  - 태그2
aliases:
  - "한글 제목"
  - "영문 제목"
---

# 제목

> [!tldr] 한줄 요약
> 핵심을 한 문장으로 요약

## 핵심 내용

학습한 핵심 개념을 설명한다. 필요하면 소제목으로 나눈다.

관련 개념이 vault에 있거나 앞으로 작성될 수 있으면 [[wikilink]]로 연결한다.

### 소제목 (필요시)

상세 설명...

## 예시

```언어
// 코드 예시 또는 실제 사례
```

> [!example] 실행 결과
> 코드 실행 결과나 동작 설명

## 참고 자료

- [자료 제목](URL)
- [자료 제목](URL)

## 관련 노트

- [[관련 TIL이나 노트가 있으면 링크]]
```

### 템플릿 작성 규칙

1. **Properties (frontmatter)**
   - `tags`에 항상 `til`을 포함한다
   - `aliases`에 한글/영문 제목을 넣어 검색이 쉽게 한다
   - `date`는 ISO 형식 (YYYY-MM-DD)

2. **Wikilinks `[[]]`**
   - 본문에서 관련 개념이 나오면 `[[개념]]` 형태로 링크한다
   - 아직 없는 노트여도 괜찮다 (Obsidian에서 나중에 생성 가능)
   - 예: "JavaScript의 [[클로저(Closure)]]는 [[렉시컬 스코프]]를 기억한다"

3. **Callouts**
   - 한줄 요약: `> [!tldr]`, 실행 결과: `> [!example]`, 주의: `> [!warning]`, 팁: `> [!tip]`

4. **Mermaid 다이어그램**
   - 텍스트로 설명 어려운 구조/흐름에만 사용, TIL당 최대 1개

5. **태그**: frontmatter `tags`로 관리, 카테고리명도 태그에 포함

## Daily 노트 연동

TIL 저장 시 `./Daily/YYYY-MM-DD.md`에 카테고리별 링크 추가:

```markdown
## TIL

### javascript
- [[til/javascript/closure|클로저(Closure)]]

### devops
- [[til/devops/docker-network|Docker 네트워크]]
```

- `### 카테고리` 소제목으로 그룹핑
- 기존 Daily 노트: `## TIL` 섹션 찾아서 카테고리별 항목 추가 (없으면 파일 끝에 추가)
- Daily 노트 없으면 새로 생성
- 카테고리 소제목 순서: 기존 유지, 새 카테고리는 마지막

## TIL MOC (Map of Content)

`./til/TIL MOC.md`에 카테고리별 항목 추가. MOC가 없으면 새로 생성:

```markdown
---
tags:
  - moc
  - til
---

# TIL (Today I Learned)

## 카테고리

### javascript
- [[til/javascript/closure|클로저(Closure)]]
```

## 백로그 연동

`./til/{카테고리}/backlog.md`에 학습한 주제가 있으면:

1. `- [ ]`를 `- [x]`로 변경
2. wikilink가 경로 기반(`[[til/{카테고리}/{slug}|표시명]]`)이 아니면 업데이트

## 피해야 할 실패 모드

- **Daily/MOC/백로그 누락**: 가장 흔한 실수. 체크리스트 반드시 확인
- **기존 슬러그 충돌**: 같은 슬러그 파일 있는지 확인
- **민감 정보 노출**: `example.com`, `your-api-key` 등 대체값 사용

## 완료 체크리스트

저장 시 아래 항목을 **모두** 확인한다. 하나라도 빠지면 저장 미완료:

- [ ] TIL 파일이 템플릿 형식에 맞게 저장됨
- [ ] Daily 노트에 카테고리별 링크 추가됨
- [ ] TIL MOC에 항목 추가됨
- [ ] 백로그 항목 있으면 `[x]` 체크 + wikilink 업데이트
- [ ] 저장 경로 안내함
- [ ] git commit (push 제외)
- [ ] `/compact` 안내
