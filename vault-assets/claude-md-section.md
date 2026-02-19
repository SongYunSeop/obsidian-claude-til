## MCP 도구 (claude-til 플러그인)

Obsidian 플러그인이 MCP 서버를 통해 vault 접근 도구를 제공합니다.

| 도구 | 설명 | 활용 |
|------|------|------|
| `vault_read_note` | 노트 내용 읽기 | 특정 TIL 내용 확인 |
| `vault_list_files` | 폴더 내 파일 목록 | TIL 폴더 구조 파악 |
| `vault_search` | vault 전체 텍스트 검색 | 관련 노트 찾기, wikilink 후보 탐색 |
| `vault_get_active_file` | 현재 열린 파일 경로 + 내용 | 사용자가 보고 있는 파일 확인 |
| `til_list` | TIL 파일 목록 + 카테고리별 분류 | 중복 확인, 전체 현황 파악 |
| `til_backlog_status` | 백로그 진행률 요약 | 학습 진행 상황 확인 |

### 활용 팁

- `/til` 실행 전 `til_list`로 기존 TIL 확인하여 중복 방지
- `vault_search`로 관련 노트를 찾아 마크다운 링크 연결
- `vault_get_active_file`로 사용자가 보고 있는 파일 컨텍스트 파악

### 터미널 링크 출력 규칙

Obsidian 터미널은 `[text](path)` 표준 마크다운 링크를 감지하여 클릭 가능한 링크로 표시합니다. 대화 중 vault에 있는 노트를 언급할 때는 반드시 `[표시명](경로.md)` 형태로 출력하세요.

- 기존 TIL 언급: `[클로저](til/javascript/closure.md)에 대한 TIL이 이미 있습니다`
- 백로그 언급: `[React 백로그](til/react/backlog.md)를 확인해보세요`
- 관련 노트 추천: `이 내용은 [제네릭](til/typescript/generics.md)과 관련 있습니다`

이렇게 하면 사용자가 터미널에서 바로 클릭하여 해당 노트로 이동할 수 있습니다.

### MCP 연결

```bash
claude mcp add --transport http claude-til http://localhost:22360/mcp
```
