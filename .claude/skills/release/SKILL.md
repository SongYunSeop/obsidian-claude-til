---
description: "새 버전을 릴리즈합니다. 버전 범프 → 테스트 → 빌드 → 태그 → GitHub Release"
argument-hint: "[patch|minor|major]"
allowed-tools: Read, Edit, Bash(npm *), Bash(git *), Bash(gh *)
disable-model-invocation: true
---

# Create GitHub Release

새 버전을 릴리즈합니다.

## 인자

$ARGUMENTS에서 bump 타입을 추출합니다: `patch`, `minor`, `major` (기본: `patch`).
숫자 버전(예: `0.2.0`)이 직접 주어지면 그 버전을 사용합니다.
인자가 없으면 `patch` bump을 적용합니다.

## 사전 검증

1. working tree가 clean한지 확인 (`git status --porcelain`). uncommitted changes가 있으면 중단
2. 현재 브랜치가 `main`인지 확인. 아니면 중단
3. `gh` CLI가 설치되어 있는지 확인. 없으면 중단

## 버전 결정

- `manifest.json`에서 현재 버전을 읽는다
- bump 타입에 따라 semver 계산:
  - `patch`: 0.1.3 → 0.1.4
  - `minor`: 0.1.3 → 0.2.0
  - `major`: 0.1.3 → 1.0.0
- 계산된 새 버전을 사용자에게 확인받는다

## 문서 검증

버전 업데이트 전에 문서가 최신인지 검증한다:

1. `src/` 디렉토리의 실제 파일 목록과 `CLAUDE.md`의 구조 섹션을 비교한다
2. `CLAUDE.md`, `README.md`, `README.ko.md`에서 아래 항목이 현재 코드와 일치하는지 확인:
   - 스킬 목록 (`/til`, `/backlog`, `/research`, `/save` 등)
   - 설정 항목 (settings.ts의 인터페이스와 대조)
   - 프로젝트 구조 (파일 트리)
   - 빌드/배포 명령어
3. 누락이나 불일치가 있으면 수정하고, 없으면 다음 단계로 진행한다

## 절차

1. `npm test`로 테스트 통과 확인
2. `npm run build`로 프로덕션 빌드 확인
3. 아래 **7개 파일**의 버전을 새 버전으로 업데이트:
   - `package.json` → `"version"`
   - `manifest.json` → `"version"`
   - `versions.json` → 새 버전 항목 추가 (minAppVersion은 manifest.json에서 읽기)
   - `skills/til/SKILL.md` → `plugin-version` frontmatter
   - `skills/backlog/SKILL.md` → `plugin-version` frontmatter
   - `skills/research/SKILL.md` → `plugin-version` frontmatter
   - `skills/save/SKILL.md` → `plugin-version` frontmatter
4. 변경사항을 커밋: `🔖 chore: release v{version}`
5. 태그 생성: `git tag v{version}`
6. 푸시: `git push origin main --tags`
7. 릴리스 노트 작성 (아래 템플릿 참고)
8. GitHub Release 생성:
   ```
   gh release create v{version} main.js manifest.json styles.css --title "v{version}" --notes "{릴리스 노트}"
   ```

에셋은 반드시 `main.js`, `manifest.json`, `styles.css` 세 파일입니다.

## 릴리스 노트 작성

이전 태그부터 현재까지 커밋을 분석하여 릴리스 노트를 작성한다.

### 커밋 분석

```bash
git log {이전태그}...HEAD --oneline
```

이전 태그가 없으면 전체 커밋을 대상으로 한다.

### 커밋 분류 규칙

커밋 prefix 이모지 또는 타입으로 분류:

| prefix | 카테고리 |
|--------|----------|
| `✨ feat` | Features |
| `♻️ refactor`, `⚡ perf`, `🎨 style` | Improvements |
| `🐛 fix` | Bug Fixes |
| `📝 docs` | Documentation |
| `✅ test` | Tests |
| `🔖 chore`, `🔧 chore` | Chores (릴리스 노트에서 제외) |

사용자와 무관한 개발 도구/워크플로우 변경은 **Internal**로 분류한다.

### 릴리스 노트 템플릿

```markdown
## What's Changed

### Features
- 변경 요약 (커밋 메시지를 사용자 관점으로 재작성)

### Improvements
- 개선 요약

### Bug Fixes
- 수정 요약

### Documentation
- 문서 변경 요약

### Internal
- 개발 도구/워크플로우 변경 요약

**Full Changelog**: https://github.com/{owner}/{repo}/compare/{이전태그}...v{version}
```

### 작성 규칙

- 커밋 메시지를 그대로 복사하지 않고, **사용자 관점**에서 재작성한다
- 영문으로 작성한다
- `chore` 커밋(버전 범프, 릴리스 등)은 노트에서 제외한다
- 빈 카테고리는 섹션째 생략한다
- 한 카테고리에 항목이 1개면 카테고리 헤딩 없이 바로 나열해도 된다
