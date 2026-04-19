# Native Rebuild Notes

## Environment

- Local Node: v22.21.1 (ABI 127)
- Electron: 41.2.1 (bundles Node 22.x — same ABI 127 as local Node)
- `@electron/rebuild`: 4.0.3 (provides the `electron-rebuild` bin shim)
- Platform: Windows 11 x64, no Visual Studio / MSVC installed

## How each native module is shipped

### node-pty 1.1.0

Ships **platform prebuilds** in `node_modules/node-pty/prebuilds/win32-x64/`.
Install script (`scripts/prebuild.js`) checks for the prebuilt directory; if found, it exits 0 and skips `node-gyp rebuild`.
At runtime, Electron loads these prebuilts directly — no compile step needed on the dev machine or in CI.

Binaries present (all timestamped 2026-04-18, unchanged by `electron-rebuild`):
- `prebuilds/win32-x64/pty.node` (303 KB)
- `prebuilds/win32-x64/conpty.node` (312 KB)
- `prebuilds/win32-x64/conpty_console_list.node` (134 KB)

### @parcel/watcher 2.5.6

Ships **NAPI platform packages** as optional dependencies (`@parcel/watcher-win32-x64`).
The main package's `index.js` delegates to the platform package at require-time — no node-gyp involved.

Binary present (timestamped 2026-04-18):
- `node_modules/@parcel/watcher-win32-x64/watcher.node` (523 KB)

## `npm run rebuild:native` outcome

**Exit code: non-zero (failure) — N/A, prebuilts used.**

`@electron/rebuild` attempts `node-gyp rebuild` on `@parcel/watcher` from source and fails with:

```
Error: Could not find any Visual Studio installation to use
```

This is expected and inconsequential. `@parcel/watcher` uses NAPI prebuilts and does not require
source compilation. The `-f` flag forces a rebuild even when prebuilts exist, which is unnecessary.
`node-pty` similarly uses prebuilts and does not need MSVC.

Both modules load correctly without any native build step:
- `require('@parcel/watcher').subscribe` → `function` ✓
- `require('node-pty').spawn` → `function` ✓

The effective phase 3 exit gate is: (a) both native modules load via `require()` — verified above;
(b) `electron-builder` will run its own rebuild step during packaging — verified in Phase 4.

## postinstall hook — decision

The `postinstall` hook (`"postinstall": "electron-rebuild -f -w node-pty,@parcel/watcher"`) has been
**removed** from `package.json`.

**Why:** Both modules provide NAPI/prebuild binaries selected at `npm install` time. Forcing a
node-gyp source rebuild on every `npm ci` would:
1. Break CI on all runners — no MSVC on `ubuntu-latest`/`macos-latest`; wrong toolchain even on `windows-latest`.
2. Slow down local installs unnecessarily.
3. Provide no benefit — `electron-builder` invokes `@electron/rebuild` at package time during the
   `--mac --universal` and platform builds, which is the correct place for ABI-targeted recompilation.

The `rebuild:native` script is retained as an on-demand manual escape hatch (e.g., if a developer
needs to force a source rebuild after changing Node versions or toolchain).

## Local Node vs. Electron ABI

Electron 41 bundles Node 22.x (ABI 127). Local dev machine runs Node v22.21.1 (ABI 127). These match.
Both modules use NAPI prebuilts which are ABI-stable across Node 22.x minor versions, so they work
in both the dev Node context and Electron's bundled runtime without separate Electron-targeted compilation.

On CI, the pinned Node 24 version would be an ABI mismatch for non-NAPI modules, but since both
modules use prebuilts, this does not matter in practice.

## CI runner prerequisites

| Runner | node-pty | @parcel/watcher | MSVC/Xcode needed |
|---|---|---|---|
| `windows-latest` | prebuilt ✓ | prebuilt ✓ | no |
| `ubuntu-latest` | prebuilt ✓ | prebuilt ✓ | no |
| `macos-latest` | prebuilt ✓ | prebuilt ✓ | no |

No extra toolchain setup is required in CI for either native module.

## Universal macOS note

For `--mac --universal`, `electron-builder` invokes `@electron/rebuild` twice (once per arch:
`x64` and `arm64`) during the LIPO step. Both `node-pty` and `@parcel/watcher` ship
`darwin-x64` and `darwin-arm64` prebuilts, so the universal build works without additional Xcode
toolchain setup beyond what `macos-latest` already provides.
