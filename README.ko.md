# Claude TIL

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Obsidian](https://img.shields.io/badge/Obsidian-v1.5.0+-7C3AED)](https://obsidian.md)
[![Version](https://img.shields.io/github/v/release/SongYunSeop/obsidian-claude-til)](https://github.com/SongYunSeop/obsidian-claude-til/releases)

[English](README.md) | **한국어**

Obsidian 사이드바에 Claude Code 터미널을 임베딩하여 AI 기반 TIL(Today I Learned) 학습 워크플로우를 제공하는 플러그인입니다.

![Claude TIL — 터미널 + TIL 노트](docs/screenshots/terminal-til.png)

## 기능

- **터미널 임베딩** — Obsidian 사이드바에서 Claude Code 터미널 실행 (xterm.js + node-pty)
- **MCP 서버 내장** — Claude Code가 HTTP로 vault에 직접 접근 (별도 플러그인 불필요)
- **학습 대시보드** — TIL 통계, 카테고리별 학습 현황을 한눈에
- **스킬 자동 설치** — `/til`, `/research`, `/backlog`, `/save` 명령을 바로 사용 가능
- **마크다운 링크 감지** — 터미널의 `[텍스트](경로)` 링크를 클릭하면 노트 열기 (CJK 문자 지원)
- **백로그 → TIL 연동** — 빈 백로그 링크 클릭 시 TIL 학습 세션 시작 제안
- **파일 자동 열기** — 새로 생성된 TIL 파일을 에디터에서 자동으로 열기

## 핵심 흐름

```
커맨드 팔레트 → 터미널 열기 → Claude Code 자동 시작
→ /til, /backlog, /research, /save 스킬 실행
→ Claude가 리서치 → 대화형 학습 → TIL 마크다운 저장
→ 새 파일 감지 → 에디터에서 자동 열기
```

## 시작하기

### 요구 사항

- [Obsidian](https://obsidian.md) v1.5.0 이상
- [Node.js](https://nodejs.org) 18 이상
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) (`claude`)

### 설치

#### 방법 A: Claude Code (권장)

```bash
git clone https://github.com/SongYunSeop/obsidian-claude-til.git
cd obsidian-claude-til
claude
# 실행 후: /install-plugin /path/to/your/vault
```

Claude Code가 Electron 버전을 자동 감지하고 네이티브 모듈 재빌드를 처리합니다.

#### 방법 B: 수동 설치

```bash
git clone https://github.com/SongYunSeop/obsidian-claude-til.git
cd obsidian-claude-til
npm install
ELECTRON_VERSION=<Electron-버전> npm run deploy -- /path/to/your/vault
```

> Electron 버전 확인: Obsidian 개발자 도구(Ctrl+Shift+I)에서 `process.versions.electron` 실행

Obsidian을 재시작한 뒤 설정 > Community plugins에서 **Claude TIL**을 활성화합니다.

### MCP 서버 연결 (선택)

플러그인이 HTTP 기반 MCP 서버를 내장하고 있어 Claude Code가 vault에 직접 접근할 수 있습니다:

```bash
claude mcp add --transport http claude-til http://localhost:22360/mcp
```

## 설정

| 설정 | 기본값 | 설명 |
|------|--------|------|
| Shell 경로 | 시스템 기본 셸 | 터미널에서 사용할 셸 |
| Claude 자동 실행 | `true` | 터미널 열릴 때 `claude` 명령 자동 실행 |
| 이전 세션 재개 | `false` | 이전 Claude 세션 이어서 시작 (`--continue`) |
| 글꼴 크기 | `13` | 터미널 글꼴 크기 (px) |
| 새 TIL 파일 자동 열기 | `true` | til/ 폴더에 새 파일 생성 시 자동 오픈 |
| MCP 서버 활성화 | `true` | 내장 MCP 서버 실행 여부 |
| MCP 포트 | `22360` | MCP 서버 포트 |

## MCP 도구

MCP 서버 연결 시 Claude Code에서 사용할 수 있는 도구:

| 도구 | 설명 |
|------|------|
| `vault_read_note` | 경로로 노트 내용 읽기 |
| `vault_list_files` | 폴더 내 파일 목록 (필터링 가능) |
| `vault_search` | vault 전체 텍스트 검색 |
| `vault_get_active_file` | 현재 열린 파일 가져오기 |
| `til_list` | 카테고리별 TIL 파일 목록 |
| `til_backlog_status` | 백로그 진행률 요약 (체크박스 카운트) |
| `til_get_context` | 주제 관련 기존 학습 컨텍스트 (파일, 링크 관계, 미작성 주제) |
| `til_recent_context` | 최근 학습 활동을 날짜별로 조회 |

## Claude 스킬

플러그인이 `.claude/skills/`에 자동 설치하는 스킬:

| 스킬 | 명령 | 설명 |
|------|------|------|
| **til** | `/til <주제> [카테고리]` | 주제 리서치 → 대화형 학습 → TIL 저장 |
| **research** | `/research <주제> [카테고리]` | 주제를 리서치하여 학습 백로그 생성 |
| **backlog** | `/backlog [카테고리]` | 학습 백로그 조회 및 진행 상황 요약 |
| **save** | *(/til에서 자동 호출)* | TIL 마크다운 저장 + Daily 노트, MOC, 백로그 연동 |

## 개발

```bash
npm run dev              # 워치 모드 (esbuild)
npm test                 # 테스트 실행 (vitest)
npm run rebuild-pty      # Obsidian Electron용 node-pty 재빌드
npm run deploy -- /path  # vault에 배포
npm run deploy -- --refresh-skills /path  # 스킬/규칙 강제 재설치 포함
```

### 프로젝트 구조

```
src/
├── main.ts                  # 플러그인 진입점
├── settings.ts              # 설정 탭 + 인터페이스
├── skills.ts                # 스킬/규칙 자동 설치
├── watcher.ts               # 파일 감시 → 에디터에서 열기
├── backlog.ts               # 백로그 파싱 순수 함수
├── terminal/
│   ├── TerminalView.ts      # 사이드바 터미널 (ItemView + xterm.js)
│   ├── MarkdownLinkProvider.ts  # [마크다운 링크](path) 감지 + 클릭 시 노트 열기 (CJK 지원)
│   └── pty.ts               # PTY 프로세스 관리 (node-pty)
├── mcp/
│   ├── server.ts            # MCP 서버 라이프사이클 (Streamable HTTP)
│   ├── tools.ts             # MCP 도구 정의
│   └── context.ts           # 학습 컨텍스트 헬퍼 (순수 함수)
└── dashboard/
    ├── DashboardView.ts     # 학습 대시보드 (ItemView)
    └── stats.ts             # TIL 통계 계산
```

### 기술 스택

| | |
|---|---|
| **런타임** | TypeScript, Obsidian Plugin API |
| **터미널** | xterm.js, node-pty |
| **MCP** | @modelcontextprotocol/sdk |
| **빌드** | esbuild |
| **테스트** | vitest |

## 로드맵

- [x] Claude Code 터미널 임베딩
- [x] MCP 서버 내장
- [x] 학습 대시보드 (기본 통계)
- [ ] 대시보드 백로그 진행률 바
- [ ] TIL 폴더 경로 커스터마이즈
- [ ] 리치 대시보드 — 최근 TIL 목록, 학습 스트릭, 주간 요약
- [ ] 동적 코드 블록 (`til-moc`, `til-daily`) — Dataview 없이 TIL 목록 자동 렌더링
- [ ] 멀티 터미널 탭 — 여러 Claude Code 세션 동시 실행
- [ ] 노트 링크 통합 — 관련 노트에 백링크 자동 삽입

## 감사의 글

- [claude-code-terminal](https://github.com/dternyak/claude-code-terminal) — xterm.js + node-pty Obsidian 통합 패턴의 원본
- [Obsidian Developer Docs](https://docs.obsidian.md/Home)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)

## 라이선스

[MIT](LICENSE)
