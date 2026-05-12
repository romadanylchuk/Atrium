import { create } from 'zustand';
import { err, ok } from '@shared/result';
import type {
  ProjectState,
  TerminalId,
  HealthInfo,
  PluginInfo,
  InstallOutcome,
} from '@shared/index';
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
// Consultation slice
// ---------------------------------------------------------------------------

export type ConsultationPanelState =
  | { kind: 'closed' }
  | { kind: 'open-unpinned' }
  | { kind: 'open-pinned' }
  | { kind: 'preview' };

export interface ConsultationSlice {
  panel: ConsultationPanelState;
  /** Mirrors `open-pinned`; survives closed→open transitions and project switches per Decision §10. */
  pinState: boolean;
}

function defaultConsultationSlice(): ConsultationSlice {
  return {
    panel: { kind: 'closed' },
    pinState: false,
  };
}

// ---------------------------------------------------------------------------
// Consultation terminal slice
// ---------------------------------------------------------------------------

export type ConsultationTerminalStatus = 'idle' | 'spawning' | 'active' | 'exited';

export type ConsultationTerminalSlice = {
  id: TerminalId | null;
  status: ConsultationTerminalStatus;
};

function defaultConsultationTerminalSlice(): ConsultationTerminalSlice {
  return { id: null, status: 'idle' };
}

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

  // --- Health slice ---
  claudeStatus: 'checking' | 'healthy' | 'unreachable';
  claudeInfo: HealthInfo | null;
  pluginStatus: 'checking' | 'present' | 'missing' | 'list-unavailable' | 'unknown';
  pluginInfo: PluginInfo | null;
  installState:
    | { kind: 'idle' }
    | { kind: 'installing' }
    | { kind: 'failed'; failure: Extract<InstallOutcome, { kind: 'failed' }> };
  _recheckHealth: (() => void) | null;

  // --- Relayout slice ---
  relayoutRequestId: number;

  // --- Consultation slice ---
  consultation: ConsultationSlice;

  // --- Consultation terminal slice ---
  consultationTerminal: ConsultationTerminalSlice;

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

  /** Internal — written only by useHealthPoll. */
  _setClaude: (next: { status: 'checking' | 'healthy' | 'unreachable'; info: HealthInfo | null }) => void;
  _setPlugin: (next: { status: 'checking' | 'present' | 'missing' | 'list-unavailable' | 'unknown'; info: PluginInfo | null }) => void;
  _startInstall: () => void;
  _failInstall: (failure: Extract<InstallOutcome, { kind: 'failed' }>) => void;
  _resetInstall: () => void;
  _setRecheckHealth: (fn: (() => void) | null) => void;

  triggerRelayout: () => void;

  // --- Consultation panel actions ---
  openConsultationPanel: () => void;
  closeConsultationPanel: () => void;
  toggleConsultationPin: () => void;
  enterConsultationPreview: () => void;

  // --- Consultation terminal actions ---
  setConsultationTerminalSpawning: () => void;
  setConsultationTerminalActive: (id: TerminalId) => void;
  setConsultationTerminalExited: () => void;
  clearConsultationTerminal: () => void;
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
  claudeStatus: 'checking',
  claudeInfo: null,
  pluginStatus: 'checking',
  pluginInfo: null,
  installState: { kind: 'idle' } as const,
  _recheckHealth: null,
  relayoutRequestId: 0,
  consultation: defaultConsultationSlice(),
  consultationTerminal: defaultConsultationTerminalSlice(),

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

    get().clearConsultationTerminal();

    const r = await window.atrium.project.switch(path);

    if (r.ok) {
      set(() => ({
        selectedNodes: new Set<string>(),
        tooltipTarget: null,
        activePanel: 'project',
        terminal: defaultTerminalSlice(),
      }));
      // setProject handles project + canvas.
      get().setProject(r.data);
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

  startAutoOpen() {},

  // --- Internal helpers ---

  _autoDismissExited() {
    const currentId = get().terminal.id;
    set({ terminal: { ...get().terminal, status: 'closing' } });
    if (currentId !== null) {
      void window.atrium.terminal.close(currentId);
    }
    set({ terminal: defaultTerminalSlice() });
  },

  _setClaude({ status, info }) {
    set({ claudeStatus: status, claudeInfo: info });
  },

  _setPlugin({ status, info }) {
    set({ pluginStatus: status, pluginInfo: info });
  },

  _startInstall() {
    set({ installState: { kind: 'installing' } });
  },

  _failInstall(failure) {
    set({ installState: { kind: 'failed', failure } });
  },

  _resetInstall() {
    set({ installState: { kind: 'idle' } });
  },

  _setRecheckHealth(fn) {
    set({ _recheckHealth: fn });
  },

  triggerRelayout() {
    set((s) => ({ relayoutRequestId: s.relayoutRequestId + 1 }));
  },

  // -------------------------------------------------------------------------
  // Consultation panel actions
  // -------------------------------------------------------------------------

  openConsultationPanel() {
    set((s) => {
      const next: ConsultationPanelState = s.consultation.pinState
        ? { kind: 'open-pinned' }
        : { kind: 'open-unpinned' };
      return { consultation: { ...s.consultation, panel: next } };
    });
  },

  closeConsultationPanel() {
    set((s) => ({ consultation: { ...s.consultation, panel: { kind: 'closed' } } }));
  },

  toggleConsultationPin() {
    set((s) => {
      const nextPin = !s.consultation.pinState;
      const panel = s.consultation.panel;
      let nextPanel: ConsultationPanelState = panel;
      if (nextPin) {
        if (panel.kind === 'open-unpinned' || panel.kind === 'preview') {
          nextPanel = { kind: 'open-pinned' };
        }
      } else if (panel.kind === 'open-pinned') {
        nextPanel = { kind: 'open-unpinned' };
      }
      return { consultation: { ...s.consultation, pinState: nextPin, panel: nextPanel } };
    });
  },

  enterConsultationPreview() {
    set((s) => ({ consultation: { ...s.consultation, panel: { kind: 'preview' } } }));
  },

  // -------------------------------------------------------------------------
  // Consultation terminal actions
  // -------------------------------------------------------------------------

  setConsultationTerminalSpawning() {
    set((s) => ({ consultationTerminal: { ...s.consultationTerminal, status: 'spawning' } }));
  },

  setConsultationTerminalActive(id) {
    set({ consultationTerminal: { id, status: 'active' } });
  },

  setConsultationTerminalExited() {
    set((s) => ({ consultationTerminal: { ...s.consultationTerminal, status: 'exited' } }));
  },

  clearConsultationTerminal() {
    const { id } = get().consultationTerminal;
    if (id !== null) {
      void window.atrium.terminal.kill(id);
    }
    set({ consultationTerminal: defaultConsultationTerminalSlice() });
  },
}));
