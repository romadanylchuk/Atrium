# Brief: Consultation Chat Panel

## Goal

Add a consultation chat feature to Atrium — a right-side slide-in panel where the user can have a persistent conversational thread per project with a Claude Code-backed co-architect that reads project context but does not write files. The feature wraps existing Claude Code CLI invocation (re-using the user's existing Claude Code subscription — no separate API billing) and provides read-only consultation distinct from the existing implementation-capable terminal session.

## Project-fit corrections (2026-04-24)

Items the original author did not have full Atrium context for. Each correction is applied inline below.

1. **Shared types** belong at `src/shared/consultation.ts` (root of `@shared`, not `schema/`). The `schema/` subdirectory is reserved for ai-arch JSON schema files (`aiArch.ts`). Export added to `src/shared/index.ts` barrel.
2. **Error codes** follow the project-wide `as const` + derived-union + `...CommonErrorCode` spread pattern defined in `src/shared/errors.ts`. `ConsultationErrorCode` is appended to that file alongside `TerminalErrorCode`, `LayoutErrorCode`, etc. — NOT declared as a standalone union type.
3. **IPC channel names** are declared in `src/shared/ipc.ts` under the `IPC` const as `IPC.consultation.*`. Handlers and preload use `IPC.consultation.sendMessage`, never the bare string `'consultation:sendMessage'`. Streaming events (`streamChunk`, `streamComplete`, `streamError`) are also added to the `IPC` const.
4. **Preload surface** — a `consultation` namespace must be added to `AtriumAPI` in `src/preload/api.ts` and implemented in `src/preload/index.ts`. Subscriptions return an unsubscribe closure (matches `fileSync.onChanged`, `terminal.onData` pattern).
5. **IPC wiring** — `registerConsultationHandlers(...)` must be added to `src/main/ipc/register.ts` alongside `registerLayoutHandlers`, `registerSkillHandlers`, etc. A `src/main/consultation/index.ts` barrel exports the service and handler registration function.
6. **Claude binary resolution** reuses the existing pattern in `src/main/terminal/resolveClaudeBin.ts` + `getCachedClaudeBin()`. The consultation invoker MUST splice the cached absolute path in when the first arg is bare `'claude'` (same logic `TerminalManager.spawn()` uses at `terminalManager.ts:50–57`). On Windows, `.cmd` shims cannot be resolved from bare names by `child_process.spawn` either, so the splice is required there too.
7. **Spawn mechanism** — use `node:child_process` `spawn` (NOT `node-pty`). `-p` is non-interactive, emits `stream-json` to stdout, and needs stream parsing rather than terminal emulation. `node-pty` is correct for the interactive terminal modal and wrong for this one-shot use case.
8. **Storage** reuses `atomicWriteJson` (`src/main/storage/atomicWrite.ts`), `hashKeyOnly` (`src/main/storage/projectHash.ts`), and `getProjectDir` (`src/main/storage/paths.ts`). A new `getConsultationPath(hash: string): string` helper is added to `paths.ts` alongside `getLayoutPath` / `getMetaPath`. Quarantine uses the existing `isoUtcNow()` convention (colons replaced with dashes for Windows). Distinguish `CORRUPT` (quarantine + fresh) vs `SCHEMA_MISMATCH` (leave file untouched, return err) — see `src/main/storage/layout.ts` `loadLayoutByHash` for the reference implementation.
9. **Panel mount point** — the existing right-side `<aside data-region="side-panel">` in `src/renderer/src/shell/MainShell.tsx` hosts `ProjectPanel`/`SelectionPanel` at 240px width. The 400px consultation panel is a separate right-edge element layered ABOVE or PUSHING the existing aside. Decision recorded below (§MainShell integration).
10. **Tests** live in `__tests__/` subdirectories next to the source they cover (project-wide convention — see every existing test in `src/main/**/__tests__` and `src/renderer/src/**/__tests__`). Not in the same directory as source files.
11. **Cancel/kill** must be platform-aware: Windows does not support `SIGTERM`; use `.kill()` directly. Non-Windows uses `SIGTERM` + timed `SIGKILL` fallback. Mirrors `TerminalManager.kill()` at `terminalManager.ts:109–118`.

## Phase 0 — Research tasks (BEFORE writing any code)

These must be verified on the actual installed `claude` binary. Do not proceed to Phase 1 until all six are answered. Report findings in PR description or dev notes.

**R1 — `stream-json` output format schema.**
- Run `claude -p --output-format stream-json "hi"` (or similar minimal prompt)
- Document the event types emitted (e.g. `message_start`, `content_block_delta`, `message_stop`, or whatever the actual names are)
- Identify how to detect end-of-response reliably
- Identify how error events appear in the stream
- Document parse shape Atrium will use

**R2 — tool-restriction flag verification.**
- Confirm the exact flag name. Recent Claude Code help output uses `--allowedTools` (camelCase), not `--tools`. Verify against the installed CLI (`claude -p --help`) and update all downstream docs + invocation code to match.
- Confirm exact syntax: case-sensitivity, separator (comma / space / both per help text)
- Confirm tool name strings: verify `Read`, `Grep`, `Glob` are correct tool names (test with the verified flag: e.g. `--allowedTools "Read,Grep,Glob"`)
- Verify hard enforcement: run a consultation invocation with the read-only tool list and explicitly request a file edit. Agent must refuse. If agent somehow calls Edit despite restriction — flag as blocker, investigate.

**R3 — `--session-id` + `--resume` first-message behavior.**
- When calling `claude -p --session-id <new-uuid> --resume "first message"` — does Claude Code create the session, or error because session does not exist?
- Determine correct sequence: does first call omit `--resume`? Does it need a separate "init session" step?
- Verify subsequent calls with `--session-id <same-uuid> --resume "second message"` correctly continue the conversation
- Document the correct invocation pattern for first vs subsequent messages

**R4 — `--bare` + `--system-prompt` interaction.**
- First verify that `--bare` exists in the installed Claude Code CLI at all. No existing Atrium code uses it (see `src/shared/skill/composeCommand.ts`). If the flag does not exist, fall back to explicit `--system-prompt` + avoid adding project CLAUDE.md paths.
- Verify `--system-prompt` overrides the default prompt when `--bare` is set
- Verify `--bare` correctly suppresses CLAUDE.md auto-discovery from project directory
- Verify we can still use `--add-dir` to explicitly allow access to project files (this is how Read/Grep/Glob tools know where to look)

**R5 — Auth and error cases.**
- Behavior when user is not logged in: exit code, stderr content, stream-json error shape
- Behavior when subscription quota exceeded / rate limited
- Behavior when `claude` binary not on PATH — mapping:
  - `src/main/terminal/resolveClaudeBin.ts` already caches the absolute path at boot. If `getCachedClaudeBin()` returns `null`, map to `CLAUDE_NOT_FOUND` before any spawn attempt.
  - If the binary was present at boot but later removed, `child_process.spawn` emits `error` with `code === 'ENOENT'` — also map to `CLAUDE_NOT_FOUND`.
- Behavior on network error during request
- Document mapping from each failure mode to Atrium-side error type

**R6 — `--fallback-model`, `--max-budget-usd`, and resilience.**
- Confirm `--fallback-model` exists and works with `--print` mode (help says it does)
- Confirm `--max-budget-usd` exists in the installed Claude Code CLI. Not used anywhere in the project today — flag as unverified. If the flag is absent or renamed, drop the budget feature from v1 (the UI has no cost display anyway — see "Out of scope").
- Verify the accepted value for `--model`. The CLI may accept short aliases (`opus`, `sonnet`) or require full IDs (`claude-opus-4-6`, `claude-sonnet-4-6`). Pin the exact string set in `ConsultationThread.model` to whatever the CLI accepts.
- Decide whether to enable `--fallback-model` in v1 for robustness (recommendation: yes, set `--fallback-model sonnet` when using opus default so overload degrades gracefully)

**Halt Phase 0 and surface findings if:**
- Tool restriction is not hard-enforced (R2)
- Session continuity doesn't work as documented (R3)
- `--bare` breaks `--system-prompt` (R4)

Any of these would be blocking architectural issues requiring re-plan.

## Phase 1 — Architecture

### Invocation shape

Each user message triggers a one-shot spawn of `claude` via `node:child_process` `spawn` (NOT `node-pty`; no TTY is needed and stream-json parsing is cleaner over plain stdout):

```bash
# Conceptual shape — exact flag names are Phase 0 deliverables (see R2, R4, R6).
claude -p \
  --bare \                          # R4: verify flag exists
  --output-format stream-json \
  --session-id <project-thread-uuid> \
  [--resume]                        # R3: include only after first successful response
  --allowedTools "Read,Grep,Glob" \ # R2: verify camelCase spelling
  --permission-mode dontAsk \
  --system-prompt "<full consultation system prompt>" \
  --model <opus|sonnet|full-id> \   # R6: verify accepted values
  --max-budget-usd 1.00 \           # R6: verify flag exists; drop if not
  --fallback-model sonnet \
  --add-dir <project-root> \
  "<user message>"
```

**Binary resolution (project convention):** the first arg is the absolute path returned by `getCachedClaudeBin()` from `src/main/terminal/resolveClaudeBin.ts`, NOT the literal string `'claude'`. If `getCachedClaudeBin()` returns `null`, return `err(CLAUDE_NOT_FOUND)` immediately without spawning. This mirrors the splice logic in `src/main/terminal/terminalManager.ts:50–57` and is required so Windows `.cmd` shims resolve correctly.

Notes on each flag:
- `-p` — one-shot, non-interactive
- `--bare` — clean environment, no CLAUDE.md auto-discovery, no hooks, no LSP (R4 — verify existence)
- `--output-format stream-json` — structured streaming output
- `--session-id` — fixed UUID per consultation thread, stored in `consultation.json`
- `--resume` — see Phase 0 R3 for correct usage
- `--allowedTools "Read,Grep,Glob"` — hard read-only enforcement (R2 — verify flag name + spelling)
- `--permission-mode dontAsk` — no permission prompts (read-only tools don't need them but defensive)
- `--system-prompt` — full override with co-architect role (static, version-tracked); directs the agent to use `.ai-arch/` as the knowledge base
- `--model` — from thread's locked model choice (R6 — verify value format)
- `--max-budget-usd 1.00` — per-request spend cap, runaway protection (R6 — verify flag exists; drop from invocation if not present in installed CLI)
- `--fallback-model sonnet` — graceful degradation on Opus overload
- `--add-dir <project-root>` — grants Read/Grep/Glob access to project files, including the authoritative `.ai-arch/` directory

### Role / system prompt

Static system prompt (versioned in code, not user-editable in v1):

```
You are a co-architect on an Atrium project, engaging with the primary developer
in dialogue about architectural decisions.

You are NOT an implementer. You cannot write code, modify files, or execute
anything with side effects. Your role is purely consultative: to help think
through design decisions.

Knowledge base — READ THIS FIRST for every non-trivial question:

The project's architectural knowledge base lives in the `.ai-arch/` directory at the
project root. This is the single source of truth for all architectural decisions.
Atrium's canvas is a rendered visualization of this directory; it is NOT authoritative
and you will not be shown a snapshot of it. Always consult `.ai-arch/` directly via
your Read / Grep / Glob tools before answering questions about the project.

`.ai-arch/` layout:
- `index.json` — the index of all idea nodes with id, type, maturity, name, and
  cross-references. Read this FIRST to orient yourself before diving into node bodies.
- `ideas/*.md` — one file per idea node. Contains the node's type (raw-idea,
  discussion, decided, etc.), maturity, body, rationale, tradeoffs, and links to
  related nodes. These node files are authoritative — their contents outrank any
  summary the user gives you verbally.
- `feature-briefs/*.md` — feature briefs derived from decided nodes, used by the
  implementation workflow. Read these when the user asks about feature scope or
  implementation direction.
- `todo-list.md` — prioritised implementation order across features.

Workflow for any architecture question:
1. Glob / Read `.ai-arch/index.json` to see what nodes exist and what's decided.
2. Read the specific `ideas/*.md` files relevant to the user's question.
3. Answer grounded in what the files actually say. If the user's framing conflicts
   with a decided node, surface the conflict rather than agreeing by default.
4. If a topic has no node yet, say so — don't invent decisions.

You CAN and SHOULD:
- Discuss architectural decisions and their tradeoffs (grounded in `.ai-arch/` nodes)
- Propose approaches and counter-approaches
- Analyze implications and edge cases
- Explain existing decisions by citing the specific node file they live in
- Push back on reasoning when it seems weak or contradicts a decided node
- Acknowledge uncertainty when the relevant node is missing, stale, or ambiguous
- Ask clarifying questions when the user's intent is ambiguous
- Use Read, Grep, or Glob against `.ai-arch/` (and wider source if needed) to
  verify every non-obvious claim before making it

Your style:
- Direct and concise — the developer values signal over politeness
- Willing to disagree — agreement for agreement's sake wastes time
- Structured when topic is complex (numbered points, explicit tradeoffs)
- Conversational when topic is simple
- Cite node filenames (e.g. `ideas/terminal-lifecycle.md`) when referencing decisions,
  so the user can jump straight to the source

You have access to read-only tools (Read, Grep, Glob) to inspect project files
when relevant. Do not attempt to write, edit, or execute — those tools are
restricted and unavailable.
```

No per-message canvas snapshot is appended. The agent reaches the authoritative state by reading `.ai-arch/` on demand via its Read/Grep/Glob tools — granted by `--add-dir <project-root>`. The canvas shown in Atrium's UI is a derived visualization; serializing it would give the agent a lossy view of data it can read first-hand, and would drift from the source whenever the parser changes.

### Schema: `userData/projects/<hash>/consultation.json`

```json
{
  "schemaVersion": 1,
  "activeThreadId": "main",
  "threads": {
    "main": {
      "sessionId": "<uuid>",
      "createdAt": 1736121600000,
      "lastActiveAt": 1736125200000,
      "model": "opus",
      "systemPromptVersion": 1,
      "messages": [
        {
          "id": "<uuid>",
          "role": "user",
          "content": "...",
          "ts": 1736121600000
        },
        {
          "id": "<uuid>",
          "role": "assistant",
          "content": "...",
          "ts": 1736121605000
        }
      ]
    }
  },
  "orphanedThreads": []
}
```

**Persistence rules:**
- File is created only on first successful assistant response (not on thread creation, not on empty panel open).
- Atomic writes use the existing `atomicWriteJson(filePath, value)` helper in `src/main/storage/atomicWrite.ts` — do NOT reimplement `tmp → rename` logic.
- Path resolution: add `getConsultationPath(hash: string)` to `src/main/storage/paths.ts` alongside `getLayoutPath` and `getMetaPath`. Under the hood: `path.join(getProjectDir(hash), 'consultation.json')`.
- Hash resolution: call `hashKeyOnly(projectAbsPath)` from `src/main/storage/projectHash.ts` — same helper layout uses.
- Read on project open; if absent (ENOENT), chat panel shows empty thread state (return `ok(null)` from `loadConsultation`).
- Corrupt JSON or invalid shape → quarantine to `consultation.json.corrupt-<isoUtcNow>` (ISO-8601 UTC with colons replaced by dashes — Windows-safe), start fresh. Mirror the helper and flow in `src/main/storage/layout.ts` `loadLayoutByHash` (lines ~126–186) including the best-effort quarantine that warns but does not overwrite if rename fails.
- `schemaVersion` mismatch (integer ≠ 1) → return `err(SCHEMA_MISMATCH)` and leave the file untouched. Do not quarantine — forward-compat preserves data for future migration.
- Any other filesystem error → return `err(IO_FAILED)` with the underlying `node:errno` message.

**Thread lifecycle:**
- "main" thread created implicitly on first message
- "New session" button moves current thread to `orphanedThreads[]`, creates new "main"
- `orphanedThreads` entries retain `sessionId`, metadata, but may strip `messages` array to save disk (messages still retrievable via Claude Code `claude resume <sessionId>` if ever needed)
- `orphanedThreads` surfaced in UI — deferred (v0.2 candidate). In v1, entries accumulate silently.

**No pin state in this file.** Pin state is app-level runtime singleton.

### Shared types location

**Two files — types and error codes split to match project conventions.**

**File 1 — `src/shared/consultation.ts`** (types only, no error codes):

```ts
/**
 * Consultation chat types — shared between main, preload, and renderer.
 * No Electron, Node, or React imports — safe for @shared.
 */

export type ConsultationRole = 'user' | 'assistant' | 'system';

export interface ConsultationMessage {
  id: string;
  role: ConsultationRole;
  content: string;
  ts: number;
}

export interface ConsultationThread {
  sessionId: string;
  createdAt: number;
  lastActiveAt: number;
  model: 'opus' | 'sonnet';           // R6 — align with actual CLI value format
  systemPromptVersion: number;
  messages: ConsultationMessage[];
}

export interface ConsultationFile {
  schemaVersion: 1;
  activeThreadId: string;
  threads: Record<string, ConsultationThread>;
  orphanedThreads: Array<Omit<ConsultationThread, 'messages'>>;
}
```

**File 2 — append to `src/shared/errors.ts`** (error codes use the project-wide `as const` + derived-union + `...CommonErrorCode` pattern; consumers import the type from `@shared/errors` or via the `@shared` barrel):

```ts
// ---------------------------------------------------------------------------
// Consultation
// ---------------------------------------------------------------------------

export const ConsultationErrorCode = {
  ...CommonErrorCode,
  CLAUDE_NOT_FOUND: 'CLAUDE_NOT_FOUND',       // binary missing on PATH (mirrors HealthErrorCode — same literal OK)
  NOT_AUTHENTICATED: 'NOT_AUTHENTICATED',     // user not logged into Claude Code
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',           // subscription limit hit
  NETWORK_ERROR: 'NETWORK_ERROR',             // transport failure
  INVALID_OUTPUT: 'INVALID_OUTPUT',           // stream-json parse failure
  BUDGET_EXCEEDED: 'BUDGET_EXCEEDED',         // --max-budget-usd hit (drop if R6 shows flag missing)
  SESSION_LOST: 'SESSION_LOST',               // session-id not recognised by Claude Code
  IO_FAILED: 'IO_FAILED',                     // consultation.json read/write failed
  CORRUPT: 'CORRUPT',                         // consultation.json quarantined (mirrors LayoutErrorCode)
  SCHEMA_MISMATCH: 'SCHEMA_MISMATCH',         // consultation.json schemaVersion ≠ 1 (mirrors LayoutErrorCode)
  CANCELLED: 'CANCELLED',                     // user cancelled in-flight stream
} as const;

export type ConsultationErrorCode =
  (typeof ConsultationErrorCode)[keyof typeof ConsultationErrorCode];
```

**File 3 — barrel export in `src/shared/index.ts`**: append `export * from './consultation.js';`. `ConsultationErrorCode` is already re-exported transitively via `errors.js`.

### IPC channels

**Channel names are added to the `IPC` const in `src/shared/ipc.ts`** (single source of truth — all handlers and the preload must reference `IPC.consultation.*`, never bare strings):

```ts
// Append to IPC const in src/shared/ipc.ts:
consultation: {
  sendMessage:   'consultation:sendMessage',
  loadThread:    'consultation:loadThread',
  newSession:    'consultation:newSession',
  cancel:        'consultation:cancel',
  streamChunk:   'consultation:stream:chunk',
  streamComplete:'consultation:stream:complete',
  streamError:   'consultation:stream:error',
},
```

**Invoke channels (renderer → main, return `Result`):**

```ts
IPC.consultation.sendMessage
  (projectHash: string, message: string)
    → Promise<Result<{ messageId: string }, ConsultationErrorCode>>
  // Starts the send flow; streams results via push channels below.

IPC.consultation.loadThread
  (projectHash: string)
    → Promise<Result<ConsultationFile | null, ConsultationErrorCode>>
  // ok(null) = no consultation file yet (empty state). Renderer initialises empty.

IPC.consultation.newSession
  (projectHash: string, model: 'opus' | 'sonnet')
    → Promise<Result<{ sessionId: string }, ConsultationErrorCode>>
  // Rotates current thread to orphanedThreads, creates fresh main.

IPC.consultation.cancel
  (projectHash: string, messageId: string)
    → Promise<Result<void, ConsultationErrorCode>>
  // Cancels in-flight stream (user clicks stop button). Returns err(CANCELLED) via streamError for that messageId.
```

**Push channels (main → renderer via `webContents.send`):**

```ts
IPC.consultation.streamChunk
  payload: { projectHash: string; messageId: string; delta: string }

IPC.consultation.streamComplete
  payload: { projectHash: string; messageId: string; fullContent: string }

IPC.consultation.streamError
  payload: { projectHash: string; messageId: string; code: ConsultationErrorCode; raw?: string }
```

Preload exposes these as `onStreamChunk(messageId, cb)` / `onStreamComplete(...)` / `onStreamError(...)` returning unsubscribe closures — matches the `terminal.onData` / `fileSync.onChanged` pattern. Each listener filters on incoming `messageId` so a single renderer subscription per message stays scoped.

**Streaming flow:**
1. Renderer calls `sendMessage`, receives `messageId`
2. Renderer subscribes to `consultation:stream:chunk` for that messageId
3. Main spawns `claude`, reads stdout, emits chunks as stream-json events arrive
4. On `message_stop` (or equivalent) → emits `consultation:stream:complete`
5. On error → emits `consultation:stream:error`
6. Main appends user message + assistant response to `consultation.json` only on successful complete

**Cancel flow:**
- `IPC.consultation.cancel` kills the spawned `claude` process.
  - **Windows:** `child.kill()` directly (SIGTERM is not supported on Windows; `node-pty` makes the same choice at `terminalManager.ts:109`).
  - **Non-Windows:** `child.kill('SIGTERM')`, then a 2s timer fallback that calls `child.kill('SIGKILL')` if the process has not exited. Introduce a named constant (e.g. `CONSULTATION_KILL_FALLBACK_MS = 2000`) in `src/main/consultation/constants.ts` — 2s is intentionally shorter than the terminal's `KILL_FALLBACK_MS` (5s, see `src/main/terminal/constants.ts`) so user-triggered cancels feel responsive.
- Partial response is discarded (not appended to consultation.json — nothing to commit)
- UI shows cancelled state for that message; main emits `IPC.consultation.streamError` with `code: CANCELLED` so renderer cleanup is uniform

### MainShell integration (panel mount point)

The existing shell layout at `src/renderer/src/shell/MainShell.tsx` is:

```
<div flex-column h=100vh>
  <Toolbar />
  <div flex row flex=1>
    <Canvas flex=1 />
    <aside data-region="side-panel" width=240 /> ← existing ProjectPanel/SelectionPanel
    <Tooltip />
  </div>
  <TerminalModal />
</div>
```

The consultation panel is a **separate right-edge sibling** added AFTER the existing `<aside>` (so it sits at the far right), in one of two layout modes chosen at `<MainShell>` composition time:

- **Mode A (push layout — default per brief):** when open, the new `<ConsultationPanel>` is a `flex: '0 0 400px'` sibling that shrinks the `<Canvas>` (which today is `flex: 1`). The existing 240px `<aside>` is unaffected — it keeps its width; only the canvas is compressed. When closed, the panel collapses to a 28px `<EdgeTab>` sibling still flex: '0 0 28px' so the edge tab is always a layout-claiming strip, not an overlay.
- **Mode B (overlay alternative — noted, not preferred):** absolutely positioned over the canvas. Not chosen — brief specifies push layout.

Consequence for existing components: no layout changes to `<aside data-region="side-panel">`, `<Toolbar>`, or `<TerminalModal>`. `<Canvas>`'s `flex: 1 1 auto` already handles dynamic width — React Flow re-fits on resize via its own observer.

Z-order: `<TerminalModal>` stays on top when open. Consultation panel sits below the terminal modal so an active terminal session visually "blocks" consultation input — matches existing UX that treats the terminal as the primary modal layer.

### UI behavior

**Panel geometry:**
- Right-side panel, 400px wide, added as new flex sibling in `MainShell.tsx` (see §MainShell integration)
- Push layout — canvas shrinks to accommodate; the existing 240px `<aside>` side panel is not resized
- When closed, edge tab ("Chat" label, vertical orientation) visible on right edge, ~28px wide
- Click edge tab → panel slides in (~200ms ease-out)
- Click pin button or outside panel → various close/pin behaviors (below)

**States:**

```
ClosedState
  - edge tab visible, panel offscreen
  - entered from: manual close, auto-close timer expiry

OpenState (unpinned)
  - panel visible, canvas/terminal resized
  - 10s auto-close timer: starts on first outside-click after open
  - timer cancels on any inside-panel interaction (click, type, scroll)
  - subsequent outside-clicks do NOT restart timer
  - timer expiry → slides to ClosedState

OpenState (pinned)
  - panel visible, auto-close disabled
  - only manual close (click edge tab from open state, or X button) returns to ClosedState

PreviewState (on project open)
  - panel opens automatically, showing existing thread or empty state
  - behaves exactly like OpenState (unpinned) — 10s auto-close timer fires on first outside-click
  - intent: show user that feature exists, fade away if not engaged
```

**Pin button:**
- Location: top-right of panel header
- Icon: pin outline (unpinned) / pin filled in accent color `#5b8fd4` (pinned)
- Toggles app-level runtime `pinState: boolean` singleton
- Pin state persists across project switches within session
- Pin state resets to `false` on app restart (no persistence in v1)
- Tooltip: "Pin chat panel" / "Unpin chat panel"

**Model selector (within panel header):**

Two modes based on thread state:

```
EmptyThreadMode (no messages yet in current thread)
  - Header shows: [Chat title] [Model selector: Opus | Sonnet] [Pin button]
  - Model selector editable, defaults to Opus
  - User selects model, types first message, sends
  - On first successful response: model locks, transitions to ActiveThreadMode

ActiveThreadMode (≥1 message in thread)
  - Header shows: [Chat title] [Current model name readonly] [New session button] [Pin button]
  - No model selector — model is locked for this thread's lifetime
  - "New session" button click → opens model selection dropdown
  - User picks model → history clears in UI, new thread created, old thread moves to orphanedThreads, model selector returns (empty thread mode)
```

**Chat content area:**
- Vertical scrollable list of message bubbles
- User messages: right-aligned, slightly darker background (`#1a1a1f`)
- Assistant messages: left-aligned, transparent background, full-width
- Streaming assistant message: visible cursor or typing indicator at end while tokens arrive
- Empty state: centered placeholder text — "Start a conversation about this project" + model selector prominent
- Error messages: inline in message stream with error icon, error message, action button (Retry / Sign in / etc depending on code)

**Input area (bottom of panel):**
- Multiline textarea
- Enter submits, Shift+Enter inserts newline
- Submit button (or auto-submit on Enter)
- While request in flight: submit button becomes Cancel button
- Character counter (soft limit warning near context window limits — not hard enforced in v1)

**Error handling UX:**

| Error code | User message | Action button |
|---|---|---|
| `CLAUDE_NOT_FOUND` | "Claude Code is not installed." | [Install Claude Code] (opens install docs) |
| `NOT_AUTHENTICATED` | "Not signed into Claude Code." | [Sign in] (opens `claude auth` help) |
| `QUOTA_EXCEEDED` | "Subscription quota reached for this period." | [Retry] |
| `NETWORK_ERROR` | "Network error." | [Retry] |
| `INVALID_OUTPUT` | "Unexpected response from Claude Code." | [Retry] |
| `BUDGET_EXCEEDED` | "Request exceeded per-message budget cap." | [Retry] |
| `SESSION_LOST` | "Session context lost. Starting fresh." | [Start new session] (auto-triggers New Session) |
| `IO_FAILED` | "Could not save conversation." | [Retry] |
| `CORRUPT` | "Conversation file was corrupted and has been quarantined." | [Start new session] |
| `SCHEMA_MISMATCH` | "Conversation file is from an incompatible app version." | (no action — file left intact) |
| `CANCELLED` | (no error bubble — renderer just finalises the cancelled state visually) | — |
| `INTERNAL` / `NOT_IMPLEMENTED` | "Something went wrong." + raw text if available | [Retry] |

*Note: `UNKNOWN` from the original draft was dropped — project convention uses `INTERNAL` (from `CommonErrorCode`) for catch-all errors. See `src/shared/errors.ts`.*

Error messages appear inline as failed assistant-role message bubbles with red-tinted border, not as toasts or modals.

### Knowledge base: `.ai-arch/` directory

**Source of truth: the `.ai-arch/` directory on disk — NOT the in-memory `ProjectState` and NOT the rendered canvas.** Atrium's parser reads `.ai-arch/` and produces a `ProjectState` for the UI, but that state is a derived, lossy view (stripped of rationale prose, cross-references, and anything the parser doesn't model). The co-architect agent reads the original files directly and therefore sees everything the human author wrote.

**How the main process enables this:**
1. On `IPC.consultation.sendMessage(projectHash, …)`, resolve the project's absolute path from `projectHash`. The existing `@main/storage/paths` helpers already expose this via the project registry.
2. Pass `--add-dir <projectAbsolutePath>` so Read/Grep/Glob tools can see the project (which includes `.ai-arch/`).
3. Do NOT serialize `ProjectState` into `--append-system-prompt`. The flag is not used in v1.
4. The system prompt (see §Role / system prompt) tells the agent where `.ai-arch/` lives and how it's laid out. That — plus read tools — is the complete context-passing mechanism.

**Why this beats a serialized snapshot:**
- The agent sees full node bodies (rationale, tradeoffs, alternatives), not just names and maturities.
- No serialization code to maintain, test, or keep in sync with parser changes.
- No tokens spent on context the user's question doesn't actually need — the agent Reads only what's relevant.
- Stays correct when the parser misses or misinterprets something — the agent is reading the file, not the parse result.

**Consequence:** the main-process consultation service does NOT depend on `WatcherManager` or the renderer's cached `ProjectState`. It only needs the project's absolute path to invoke `claude -p` with `--add-dir`. This simplifies the service and removes a source-of-truth ambiguity.

**Empty / missing `.ai-arch/`:** if the project has no `.ai-arch/` directory yet (unlikely — the launcher requires one — but defensive), the agent's Glob will just find nothing and it will say so. No special handling needed on the main-process side.

### Main-process module structure

New files:

```
src/main/consultation/
├── index.ts                  # barrel: re-exports service + registerConsultationHandlers
├── consultationService.ts    # IPC handlers + orchestration (class like TerminalManager)
├── claudeInvoker.ts          # child_process.spawn, stream-json parser, event emitter
├── consultationStorage.ts    # load/save consultation.json via @main/storage helpers
├── errorMapper.ts            # map spawn errors + stream events → ConsultationErrorCode
├── constants.ts              # CONSULTATION_KILL_FALLBACK_MS, stream-json event names, etc
└── __tests__/                # vitest — adjacent to the module, project-wide convention
    ├── consultationStorage.test.ts
    ├── errorMapper.test.ts
    └── claudeInvoker.test.ts # stream-json parse with fixture stdout
```

**IPC wiring (critical):** add `registerConsultationHandlers(service, ipcMainLike)` and call it from `src/main/ipc/register.ts` alongside `registerLayoutHandlers` / `registerSkillHandlers`. The service is constructed once in `src/main/index.ts` and passed in — same lifecycle as `TerminalManager` / `WatcherManager`. Pass a `getWindow: () => BrowserWindow | null` accessor so `webContents.send` can reach the current window without holding a stale reference (matches `registerIpc` in `register.ts:37–53`).

**Preload additions (critical):**

1. Append a `consultation` namespace to `AtriumAPI` in `src/preload/api.ts`:
   ```ts
   consultation: {
     loadThread(projectHash: string): Promise<Result<ConsultationFile | null, ConsultationErrorCode>>;
     sendMessage(projectHash: string, message: string): Promise<Result<{ messageId: string }, ConsultationErrorCode>>;
     newSession(projectHash: string, model: 'opus' | 'sonnet'): Promise<Result<{ sessionId: string }, ConsultationErrorCode>>;
     cancel(projectHash: string, messageId: string): Promise<Result<void, ConsultationErrorCode>>;
     onStreamChunk(messageId: string, cb: (delta: string) => void): () => void;
     onStreamComplete(messageId: string, cb: (fullContent: string) => void): () => void;
     onStreamError(messageId: string, cb: (err: { code: ConsultationErrorCode; raw?: string }) => void): () => void;
   };
   ```
2. Implement the namespace in `src/preload/index.ts` using `ipcRenderer.invoke` for the four invoke channels and the `makeListener<T>` helper + `ipcRenderer.on` / `removeListener` pattern for the three subscriptions (see `terminal.onData` at `preload/index.ts:104–114` for the exact shape).

New renderer files:

```
src/renderer/src/consultation/
├── ConsultationPanel.tsx     # main panel component
├── MessageList.tsx           # scrollable message history
├── MessageBubble.tsx         # individual message rendering
├── ChatInput.tsx             # textarea + submit/cancel
├── ModelSelector.tsx         # empty vs active mode handling
├── NewSessionButton.tsx      # model pick + session rotation
├── EdgeTab.tsx               # closed state edge handle
├── hooks/
│   ├── useConsultation.ts    # subscribe to IPC events, manage thread state
│   ├── usePanelState.ts      # open/closed/pinned state machine
│   └── useAutoCloseTimer.ts  # 10s blur timer logic
└── __tests__/                # vitest — project convention, adjacent to source
    ├── usePanelState.test.ts
    ├── useAutoCloseTimer.test.ts
    ├── ModelSelector.test.tsx
    └── ConsultationPanel.test.tsx
```

Store integration: add a `consultation` slice to `src/renderer/src/store/atriumStore.ts` (current slices: project / UI / toolbar overlay / terminal / pendingInit / canvas / health / relayout). Keep it to domain state the panel needs — panel open/closed/pinned, active thread messages in flight, streaming cursor target. Mirror the existing slice pattern.

### Tests

Shared schema: unit tests for `ConsultationFile` validation, schema version handling.

Main process:
- `errorMapper.ts` — given spawn error / stream chunks, produces expected error code
- `consultationStorage.ts` — atomic write, corrupt file quarantine, missing file handling
- `claudeInvoker.ts` — project absolute path is resolved and passed as `--add-dir`; stream-json parsing against fixture stdout

Renderer:
- `usePanelState` state machine — all transitions (closed → open → pinned → ...)
- `useAutoCloseTimer` — timer behavior on blur, interaction cancellation, subsequent outside clicks don't restart
- Model selector mode switching based on thread state

Integration (deferred — not blocking v1, but nice-to-have):
- Real `claude -p` invocation in CI with mock subscription would require infrastructure. Skip for v1. Rely on manual testing + Phase 0 R1-R6 verification.

## Out of scope for v1

- App settings UI (pin state persistence waits for settings UI to exist)
- Multiple named threads / thread switcher (orphaned threads accumulate silently)
- Thread search
- Message editing or deletion
- Attachments (file drag-drop into chat)
- Canvas node highlighting from chat mentions
- Agent-suggested canvas mutations
- Per-message model override
- Inference round-trip health check (existing `claude --version` check is sufficient)
- Summarization of long threads (rely on Claude Code's own context management)
- Export conversation to markdown / other formats
- Consultation panel hotkey (e.g. Ctrl+Shift+C) — mouse-only in v1
- Tooltips / descriptions of what co-architect mode means (user learns by using)
- Cost tracking UI (`--max-budget-usd` enforces cap, but we don't show running cost)

## Verification checklist (before PR merge)

1. Phase 0 R1-R6 all answered and documented in PR description
2. Open Atrium with a real `.ai-arch/` project. Consultation panel opens automatically, shows empty state, model selector defaults to Opus, auto-closes after 10s if no interaction.
3. Send a question. Response streams in. Model selector transitions to "New session" button.
4. Close Atrium, reopen same project. Chat history reappears correctly. New message continues the thread (via `--session-id --resume`).
5. Click "New session", pick Sonnet. Previous thread visually clears, new empty thread with Sonnet selected.
6. Pin panel. Switch projects. Panel stays open in new project. Restart Atrium. Panel opens unpinned.
7. Simulate each error case from the UX table above. Each shows correct error message and action button. Retry works.
8. Request something that would require file editing ("please edit src/foo.ts"). Agent refuses due to tool restriction — does NOT attempt tool call.
9. Request something that requires reading `.ai-arch/` ("what decisions have we locked in about the terminal?" or "list the decided idea nodes"). Agent Reads `.ai-arch/index.json` and the relevant `ideas/*.md` files successfully, cites node filenames in its answer, and grounds the answer in the file contents — not in guesses.
10. Cancel a mid-stream response. Request terminates cleanly, partial content not saved.
11. Run full test suite — new tests pass, no existing tests regressed.

## Notes

- `systemPromptVersion` field in the schema is forward-looking. If we change the consultation system prompt substantively in a future version, messages threaded under old prompts can be flagged in UI ("this thread used an older co-architect prompt"). Not used in v1 — always write `1`.
- `orphanedThreads[]` array exists in schema from v1 but is not user-accessible in UI until v0.2. No migration needed when access UI lands — schema already supports it.
- The `--fallback-model sonnet` flag means Opus overload silently serves Sonnet response. User not informed in v1. If this causes confusion (users expect Opus quality and get Sonnet), surface in UI later. Acceptable silent degradation for v1.
- Knowledge base reads are agent-driven (Read/Grep/Glob against `.ai-arch/`) rather than pre-serialized. Tradeoff: the agent spends tool-call round-trips to pull context instead of consuming a fat prompt up front. For very large architectures this is cheaper and more accurate; for tiny ones it adds one or two extra round-trips. Acceptable.
