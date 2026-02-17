---
plugin-version: "0.1.4"
---

# TIL 저장 규칙

TIL 저장 시 반드시 따르는 원칙. 상세 템플릿과 형식 예시는 `/save` 스킬 참조.

## 필수 경로

- TIL 파일: `./til/{카테고리}/{주제슬러그}.md` (슬러그: 영문 소문자, 하이픈 구분)
- Daily 노트: `./Daily/YYYY-MM-DD.md`
- TIL MOC: `./til/TIL MOC.md`
- 백로그: `./til/{카테고리}/backlog.md`

## 저장 시 필수 업데이트 항목

1. TIL 파일 저장 (frontmatter: date, category, tags[til], aliases)
2. Daily 노트에 카테고리별(`### 카테고리`) 링크 추가
3. TIL MOC에 항목 추가
4. 백로그에 해당 항목 있으면 `[x]` 체크 + wikilink 경로 기반 업데이트
5. 저장 경로 안내
6. git commit (`📝 til: {제목} - {카테고리}`, push 제외)
7. `/compact` 안내 (강제 아님, 사용자 판단)

## 주의사항

- TIL 파일만 저장하고 Daily/MOC/백로그 업데이트를 빠뜨리지 않는다
- 동일 슬러그 파일이 있으면 사용자에게 확인한다
- 민감 정보(API 키, 내부 URL 등)는 대체값 사용
