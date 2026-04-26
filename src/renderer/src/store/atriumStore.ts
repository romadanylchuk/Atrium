import { create } from 'zustand';
import { err, ok } from '@shared/result';
import type {
  ProjectState,
  TerminalId,
  HealthInfo,
  PluginInfo,
  InstallOutcome,
  ConsultationFile,
  ConsultationMessage,
  ConsultationModel,
  ConsultationThread,
  ConsultationErrorCode,
} from '@shared/index';
import type { Result } from '@shared/result';
import type { ProjectErrorCode } from '@shared/errors';
import type { DetachedSkillName } from '@shared/skill/detached';
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
// Detached-run slice
// ---------------------------------------------------------------------------

export type DetachedRunState =
  | { kind: 'idle' }
  | { kind: 'waiting'; startedAt: number }
  | { kind: 'done'; output: string; finishedAt: number }
  | { kind: 'error'; message: string; finishedAt: number };

export type DetachedSlice = Record<DetachedSkillName, DetachedRunState>;

function defaultDetachedRuns(): DetachedSlice {
  return { audit: { kind: 'idle' }, status: { kind: 'idle' } };
}

// ---------------------------------------------------------------------------
// Consultation slice
// ---------------------------------------------------------------------------

export type ConsultationPanelState =
  | { kind: 'closed' }
  | { kind: 'open-unpinned' }
  | { kind: 'open-pinned' }
  | { kind: 'preview' };

export interface ConsultationInFlightMessage {
  messageId: string;
  text: string;
  /** Current full assistant text — chunks REPLACE rather than append (see plan Decision §4). */
  assistantText: string;
  startedAt: number;
}

export interface ConsultationErrorBubble {
  messageId: string;
  code: ConsultationErrorCode;
  raw?: string;
}

/**
 * In-memory pending thread held before the first successful complete commits to `thread`.
 *
 * Required by plan §Phase 7 step 4: when `thread === null` and a user message is in flight,
 * the message is appended to a "pending in-memory thread" so the model selector remains
 * editable (plan slice comment: `null = EmptyThreadMode … model editable`) until the first
 * successful complete materialises `thread`.
 *
 * `systemPromptVersion` flows from main (CONSULTATION_SYSTEM_PROMPT_VERSION) via newSession's
 * result so the renderer never carries a magic number; whatever version the main process
 * resolved at session-creation time is the version that materialises into `thread`.
 */
export interface ConsultationPendingThread {
  sessionId: string;
  model: ConsultationModel;
  systemPromptVersion: number;
  messages: ConsultationMessage[];
}

export interface ConsultationSlice {
  panel: ConsultationPanelState;
  /** Mirrors `open-pinned`; survives closed→open transitions and project switches per Decision §10. */
  pinState: boolean;
  thread: ConsultationThread | null;
  pending: ConsultationPendingThread | null;
  inFlight: ConsultationInFlightMessage | null;
  lastError: ConsultationErrorBubble | null;
  selectedModel: ConsultationModel;
}

function defaultConsultationSlice(): ConsultationSlice {
  return {
    panel: { kind: 'closed' },
    pinState: false,
    thread: null,
    pending: null,
    inFlight: null,
    lastError: null,
    selectedModel: 'sonnet',
  };
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

  // --- Detached-run slice ---
  detachedRuns: DetachedSlice;
  lastDetachedError: { skill: DetachedSkillName; message: string } | null;

  // --- Consultation slice ---
  consultation: ConsultationSlice;

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

  // --- Detached-run actions ---
  startDetachedRun: (skill: DetachedSkillName) => Result<void, 'BUSY'>;
  setDetachedRunResult: (skill: DetachedSkillName, output: string) => void;
  setDetachedRunError: (skill: DetachedSkillName, message: string) => void;
  closeDetachedResult: (skill: DetachedSkillName) => void;
  clearDetachedRunError: (skill: DetachedSkillName) => void;

  // --- Consultation actions ---
  openConsultationPanel: () => void;
  closeConsultationPanel: () => void;
  toggleConsultationPin: () => void;
  enterConsultationPreview: () => void;
  setConsultationModel: (model: ConsultationModel) => void;
  sendConsultationMessage: (text: string) => Promise<void>;
  cancelConsultationInFlight: () => Promise<void>;
  retryLastConsultationError: () => Promise<void>;
  startNewConsultationSession: (model: ConsultationModel) => Promise<void>;
  handleConsultationStreamChunk: (messageId: string, fullText: string) => void;
  handleConsultationStreamComplete: (messageId: string, fullContent: string) => void;
  handleConsultationStreamError: (
    messageId: string,
    err: { code: ConsultationErrorCode; raw?: string },
  ) => void;
  loadConsultationForProject: (projectRoot: string) => Promise<void>;
};

