import { create } from 'zustand';
import { err, ok } from '@shared/result';
import type { ProjectState, TerminalId } from '@shared/domain';
import type { Result } from '@shared/result';
import type { ProjectErrorCode } from '@shared/errors';
import { canvasEmpty, canvasError, canvasLoading, canvasReady, type CanvasState } from './canvasState';

// ---------------------------------------------------------------------------
// Pending init slice — tracks an in-flight init spawn for gate/panel sourcing
// ---------------------------------------------------------------------------

export type PendingInit = {
  source: 'gate' | 'panel';
  cwd: string;
  terminalId: TerminalId;
};

// ---------------------------------------------------------------------------
// Terminal slice
// ---------------------------------------------------------------------------

export type TerminalStatus = 'idle' | 'spawning' | 'active' | 'exited' | 'closing';

export type TerminalSlice = {
  id: TerminalId | null;
  status: TerminalStatus;
  fullscreen: boolean;
};

function defaultTerminalSlice(): TerminalSlice {
  return { id: null, status: 'idle', fullscreen: false };
}

// Legal terminal transitions — source → allowed targets
const LEGAL_TERMINAL_TRANSITIONS: Record<TerminalStatus, readonly TerminalStatus[]> = {
  idle: ['spawning'],
  spawning: ['active', 'exited'],
  active: ['exited'],
  exited: ['closing'],
  closing: ['idle'],
};

// ---------------------------------------------------------------------------
// Toolbar overlay slice
// ---------------------------------------------------------------------------

export type ToolbarOverlay = 'status' | 'finalize' | null;

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

type SwitchProjectErrorCode = 'BLOCKED_BY_TERMINAL' | ProjectErrorCode;

export type AtriumStore = {
  // --- Project slice ---
  project: ProjectState | null;

  // --- UI slice ---
  selectedNodes: Set<string>;
  tooltipTarget: string | null;
  activePanel: 'project' | 'selection';

  // --- Toolbar overlay ---
  toolbarOverlay: ToolbarOverlay;

  // --- Terminal slice ---
  terminal: TerminalSlice;

  // --- Pending init ---
  pendingInit: PendingInit | null;

  // --- Canvas state ---
  canvas: CanvasState;

  // --- Actions ---
  setProject: (state: ProjectState) => void;
  clearProject: () => void;
  setCanvasError: (message: string) => void;
  setCanvasLoading: () => void;

  switchProject: (path: string) => Promise<Result<void, SwitchProjectErrorCode>>;

  setToolbarOverlay: (overlay: ToolbarOverlay) => void;

  selectNode: (slug: string) => void;
  deselectNode: (slug: string) => void;
  clearSelection: () => void;

  setTooltipTarget: (slug: string | null) => void;
  toggleSelectedNode: (slug: string) => void;

  setTerminal: (next: Partial<TerminalSlice> & { status: TerminalStatus }) => Result<void, string>;
  setFullscreen: (value: boolean) => void;

  setPendingInit: (pending: PendingInit) => void;
  clearPendingInit: () => void;

  /** Placeholder — Phase 6 implements real logic. */
  startAutoOpen: () => void;

  /** Internal — drives the exited→closing→idle sequence synchronously before IPC. */
  _autoDismissExited: () => void;
};

// ---------------------------------------------------------------------------
// Store factory
// ---------------------------------------------------------------------------

export const useAtriumStore = create<AtriumStore>((set, get) => ({
  // Initial state
  project: null,
  selectedNodes: new Set<string>(),
  tooltipTarget: null,
  activePanel: 'project',
  toolbarOverlay: null,
  terminal: defaultTerminalSlice(),
  pendingInit: null,
  canvas: canvasEmpty(),

  // --- Project actions ---

  setProject(state) {
    set({ project: state, canvas: canvasReady() });
  },

  clearProject() {
    set({
      project: null,
      selectedNodes: new Set<string>(),
      tooltipTarget: null,
      activePanel: 'project',
      toolbarOverlay: null,
      canvas: canvasEmpty(),
    });
  },

  setCanvasError(message) {
    set({ canvas: canvasError(message) });
  },

  setCanvasLoading() {
    set({ canvas: canvasLoading() });
  },

  setToolbarOverlay(overlay) {
    set({ toolbarOverlay: overlay });
  },

  // --- switchProject ---

  async switchProject(path) {
    const t = get().terminal;
    const canSwitch = t.status === 'idle' || t.status === 'exited';

    if (!canSwitch) {
      return err('BLOCKED_BY_TERMINAL', `Cannot switch while terminal is ${t.status}`);
    }

    if (t.status === 'exited') {
      get()._autoDismissExited();
    }

    const r = await window.atrium.project.switch(path);

    if (r.ok) {
      set(() => ({
        project: r.data,
        selectedNodes: new Set<string>(),
        tooltipTarget: null,
        activePanel: 'project',
        terminal: defaultTerminalSlice(),
        canvas: canvasReady(),
      }));
    } else {
      set({ canvas: canvasError(r.error.message) });
    }

    return r.ok ? ok(undefined) : r;
  },

  // --- Selection actions ---

  selectNode(slug) {
    const next = new Set(get().selectedNodes);
    next.add(slug);
    set({ selectedNodes: next });
  },

  deselectNode(slug) {
    const next = new Set(get().selectedNodes);
    next.delete(slug);
    set({ selectedNodes: next });
  },

  clearSelection() {
    set({ selectedNodes: new Set<string>(), activePanel: 'project' });
  },

  setTooltipTarget(slug) {
    set((state) => ({ tooltipTarget: state.tooltipTarget === slug ? null : slug }));
  },

  toggleSelectedNode(slug) {
    set((state) => {
      const next = new Set(state.selectedNodes);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
      }
      return {
        selectedNodes: next,
        activePanel: next.size > 0 ? 'selection' : 'project',
      };
    });
  },

  // --- Terminal state machine ---

  setTerminal(next) {
    const current = get().terminal.status;
    const allowed = LEGAL_TERMINAL_TRANSITIONS[current];
    if (!allowed || !allowed.includes(next.status)) {
      return err('ILLEGAL_TRANSITION', `Illegal terminal transition: ${current} → ${next.status}`);
    }
    set({ terminal: { ...get().terminal, ...next } });
    return { ok: true, data: undefined };
  },

  setFullscreen(value) {
    set((state) => ({ terminal: { ...state.terminal, fullscreen: value } }));
  },

  // --- Pending init actions ---

  setPendingInit(pending) {
    set({ pendingInit: pending });
  },

  clearPendingInit() {
    set({ pendingInit: null });
  },

  // --- Auto-open placeholder ---

  startAutoOpen() {
    // Phase 6 implements the full auto-open chain.
  },

  // --- Internal helpers ---

  _autoDismissExited() {
    set({ terminal: { ...get().terminal, status: 'closing' } });
    set({ terminal: defaultTerminalSlice() });
  },
}));
