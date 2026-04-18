# Feature Brief: Build & Distribution
_Stage: 06_
_Created: 2026-04-16 via /architector:finalize_
_Arch nodes covered: build-distribution_

## Goal
Configure electron-builder to package the complete Atrium app for Windows, Mac, and Linux. Set up GitHub Actions CI to build per-platform and upload artifacts to GitHub Releases. After this stage, the app is distributable — users can download and install it.

## Context
- App is feature-complete from Stage 05
- Native dependencies (node-pty, @parcel/watcher) require per-platform builds — cannot cross-compile
- SKILL.md files must be included via `extraResources` (not bundled in asar)
- No auto-update or code signing for v1

## What Needs to Be Built

**electron-builder configuration:**
- `electron-builder.yml` or `package.json` config section
- Platform targets:
  - Windows: NSIS installer
  - Mac: DMG, universal binary (arm64 + x64)
  - Linux: AppImage + deb
- `extraResources`: skills folder copied to `resources/` (outside asar)
- `electron-rebuild` configured for native deps against Electron's Node version
- Verify `resolveSkillsPath()` works in packaged app: `path.join(process.resourcesPath, 'skills')`
- Verify Electron userData paths are correct per platform after packaging

**GitHub Actions CI:**
- Matrix build: `windows-latest`, `macos-latest`, `ubuntu-latest`
- Steps: checkout → install → electron-rebuild → build → upload artifact
- Windows: ensure windows-build-tools / Visual Studio C++ workload available
- Mac: universal binary build (single artifact for both architectures)
- Artifacts uploaded to GitHub Releases (manual trigger or tag-based)

**Smoke test:**
- Packaged app launches on each platform
- Health check runs successfully
- Can open a project with `.ai-arch/` files
- Terminal spawns and renders output

## Dependencies
- Requires: Stage 05 (feature-complete app to package)
- Enables: distribution to users

## Key Decisions Already Made
- **electron-builder over electron-forge** — better installer options, simpler native dep config
- **SKILL.md via extraResources only** — no userData cache, no runtime updates, no version checks. Updating skills = new release.
- **No auto-update for v1** — manual download from GitHub Releases
- **No code signing for v1** — Mac notarization and Windows Authenticode deferred
- **Per-platform CI builds** — required for native addons, cannot cross-compile

## Open Technical Questions
- GitHub Actions workflow triggers: tag-based releases, manual dispatch, or both?
- Whether to include a `latest.yml` / `latest-mac.yml` for future auto-update compatibility
- App icon and metadata (product name, description, copyright) for installers
- Mac universal binary: verify both arm64 and x64 native deps rebuild correctly in one pass

## Out of Scope for This Stage
- Auto-update mechanism (deferred beyond v1)
- Code signing / notarization (deferred beyond v1)
- App store distribution
- Runtime skill updates

## Notes for /interview
/deep-plan directly — packaging decisions are straightforward. The main complexity is CI matrix configuration for native deps, which is well-documented in electron-builder docs.