// ---------------------------------------------------------------------------
// Consultation helpers (pure)
// ---------------------------------------------------------------------------

function nextAssistantId(messageId: string): string {
  return `${messageId}-assistant`;
}

function readMessages(slice: ConsultationSlice): ConsultationMessage[] {
  return slice.thread?.messages ?? slice.pending?.messages ?? [];
}

function readActiveModel(slice: ConsultationSlice): ConsultationModel {
  return slice.thread?.model ?? slice.pending?.model ?? slice.selectedModel;
}

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
  detachedRuns: defaultDetachedRuns(),
  lastDetachedError: null,
  consultation: defaultConsultationSlice(),

  // --- Project actions ---

  setProject(state) {
    set({ project: state, canvas: canvasReady() });
    void get().loadConsultationForProject(state.rootPath);
    const { panel, pinState } = get().consultation;
    if (panel.kind === 'closed' && !pinState) {
      set((s) => ({ consultation: { ...s.consultation, panel: { kind: 'preview' } } }));
    }
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

    // Cancel any in-flight consultation BEFORE switching projects.
    // canSwitch already passed — safe to drop the consultation stream.
    const { consultation, project } = get();
    const inFlight = consultation.inFlight;
    if (inFlight !== null && project !== null) {
      try {
        await window.atrium.consultation.cancel(project.rootPath, inFlight.messageId);
      } catch {
        // Swallow cancel failures — the upcoming project switch resets state anyway.
      }
      set((s) => ({
        consultation: { ...s.consultation, inFlight: null, lastError: null },
      }));
    }

    const r = await window.atrium.project.switch(path);

    if (r.ok) {
      set(() => ({
        selectedNodes: new Set<string>(),
        tooltipTarget: null,
        activePanel: 'project',
        terminal: defaultTerminalSlice(),
      }));
      // setProject handles project + canvas + consultation init + preview transition.
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

  startAutoOpen() {
    // Phase 6 implements the full auto-open chain.
  },

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
  // Detached-run actions
  // -------------------------------------------------------------------------

  startDetachedRun(skill) {
    const current = get().detachedRuns[skill];
    if (current.kind === 'waiting') {
      return err('BUSY', `detached run for '${skill}' is already in flight`);
    }
    set((s) => ({
      detachedRuns: { ...s.detachedRuns, [skill]: { kind: 'waiting', startedAt: Date.now() } },
    }));
    return ok(undefined);
  },

  setDetachedRunResult(skill, output) {
    set((s) => ({
      detachedRuns: {
        ...s.detachedRuns,
        [skill]: { kind: 'done', output, finishedAt: Date.now() },
      },
    }));
  },

  setDetachedRunError(skill, message) {
    set((s) => ({
      detachedRuns: {
        ...s.detachedRuns,
        [skill]: { kind: 'error', message, finishedAt: Date.now() },
      },
      lastDetachedError: { skill, message },
    }));
  },

  closeDetachedResult(skill) {
    set((s) => ({
      detachedRuns: { ...s.detachedRuns, [skill]: { kind: 'idle' } },
    }));
  },

  clearDetachedRunError(skill) {
    set((s) => ({
      detachedRuns: { ...s.detachedRuns, [skill]: { kind: 'idle' } },
      lastDetachedError:
        s.lastDetachedError?.skill === skill ? null : s.lastDetachedError,
    }));
  },

  // -------------------------------------------------------------------------
  // Consultation actions
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

  setConsultationModel(model) {
    const { thread } = get().consultation;
    if (thread !== null) return; // model locked once thread materialises
    set((s) => ({ consultation: { ...s.consultation, selectedModel: model } }));
  },

  async sendConsultationMessage(text) {
    const state = get();
    const project = state.project;
    if (project === null) return;
    const projectRoot = project.rootPath;

    let pending = state.consultation.pending;
    const thread = state.consultation.thread;

    // Reserve a sessionId on first send when no thread or pending exists.
    if (thread === null && pending === null) {
      const r = await window.atrium.consultation.newSession(
        projectRoot,
        state.consultation.selectedModel,
      );
      // Pre-send failures do not write a lastError bubble: ConsultationErrorBubble.messageId
      // is contracted to match a real user message in pending/thread, and retryLastConsultationError
      // looks up the message by id. A messageId='' sentinel would silently no-op retry.
      // Phase 9 surfaces this failure class via a separate UX channel (toast / form-error).
      if (!r.ok) return;
      pending = {
        sessionId: r.data.sessionId,
        model: state.consultation.selectedModel,
        systemPromptVersion: r.data.systemPromptVersion,
        messages: [],
      };
      set((s) => ({ consultation: { ...s.consultation, pending } }));
    }

    const sendR = await window.atrium.consultation.sendMessage(projectRoot, text);
    if (!sendR.ok) return;
    const messageId = sendR.data.messageId;
    const now = Date.now();
    const userMessage: ConsultationMessage = {
      id: messageId,
      role: 'user',
      content: text,
      ts: now,
    };

    set((s) => {
      const c = s.consultation;
      let nextThread = c.thread;
      let nextPending = c.pending;
      if (nextThread !== null) {
        nextThread = {
          ...nextThread,
          lastActiveAt: now,
          messages: [...nextThread.messages, userMessage],
        };
      } else if (nextPending !== null) {
        nextPending = { ...nextPending, messages: [...nextPending.messages, userMessage] };
      }
      return {
        consultation: {
          ...c,
          thread: nextThread,
          pending: nextPending,
          inFlight: { messageId, text, assistantText: '', startedAt: now },
          lastError: null,
        },
      };
    });
  },

  async cancelConsultationInFlight() {
    const state = get();
    const inFlight = state.consultation.inFlight;
    const project = state.project;
    if (inFlight === null || project === null) return;
    await window.atrium.consultation.cancel(project.rootPath, inFlight.messageId);
    // The CANCELLED streamError that arrives later is filtered out by messageId mismatch.
    set((s) => ({ consultation: { ...s.consultation, inFlight: null, lastError: null } }));
  },

  async retryLastConsultationError() {
    const state = get();
    const lastError = state.consultation.lastError;
    if (lastError === null) return;
    const messages = readMessages(state.consultation);
    const userMsg = messages.find((m) => m.id === lastError.messageId);
    if (userMsg === undefined) return;

    // Strip the failed user message and clear lastError; sendConsultationMessage will
    // re-append a fresh user message bound to the new messageId.
    set((s) => {
      const c = s.consultation;
      let nextThread = c.thread;
      let nextPending = c.pending;
      if (nextThread !== null) {
        nextThread = {
          ...nextThread,
          messages: nextThread.messages.filter((m) => m.id !== lastError.messageId),
        };
      } else if (nextPending !== null) {
        nextPending = {
          ...nextPending,
          messages: nextPending.messages.filter((m) => m.id !== lastError.messageId),
        };
      }
      return {
        consultation: { ...c, thread: nextThread, pending: nextPending, lastError: null },
      };
    });

    await get().sendConsultationMessage(userMsg.content);
  },

  async startNewConsultationSession(model) {
    const project = get().project;
    if (project === null) return;
    const r = await window.atrium.consultation.newSession(project.rootPath, model);
    if (!r.ok) {
      set((s) => ({
        consultation: {
          ...s.consultation,
          lastError: { messageId: '', code: r.error.code },
        },
      }));
      return;
    }
    set((s) => ({
      consultation: {
        ...s.consultation,
        thread: null,
        pending: {
          sessionId: r.data.sessionId,
          model,
          systemPromptVersion: r.data.systemPromptVersion,
          messages: [],
        },
        inFlight: null,
        lastError: null,
        selectedModel: model,
      },
    }));
  },

  handleConsultationStreamChunk(messageId, fullText) {
    set((s) => {
      const inFlight = s.consultation.inFlight;
      if (inFlight === null || inFlight.messageId !== messageId) return s;
      return {
        consultation: {
          ...s.consultation,
          inFlight: { ...inFlight, assistantText: fullText },
        },
      };
    });
  },

  handleConsultationStreamComplete(messageId, fullContent) {
    set((s) => {
      const c = s.consultation;
      if (c.inFlight === null || c.inFlight.messageId !== messageId) return s;

      const now = Date.now();
      const assistantMessage: ConsultationMessage = {
        id: nextAssistantId(messageId),
        role: 'assistant',
        content: fullContent,
        ts: now,
      };

      let nextThread: ConsultationThread;
      if (c.thread !== null) {
        nextThread = {
          ...c.thread,
          lastActiveAt: now,
          messages: [...c.thread.messages, assistantMessage],
        };
      } else if (c.pending !== null) {
        nextThread = {
          sessionId: c.pending.sessionId,
          createdAt: now,
          lastActiveAt: now,
          model: c.pending.model,
          systemPromptVersion: c.pending.systemPromptVersion,
          messages: [...c.pending.messages, assistantMessage],
        };
      } else {
        // No pending/thread — defensive bail. Should not happen via normal flow.
        return s;
      }

      const nextPanel: ConsultationPanelState =
        c.panel.kind === 'preview' ? { kind: 'open-unpinned' } : c.panel;

      return {
        consultation: {
          ...c,
          thread: nextThread,
          pending: null,
          inFlight: null,
          lastError: null,
          panel: nextPanel,
        },
      };
    });
  },

  handleConsultationStreamError(messageId, errInfo) {
    if (errInfo.code === 'CANCELLED') {
      set((s) => {
        const inFlight = s.consultation.inFlight;
        if (inFlight === null || inFlight.messageId !== messageId) return s;
        return { consultation: { ...s.consultation, inFlight: null } };
      });
      return;
    }

    if (errInfo.code === 'SESSION_LOST') {
      // Fire-and-forget rotation. The action signature is sync (void) per plan; the
      // async rotation runs in the background and updates state when newSession resolves.
      void rotateForSessionLost(get, set, messageId, errInfo.raw);
      return;
    }

    set((s) => {
      const inFlight = s.consultation.inFlight;
      // Mirror the chunk/complete guards: a stream error that arrives after
      // cancelConsultationInFlight (inFlight === null) or for a stale messageId
      // must not produce a lastError bubble. The CANCELLED branch above handles
      // its own code; this guard catches generic errors emitted as the stream
      // tears down post-cancel.
      if (inFlight === null || inFlight.messageId !== messageId) return s;
      return {
        consultation: {
          ...s.consultation,
          inFlight: null,
          lastError: errInfo.raw !== undefined
            ? { messageId, code: errInfo.code, raw: errInfo.raw }
            : { messageId, code: errInfo.code },
        },
      };
    });
  },

  async loadConsultationForProject(projectRoot) {
    let r: Result<ConsultationFile | null, ConsultationErrorCode>;
    try {
      r = await window.atrium.consultation.loadThread(projectRoot);
    } catch {
      // Test environments / pre-Phase 6 callers without a stub fall through to empty.
      set((s) => ({
        consultation: {
          ...s.consultation,
          thread: null,
          pending: null,
          inFlight: null,
          lastError: null,
          selectedModel: 'sonnet',
        },
      }));
      return;
    }

    if (r.ok && r.data !== null) {
      const file = r.data;
      const thread = file.threads[file.activeThreadId] ?? null;
      set((s) => ({
        consultation: {
          ...s.consultation,
          thread,
          pending: null,
          inFlight: null,
          lastError: null,
          selectedModel: thread !== null ? thread.model : 'sonnet',
        },
      }));
    } else {
      set((s) => ({
        consultation: {
          ...s.consultation,
          thread: null,
          pending: null,
          inFlight: null,
          lastError: null,
          selectedModel: 'sonnet',
        },
      }));
    }
  },
}));

