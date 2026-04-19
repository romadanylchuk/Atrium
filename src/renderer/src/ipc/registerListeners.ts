import { useAtriumStore } from '../store/atriumStore';

export function registerRendererListeners(store = useAtriumStore): () => void {
  const disposers: Array<() => void> = [];

  disposers.push(window.atrium.fileSync.onChanged(state => store.getState().setProject(state)));

  // Stage 04 ships only the fileSync listener. Terminal subscriptions are per-TerminalId
  // and installed from the store's terminal-spawn success path, which arrives in Stage 05.
  // No-op terminal rewire here — the harness exists but does nothing until then.

  return () => disposers.splice(0).forEach(d => d());
}
