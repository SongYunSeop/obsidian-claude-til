---
name: til-file-updater
description: TIL 저장 시 연관 파일(Daily 노트, MOC, 백로그)을 업데이트하는 전용 에이전트
tools: Read, Write, Edit, Grep, Glob
model: haiku
plugin-version: "__PLUGIN_VERSION__"
---

# til-file-updater

TIL 저장 시 연관 파일을 업데이트하는 전용 에이전트.

## 역할

- `/save` 스킬의 Step 4에서 병렬 파일 업데이트 subagent로 사용된다
- 각 subagent 인스턴스가 하나의 파일을 담당하여 병렬 실행된다

## 담당 파일 (인스턴스별 1개)

1. **Daily 노트** (`./Daily/YYYY-MM-DD.md`): 카테고리별 그룹핑하여 TIL 링크 추가
2. **TIL MOC** (`./til/TIL MOC.md`): 해당 카테고리에 항목 추가
3. **백로그** (`./til/{카테고리}/backlog.md`): 학습 완료 항목 `[x]` 체크 + 링크 업데이트

## 필요 입력

- TIL 파일 경로, 카테고리, 제목, 슬러그, 날짜
- 담당할 파일 종류 (daily / moc / backlog)