// ---------------------------------------------------------------------------
// Internal — SESSION_LOST rotation
// ---------------------------------------------------------------------------

async function rotateForSessionLost(
  get: () => AtriumStore,
  set: (
    partial:
      | Partial<AtriumStore>
      | ((state: AtriumStore) => Partial<AtriumStore>),
  ) => void,
  messageId: string,
  raw: string | undefined,
): Promise<void> {
  const state = get();
  const project = state.project;
  if (project === null) return;

  const messages = readMessages(state.consultation);
  const userMsg = messages.find((m) => m.id === messageId);
  const model = readActiveModel(state.consultation);

  const r = await window.atrium.consultation.newSession(project.rootPath, model);
  if (!r.ok) {
    set((s) => ({
      consultation: {
        ...s.consultation,
        inFlight: null,
        lastError: { messageId, code: r.error.code },
      },
    }));
    return;
  }

  const carriedMessages: ConsultationMessage[] = userMsg !== undefined ? [userMsg] : [];

  set((s) => ({
    consultation: {
      ...s.consultation,
      thread: null,
      pending: {
        sessionId: r.data.sessionId,
        model,
        systemPromptVersion: r.data.systemPromptVersion,
        messages: carriedMessages,
      },
      inFlight: null,
      lastError: raw !== undefined
        ? { messageId, code: 'SESSION_LOST', raw }
        : { messageId, code: 'SESSION_LOST' },
    },
  }));
}
