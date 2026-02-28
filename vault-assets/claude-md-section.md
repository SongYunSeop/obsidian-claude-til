## 학습 워크플로우

1. `/research <주제>` — 리서치 → 백로그 생성
2. `/backlog [카테고리]` — 백로그 진행 확인
3. `/til <주제>` — 리서치 → 대화형 학습 → 저장
4. `/save` — TIL 저장 (Daily/MOC/백로그 자동 업데이트)

## MCP 도구

- `vault_read_note` — 노트 읽기
- `vault_list_files` — 파일 목록
- `vault_search` — 텍스트 검색
- `vault_get_active_file` — 현재 파일
- `til_list` — TIL 목록 + 카테고리 분류
- `til_get_context` — 주제 관련 컨텍스트
- `til_recent_context` — 최근 학습 흐름
- `til_backlog_status` — 백로그 진행률
- `til_dashboard` — 학습 통계

### 연결

```bash
claude mcp add --transport http oh-my-til http://localhost:22360/mcp
```
