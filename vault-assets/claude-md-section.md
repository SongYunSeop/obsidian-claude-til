## 학습 워크플로우

1. `/research <주제>` — 리서치 → 백로그 생성
2. `/backlog [카테고리]` — 백로그 진행 확인
3. `/til <주제>` — 리서치 → 대화형 학습 → 저장
4. `/save` — TIL 저장 (Daily/MOC/백로그 자동 업데이트)
5. `/til-review [카테고리]` — SRS 기반 간격 반복 복습

## MCP 도구

- `vault_read_note` — 노트 읽기
- `vault_list_files` — 파일 목록
- `vault_search` — 텍스트 검색
- `vault_get_active_file` — 현재 파일
- `til_list` — TIL 목록 + 카테고리 분류 (search 필터 지원)
- `til_exists` — TIL 파일 존재 여부 확인
- `til_save_note` — TIL 노트 저장 (frontmatter/경로 규칙 보장, category·aliases 지원)
- `til_get_context` — 주제 관련 컨텍스트
- `til_recent_context` — 최근 학습 흐름
- `til_backlog_status` — 백로그 진행률
- `til_backlog_check` — 백로그 항목 완료 처리
- `til_dashboard` — 학습 통계
- `til_review_list` — 복습 대상 카드 목록 + 통계
- `til_review_update` — 복습 결과 기록 또는 복습 해제

### 연결

```bash
# HTTP (Obsidian 플러그인 또는 oh-my-til serve 사용 시)
claude mcp add --transport http oh-my-til http://localhost:22360/mcp

# stdio (Obsidian 없이 독립 실행, Claude Desktop scheduled task 등)
claude mcp add oh-my-til -- npx oh-my-til mcp /path/to/vault
```
