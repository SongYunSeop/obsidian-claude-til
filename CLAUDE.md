# CLAUDE.md - oh-my-til

## 프로젝트 개요

Claude Code 기반 TIL 학습 워크플로우 플러그인. Obsidian 없이 독립 CLI(`npx oh-my-til`)로 실행하거나, Obsidian 플러그인으로 사이드바에 Claude Code 터미널을 임베딩하여 사용할 수 있다. xterm.js + node-pty 기반.

핵심 흐름: 커맨드 팔레트 → 터미널 열기 → Claude Code에서 `/til`, `/backlog`, `/research`, `/save`, `/dashboard`, `/migrate-links` 스킬 직접 실행 → 새 파일 감지 시 에디터에서 열기

Obsidian의 역할은 "터미널 임베딩 + 파일 감시 + skill 배포 + MCP 서버 + 대시보드"로 한정하고, 워크플로우 주도권은 Claude Code에 있다. 독립 실행 시에는 `npx oh-my-til init`으로 스킬/규칙을 설치하고 `npx oh-my-til serve`로 MCP 서버를 띄운다.

## 프로젝트 철학

코어 가치는 Claude Code 기반 학습 워크플로우(스킬, MCP 도구, 학습 컨텍스트 분석)에 있다.
Obsidian은 현재 검증 환경이자 배포 채널이며, 코어 로직은 Obsidian 없이도 성립해야 한다.

- **코어 레이어** (Obsidian 비종속): 스킬 프롬프트, MCP 도구 로직(context.ts, backlog.ts, stats.ts), 학습 워크플로우 설계
- **플랫폼 어댑터** (Obsidian 종속): 터미널 임베딩, 파일 감시, 대시보드 UI, 설정 탭, Plugin 라이프사이클

새 기능 추가 시 로직은 코어 레이어에, UI/이벤트 연결은 플랫폼 어댑터에 배치한다.

## 기술 스택

- TypeScript + Obsidian Plugin API
- xterm.js (@xterm/xterm) — 터미널 렌더링
- node-pty — PTY(의사 터미널) 프로세스 관리
- @modelcontextprotocol/sdk — MCP 프로토콜 구현
- zod — 입력 스키마 검증 (MCP SDK 피어)
- @electron/rebuild — 네이티브 모듈 재빌드 (Electron 37.10.2)
- esbuild — 번들러

## 핵심 레퍼런스

