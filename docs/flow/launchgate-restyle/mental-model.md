# Mental Model

`LaunchGate` is a **read-only consumer** of three Zustand slices: `setProject`, `switchProject`, and now `healthStatus` / `healthInfo`. It owns three pieces of local state that do not belong in the global store: `recents` (fetched once on mount via IPC), `body` (the local view state — `'main'` or `'new-project'`), and `switchError` (the inline error text from a failed `switchProject` call). The visual shell is a single centred column on the page background; sections inside the column (`RECENT`, `OPEN`) are visually identical to the sidebar's sections in `ProjectPanel.tsx` so the two surfaces speak one design language.

Health rendering follows a strict three-state mapping driven by the slice (the same one `ProjectPanel.tsx:98-105` and `Toolbar.tsx:13-17` use):
- `'healthy'` + `healthInfo` → `claude v${healthInfo.version} · healthy`
- `'healthy'` + `null` → `claude · healthy` (defensive edge case)
- `'unreachable'` → `claude · unreachable` (and the explainer paragraph appears above the Open button)
- `'checking'` → `claude · checking` (no explainer)

Critical invariant: the **Open project… button is always enabled, regardless of `healthStatus`** (Out of Scope §7 / brief Q8). The explainer is a UI hint only. A reviewer looking at the new gate must not "fix" this by adding a `disabled={healthStatus === 'unreachable'}` — that is a behaviour change, not a restyle.
