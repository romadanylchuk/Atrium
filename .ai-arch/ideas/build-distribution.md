# Idea: Build & Distribution
_Created: 2026-04-16_
_Slug: build-distribution_

## Description
Electron app packaging with electron-builder. Platform installers: NSIS (Windows), DMG universal binary (Mac), AppImage+deb (Linux). SKILL.md files distributed via `extraResources` — updating skills means releasing a new app version. No auto-update or code signing for v1. GitHub Actions CI with per-platform matrix builds.

## Decision
_Decided: 2026-04-16_

### What Was Decided

1. **Packaging tool: electron-builder** — more battle-tested than electron-forge for production distribution, better installer options, simpler config for native deps, handles universal Mac binary natively.

2. **Platform installers:**
   - **Windows:** NSIS installer
   - **Mac:** DMG, universal binary (arm64 + x64 in one .dmg)
   - **Linux:** AppImage + deb

3. **SKILL.md distribution: `extraResources` only.**
   - Skills folder copied to `resources/` via electron-builder `extraResources` config
   - NOT in userData cache
   - NOT runtime GitHub update check
   - NOT versioned compatibility check
   - Updating skills = releasing a new app version. Deliberate simplification — the complexity of a runtime update mechanism is not justified for current scope.
   - `resolveSkillsPath()` in main process, resolved once at startup:
     ```typescript
     // dev
     path.join(app.getAppPath(), 'skills')
     // packaged
     path.join(process.resourcesPath, 'skills')
     ```
   - Passed as `skillsDir` parameter to skill-orchestration's `composeCommand`

4. **CI/CD: GitHub Actions with matrix build:**
   - Matrix: `windows-latest`, `macos-latest`, `ubuntu-latest`
   - Each platform builds natively (required for native deps — cannot cross-compile)
   - `electron-rebuild` against Electron's Node version (not system Node)
   - Windows: requires windows-build-tools (Visual Studio C++ workload)
   - Mac: universal binary — single build for both architectures
   - Artifacts uploaded to GitHub Releases

5. **v1 scope exclusions:**
   - **No auto-update** — manual download from GitHub Releases is fine initially
   - **No code signing** — Mac notarization and Windows Authenticode deferred; only strictly needed for auto-update or Gatekeeper bypass
   - Both can be added later without architectural changes

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| electron-forge | Less mature for production distribution; electron-builder has better installer and native dep support |
| SKILL.md in userData with runtime GitHub updates | Adds version checking, download logic, cache invalidation, error handling for a feature that can be solved by releasing a new app version |
| SKILL.md bundled inside asar | Can't be updated independently; also harder to debug when skills are inside the archive |
| Cross-compilation for all platforms on one CI runner | Not possible with native addons (node-pty, @parcel/watcher); must build on target OS |
| Auto-update via electron-updater for v1 | Requires code signing (Mac notarization, Windows Authenticode); adds complexity without clear benefit for initial users |
| Separate platform-specific repos | Unnecessary fragmentation; one repo with matrix build handles all platforms |

### Rationale
electron-builder is the standard choice for Electron apps with native dependencies and cross-platform distribution. The SKILL.md simplification is the most impactful decision here: earlier exploration considered runtime update checks, but the final design ties skill versions to app versions. This eliminates an entire category of problems (version compatibility, download failures, cache corruption) at the cost of requiring a new release to update skills — an acceptable tradeoff given that skill changes and app changes are likely to be coupled anyway.

### Implications
- **skill-orchestration** — `skillsDir` resolved at startup via `resolveSkillsPath()`; no runtime update logic
- **cross-platform-shell** — Electron runtime is what gets packaged; native deps require per-platform builds
- **data-layer** — Electron userData paths (`app.getPath('userData')`) must work correctly after packaging
- **testing-strategy** — E2E tests run against packaged app in CI

## Priority
core

## Maturity
decided

## Notes
- App size: Electron baseline ~150MB+, monitor for bloat; native deps add modest overhead
- Native deps (node-pty, @parcel/watcher) require `electron-rebuild` — this is the main CI complexity

## Connections
- cross-platform-shell: defines the Electron runtime that gets packaged
- skill-orchestration: SKILL.md in folder next to app; command pattern resolves path at runtime; periodic update checks removed
- data-layer: Electron userData paths must be correct per platform after packaging
- testing-strategy: E2E tests run against packaged app in CI

## History
- 2026-04-16 created — identified as gap; Electron packaging is non-trivial, especially with native deps (node-pty, @parcel/watcher) and cross-platform installers
- 2026-04-16 /architector:explore — chose electron-builder, universal Mac binary, SKILL.md manually managed in folder next to app (no runtime updates), no auto-update or code signing for v1; simplified skill-orchestration dependency
- 2026-04-16 /architector:decide — locked in electron-builder + platform matrix CI; SKILL.md via extraResources only (no userData, no runtime updates, no version checks); resolveSkillsPath() at startup; updating skills = new release; v1 excludes auto-update and code signing