- [claude-code-terminal](https://github.com/dternyak/claude-code-terminal) — xterm.js + node-pty Obsidian 통합 패턴의 원본 구현

## 구조

```
src/
├── core/                     ← 플랫폼 독립 순수 로직
│   ├── backlog.ts            ← 백로그 파싱/포맷 순수 함수 (parseBacklogItems, extractTopicFromPath, parseBacklogSections, parseFrontmatterSources)
│   ├── context.ts            ← 학습 컨텍스트 순수 함수 (topic 매칭, 최근 활동, 포맷)
│   ├── stats.ts              ← 대시보드 통계 순수 함수 (streak, heatmap, enhanced categories, backlog progress)
│   ├── migrate-links.ts      ← Wikilink [[]] → [](path) 변환 순수 함수
│   ├── keyboard.ts           ← Shift+Enter → \n 변환 순수 함수 (Claude Code multiline 지원)
│   ├── env.ts                ← ensurePath(): macOS Homebrew PATH 보정
│   ├── skills.ts             ← 버전 비교/플레이스홀더 치환 순수 함수
│   ├── cli.ts                ← CLI 인자 파싱 순수 함수 (parseArgs)
│   └── index.ts              ← barrel export
├── ports/                    ← 어댑터 인터페이스
│   ├── storage.ts            ← FileStorage 인터페이스
│   └── metadata.ts           ← MetadataProvider 인터페이스
├── adapters/                 ← 포트 구현체
│   ├── fs-adapter.ts         ← node:fs 기반 (standalone)
│   └── obsidian-adapter.ts   ← Obsidian App 기반
├── mcp/                      ← MCP 서버 (포트 의존, Obsidian 무관)
│   ├── server.ts             ← HTTP 서버 + Streamable HTTP 트랜스포트
│   └── tools.ts              ← MCP 도구 정의 (FileStorage + MetadataProvider 사용)
├── skills-install.ts         ← Skill/Rule 버전 기반 자동 설치/업데이트 + CLAUDE.md MCP 섹션 관리 (공유)
├── cli/                      ← 독립 CLI 진입점
│   └── index.ts              ← npx oh-my-til init / serve
└── obsidian/                 ← Obsidian 플랫폼 어댑터
    ├── main.ts               ← TILPlugin 진입점 (터미널 뷰 + MCP + 대시보드 + watcher + skill 설치)
    ├── settings.ts           ← 설정 탭 + 인터페이스 (mcpEnabled, mcpPort 포함)
    ├── watcher.ts            ← 새 TIL 파일 감지 → 에디터에서 열기
    ├── terminal/
    │   ├── TerminalView.ts   ← 사이드바 터미널 (ItemView + xterm.js)
    │   ├── MarkdownLinkProvider.ts ← 3개 ILinkProvider: MarkdownLinkProvider ([text](path) + CJK), FilepathLinkProvider (til/ 경로), Osc8LinkProvider (OSC 8 하이퍼링크 + IMarker)
    │   └── pty.ts            ← PTY 프로세스 관리 (node-pty)
    └── dashboard/
        └── DashboardView.ts  ← 학습 대시보드 (Summary Cards + Heatmap + Categories + Recent + Backlog)

vault-assets/             ← vault에 배포되는 파일 (esbuild text import → 런타임 설치)
├── skills/               ← .claude/skills/에 설치되는 스킬 소스
├── rules/                ← .claude/rules/에 설치되는 규칙 소스
└── claude-md-section.md  ← .claude/CLAUDE.md에 삽입되는 MCP 안내

__tests__/
├── mock-obsidian.ts      ← obsidian 모듈 mock
├── utils.test.ts         ← 설정 기본값 테스트
├── skills.test.ts        ← skill/rule 버전 기반 설치/업데이트 로직 테스트
├── watcher.test.ts       ← 파일 감시 필터링 로직 테스트
├── stats.test.ts         ← 대시보드 통계 (기본 + streak, heatmap, enhanced categories, backlog) 테스트
├── mcp-tools.test.ts     ← MCP 도구 필터링/집계 로직 테스트
├── context.test.ts       ← 학습 컨텍스트 순수 함수 테스트
├── mcp-server.test.ts    ← MCP 서버 HTTP 라우팅/CORS/라이프사이클 테스트
├── main-logic.test.ts    ← 플러그인 핵심 로직 (watcher 동기화, 설정 검증)
├── backlog.test.ts       ← 백로그 파싱/경로 추출 테스트
├── markdown-link-provider.test.ts ← 마크다운 링크 감지 + CJK 셀 너비 + OSC 8 순수 함수 테스트
├── shift-enter.test.ts   ← Shift+Enter 키 핸들러 순수 함수 테스트
├── ensure-path.test.ts   ← macOS PATH 보정 테스트
├── migrate-links.test.ts ← Wikilink → 마크다운 링크 변환 테스트
├── adapters.test.ts      ← fs-adapter / obsidian-adapter 포트 구현 테스트
└── cli.test.ts           ← CLI 인자 파싱 (positional + options) 테스트
```

## 빌드

```bash
npm install
npm run rebuild-pty    # node-pty를 Obsidian Electron 버전에 맞춰 재빌드
npm run dev            # 워치 모드
npm run build          # Obsidian 플러그인 + CLI 모두 빌드
npm run build:obsidian # Obsidian 플러그인만 빌드
npm run build:cli      # CLI만 빌드
npm test               # vitest 테스트 실행
npm run deploy -- <vault-path>  # vault에 배포 (빌드 + 복사 + pty 재빌드)
npm run deploy -- --refresh-skills <vault-path>  # 스킬/규칙 강제 재설치 포함
```

### Standalone CLI (Obsidian 없이 독립 실행)

```bash
npx oh-my-til init ~/my-til                     # 디렉토리 생성 + 스킬/규칙/CLAUDE.md 설치
npx oh-my-til serve ~/my-til                    # MCP 서버 독립 실행
npx oh-my-til serve ~/my-til --port 3000 --til-path my-til
```

## 규칙

- **코드 변경 시 항상 feature branch + worktree에서 작업한다**. main 브랜치에서 직접 수정하지 않는다.
- **새 기능/워크플로우 변경 시 반드시 사용자와 방향을 먼저 논의한다**. 구현 방식이 여러 가지일 수 있는 작업은 바로 코드를 작성하지 않고, 접근 방법을 제안하고 합의한 뒤 작업한다.
- **브랜치 격리 (git worktree)**: feature 브랜치 작업 시 `git worktree`를 사용하여 작업 디렉토리를 분리한다. 현재 브랜치에서 다른 feature 작업이 필요하면 `git worktree add ../oh-my-til-<branch-name> <branch-name>`으로 별도 worktree를 생성하도록 안내한다. 같은 디렉토리에서 브랜치를 전환하지 않는다.
- Obsidian API는 `obsidian` 모듈에서 import
- node-pty는 `electronRequire`로 로드 (일반 import 불가, 네이티브 모듈)
- `onload()`에서 등록한 리소스는 자동 해제됨
- `onunload()`에서 PTY 프로세스를 반드시 kill
- 파일 감시는 `vault.on('create', ...)` 사용
- manifest.json의 `isDesktopOnly`는 반드시 `true` (node-pty 네이티브 모듈 때문)
- esbuild에서 node-pty는 external로 처리
- UI 워크플로우(주제 입력, 백로그 선택)는 Claude Code 스킬이 담당 — Obsidian 쪽에서 중복 구현하지 않는다
- MCP 도구는 Obsidian `App` 인스턴스를 통해 vault 접근 — node-pty/터미널을 거치지 않음
- MCP 서버는 `onload()`에서 시작, `onunload()`에서 종료
- 대시보드는 순수 DOM 조작 (프레임워크 없음), Obsidian CSS 변수 활용
- 코드 변경 시 테스트 가능한 부분은 반드시 테스트 작성/실행 후 커밋 (`npm test && npm run build` 통과 확인)
- Skill 파일은 `.claude/skills/<name>/SKILL.md` 경로에 설치 (Claude Code가 1단계 깊이만 탐색, 중첩 불가)
- Skill 파일의 `plugin-version` frontmatter로 자동 업데이트 관리. 없으면 사용자 커스터마이즈로 간주하여 덮어쓰지 않음
- 백로그 파일은 `til/{카테고리}/backlog.md` 경로 패턴
- 한국어 작성, 기술 용어 원어 병기
- **문서 동기화**: 새 파일 추가, 설정 변경, 스킬 추가/삭제 등 구조적 변경이 있으면 `CLAUDE.md`, `README.md`, `README.ko.md`도 함께 업데이트한다 (구조 섹션, 기능 목록, 설정 테이블, 스킬 목록)
- **버전 관리**: vault-assets의 `plugin-version`은 `__PLUGIN_VERSION__` 플레이스홀더로 관리되며, `skills.ts`가 설치 시 `manifest.json` 버전으로 자동 치환한다. 릴리즈 시 수동 업데이트 대상은 `package.json`, `manifest.json`, `versions.json` 3개 파일뿐이다. `/release` 스킬 사용을 권장한다.

## 참고 문서

- [Obsidian Developer Docs](https://docs.obsidian.md/Home)
- [Plugin API Reference](https://docs.obsidian.md/Reference/TypeScript+API/Plugin)
- [xterm.js docs](https://xtermjs.org/docs/)
- [node-pty (GitHub)](https://github.com/microsoft/node-pty)
- [claude-code-terminal 소스](https://github.com/dternyak/claude-code-terminal)
