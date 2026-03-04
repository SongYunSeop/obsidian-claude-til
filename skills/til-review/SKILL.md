---
name: til-review
description: "SRS 기반 TIL 복습 세션 (간격 반복 학습)"
argument-hint: "[카테고리]"
plugin-version: "__PLUGIN_VERSION__"
---

# Review Skill

SRS(간격 반복) 기반 TIL 복습 세션. SM-2 알고리즘으로 복습 일정을 관리한다.

## MCP 도구

- `til_review_list`: 오늘 복습 대상 카드 목록 + 통계 (`include_content: true`로 노트 내용 함께 로드)
- `til_review_update`: 복습 결과 기록 (grade 0-5) 또는 복습 해제

## Step 1: 복습 카드 로드

`til_review_list` 호출 (`include_content: true`, 카테고리 인자 있으면 전달).

- 카드 0개 → "오늘 복습 없음" 안내 + 미등록 TIL 등록 제안 (Step 5로)
- 카드 있음 → 목록 표시 + Step 2로

## Step 2: 평가 모드 선택

`AskUserQuestion`으로 선택:
- "간단 모드 (Again / Good)"
- "상세 모드 (Again / Hard / Good / Easy)"

## Step 3: 카드별 복습 루프

각 카드에 대해:

1. 제목·카테고리·복습 정보(반복 횟수, EF, 연체일) 표시
2. Step 1에서 이미 로드된 `content` 사용 (추가 MCP 호출 불필요)
3. 핵심 내용을 질문 형식으로 제시 (내용 기반으로 1~2개 질문 생성)
4. 사용자 답변 대기
5. 피드백 제공 (정답/보충 설명)
6. `AskUserQuestion`으로 평가 입력:
   - 간단 모드: "Good (기억남)" / "Again (모름)" / "건너뛰기" / "복습 중단"
   - 상세 모드: "Again (실패)" / "Hard (어렵게 정답)" / "Good (정상)" / "Easy (완벽)"
   - grade 매핑: Again=1, Hard=3, Good=4, Easy=5
   - "건너뛰기" 선택 시 이 카드는 평가하지 않고 다음으로
   - "복습 중단" 선택 시 Step 4로 이동
   - 상세 모드에서 건너뛰기/중단: "Other" 선택 후 "건너뛰기" 또는 "복습 중단" 입력
7. 건너뛰기가 아닌 경우 `til_review_update` (action: "review", grade) 호출
8. 결과 요약 (다음 복습일, interval) 표시

## Step 4: 완료 통계

모든 카드 완료 후:
- 복습한 카드 수, 평균 grade
- remaining > 0이면 "N개 더 남음, 내일 이어서" 안내
- `til_review_list` 재호출하여 최신 통계 표시

## Step 5: TIL 등록 (선택)

카드가 없을 때 또는 사용자 요청 시:
- `til_list`로 전체 TIL 목록 표시
- 사용자가 복습 대상에 추가할 파일 선택
- 선택된 파일마다 `til_review_update` (action: "review", grade: 4) 호출

## 규칙

- 한 세션 최대 20개 (과부하 방지)
- 연체 카드 우선 (가장 급한 것 먼저)
- 복습 해제: 사용자가 "이 카드 제거"하면 `til_review_update` (action: "remove") 호출
- 한국어 진행, 기술 용어 원어 병기
