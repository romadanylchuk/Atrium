# Fix truncated Ctrl+V paste into embedded terminal
_Completed: 2026-04-22_

## Goal
Fix the silent head-of-buffer drop when pasting multi-line content into Atrium's embedded terminal via Ctrl+V / Ctrl+Shift+V, so pastes into the Claude CLI prompt arrive intact — matching what users already get in Windows Terminal or VS Code's integrated terminal.

## Implementation Summary
Wrapped every clipboard paste in the **bracketed-paste envelope** (`ESC[200~` … `ESC[201~`) before writing to the pty, so Claude CLI's Ink-based input handler ingests the buffer atomically instead of losing the head. All logic lives in a new pure renderer-side helper, `encodeBracketedPaste()`; main process, IPC surface, and chord-decision logic are unchanged.

- **Phase 1** — Created `bracketedPaste.ts` with a minimal `encodeBracketedPaste(text) = PASTE_START + text + PASTE_END` and wired it into the `case 'paste':` branch of `TerminalModal.tsx`. Shipped as an empirical probe to confirm the bracketed-paste hypothesis before investing in encoder hardening.
- **Phase 2** — Hardened the encoder: strip embedded `PASTE_START`/`PASTE_END` substrings via `.split().join('')` (avoids regex escaping), normalize `\r\n` → `\n` then lone `\r` → `\n`, and return `''` when sanitization empties the body. Added an empty-result guard (`if (!wrapped) return;`) before the IPC write. Added 12 unit cases covering empty / ASCII / CRLF / lone CR / mixed / embedded sentinels / interleaved sentinels / sentinels-only / whitespace-only / newline-only / unicode.
- **Phase 3** — Updated 2 existing `TerminalModal.test.tsx` paste assertions (`'abc'` → `'\x1b[200~abc\x1b[201~'`, `'xyz'` → `'\x1b[200~xyz\x1b[201~'`) and added a new multi-line CRLF integration test locking `'line1\r\nline2\r\nline3'` → `'\x1b[200~line1\nline2\nline3\x1b[201~'`.

Final state: 69/69 terminal-suite tests green, `tsc --noEmit` clean, lint clean.

## Key Decisions

- **Wrap unconditionally, no `?2004h`/`?2004l` state machine** — Atrium only spawns `claude` (Ink, enables bracketed paste at startup). Tracking enable/disable from pty `onData` would need a chunk-reassembling ESC parser for a single-TUI app. Cosmetic degradation in a non-supporting TUI is acceptable; data loss is not.
- **Strip sentinels from clipboard body, not escape** — ignoring is a paste-injection vector (e.g. clipboard ending in `\x1b[201~<cmd>` would close the envelope early). Bracketed-paste protocol has no quoting mechanism, so stripping is the only real option — same as Windows Terminal / iTerm.
- **Normalize CRLF and lone CR → LF inside envelope** — Ink treats `\r` as Enter; normalization is the low-risk default even if the envelope alone suffices. Phase 1's manual CRLF verification confirmed the envelope fixes the drop; Phase 2's normalization is defense in depth.
- **Encoder in renderer, not main** — main treats `terminal:write` bytes as opaque; moving envelope logic there would also wrap normal keystrokes from `xterm.onData`, which is wrong. Renderer knows which code path is a paste (the explicit `case 'paste':` branch).
- **Phase 1 as empirical probe** — minimal ~10-line diff shipped before encoder hardening, per the brief's instruction to gate the larger design on proof. If the probe had failed, the investigation would have pivoted to node-pty / ConPTY input-pipe behavior on Windows.
- **One pre-existing lint fix** (Phase 1, noted as a deviation) — added `void _exhaustive;` after the exhaustive-check `const _exhaustive: never = action;` in `TerminalModal.tsx` so ESLint's `no-unused-vars` rule passes. Exhaustiveness semantics unchanged.

## Files Changed

- `src/renderer/src/terminal/bracketedPaste.ts` (created)
- `src/renderer/src/terminal/__tests__/bracketedPaste.test.ts` (created)
- `src/renderer/src/terminal/TerminalModal.tsx` (modified)
- `src/renderer/src/terminal/__tests__/TerminalModal.test.tsx` (modified)

## Gaps/Notes

- **Untested integration branch:** the `if (!wrapped) return;` guard in `TerminalModal.tsx` (Phase 2) is exercised by a unit test of `encodeBracketedPaste()` returning `''` for sentinel-only input, but there is no end-to-end integration test verifying TerminalModal suppresses the IPC write in that case. Low-probability scenario (clipboard contains only `\x1b[200~\x1b[201~`), flagged in `review-all-report.md` under Suggestions. Not blocking.
- **Pre-existing race (not introduced by this feature):** in `TerminalModal.tsx:76`, `currentId` is captured at key-event time while `status` is re-read from the store inside the `.then()` callback. If the terminal exits and a new one spawns before the clipboard read resolves, a stale `currentId` could be written to with the new terminal's `active` status passing the check. Sub-millisecond window; IPC likely no-ops. Worth revisiting only if a "dead write" bug surfaces. Flagged in review.
- **Unrelated working-tree drift:** `src/main/ipc/terminal.ts`, `src/preload/api.ts`, `src/preload/index.ts`, `src/shared/ipc.ts` contain `terminal:close` IPC additions that belong to a separate uncommitted feature (Close-button flow), not to this paste fix. Flagged in `final-check-result.md`.
- **Bracketed-paste-disabled TUI:** if a future non-Ink TUI is ever spawned through Atrium's terminal without advertising `?2004h`, the envelope bytes will appear as literal garbage. Accepted trade-off; revisit if/when a second TUI is introduced.
- **No E2E scenario:** per the brief, unit + integration coverage is sufficient; no new Playwright specs were added.
