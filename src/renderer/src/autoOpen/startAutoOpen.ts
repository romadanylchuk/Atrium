import { useAtriumStore } from '../store/atriumStore';
import { canvasEmpty } from '../store/canvasState';

let invoked = false;

export function resetAutoOpenForTests(): void {
  invoked = false;
}

export async function startAutoOpen(): Promise<void> {
  if (invoked) return;
  invoked = true;

  const store = useAtriumStore.getState();
  store.setCanvasLoading();

  const recents = await window.atrium.project.getRecents();
  if (!recents.ok) {
    store.setCanvasError(recents.error.message);
    return;
  }

  if (recents.data.length === 0) {
    useAtriumStore.setState({ canvas: canvasEmpty() });
    return;
  }

  for (const entry of recents.data) {
    const t0 = performance.now();
    const r = await window.atrium.project.open(entry.path);
    const elapsed = performance.now() - t0;
    console.debug('[atrium:project-open]', entry.path, elapsed, r.ok ? 'ok' : r.error.code);
    if (r.ok) {
      store.setProject(r.data);
      return;
    }
    // continue — do not warn; main-side pruning already fired if relevant
  }

  store.setCanvasError('Could not open any recent project.');
}
