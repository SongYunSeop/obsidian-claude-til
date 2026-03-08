## What's Changed

### Improvements
- Removed unused `serve` and `init` CLI commands, keeping only `mcp`, `install-obsidian`, `deploy`, and `version`

### Internal
- Added CI/CD GitHub Actions workflows (CI on PRs to `develop`, automated npm publish + GitHub Release on tag push via Trusted Publishing)
- Adopted `develop → main` branching strategy for releases
- Switched to npm Trusted Publishing (OIDC) for secure, token-free CI/CD

**Full Changelog**: https://github.com/SongYunSeop/oh-my-til/compare/v1.2.0...v1.3.0
