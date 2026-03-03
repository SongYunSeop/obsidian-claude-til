## 학습 워크플로우

1. `/research <주제>` — 리서치 → 백로그 생성
2. `/backlog [카테고리]` — 백로그 진행 확인
3. `/til <주제>` — 리서치 → 대화형 학습 → 저장
4. `/save` — TIL 저장 (Daily/MOC/백로그 자동 업데이트)
5. `/til-review [카테고리]` — SRS 기반 간격 반복 복습

## MCP 도구

**학습 컨텍스트:**
- `til_get_context` — 주제 관련 기존 학습 컨텍스트 (경로/내용 매칭, backlink, 미작성 링크)
- `til_recent_context` — 최근 학습 흐름 (시간순)
- `vault_get_active_file` — 현재 열린 파일

**TIL 관리:**
- `til_list` — TIL 목록 + 카테고리 분류 (search 필터)
- `til_save_note` — TIL 저장 (frontmatter 보장, auto_check_backlog로 백로그 자동 체크)

**백로그:**
- `til_backlog_status` — 백로그 진행률
- `til_backlog_check` — 백로그 항목 완료 처리 (단독 사용 시)

**복습 (SRS):**
- `til_review_list` — 복습 카드 목록 + 통계 (include_content)
- `til_review_update` — 복습 결과 기록

**통계:**
- `til_dashboard` — 학습 대시보드 통계

### 연결

```bash
# HTTP (Obsidian 플러그인 또는 oh-my-til serve 사용 시)
claude mcp add --transport http oh-my-til http://localhost:22360/mcp

# stdio (Obsidian 없이 독립 실행, Claude Desktop scheduled task 등)
claude mcp add oh-my-til -- npx oh-my-til mcp /path/to/vault
```
