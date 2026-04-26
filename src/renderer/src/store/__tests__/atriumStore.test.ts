import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAtriumStore } from '../atriumStore';
import type { ProjectState } from '@shared/domain';
import type { ConsultationFile, ConsultationThread } from '@shared/consultation';
import type { DetachedSkillName } from '@shared/skill/detached';

// Minimal ProjectState fixture
const makeProject = (name = 'test-project', rootPath = '/tmp/proj'): ProjectState => ({
  rootPath,
  projectName: name,
  projectHash: 'abc123',
  context: { description: '', sections: {} },
  nodes: [],
  connections: [],
  sessions: [],
  warnings: [],
});

const defaultConsultation = () => ({
  panel: { kind: 'closed' as const },
  pinState: false,
  thread: null,
  pending: null,
  inFlight: null,
  lastError: null,
  selectedModel: 'sonnet' as const,
});

beforeEach(() => {
  useAtriumStore.setState({
    project: null,
    selectedNodes: new Set(),
    tooltipTarget: null,
    activePanel: 'project',
    terminal: { id: null, status: 'idle', fullscreen: false },
    canvas: { kind: 'empty' },
    consultation: defaultConsultation(),
    claudeStatus: 'checking',
    claudeInfo: null,
    pluginStatus: 'checking',
    pluginInfo: null,
    installState: { kind: 'idle' },
    _recheckHealth: null,
    detachedRuns: { audit: { kind: 'idle' }, status: { kind: 'idle' } },
    lastDetachedError: null,
  });
});

// ---------------------------------------------------------------------------
// Project actions
// ---------------------------------------------------------------------------

describe('setProject', () => {
  it('replaces project and transitions canvas to ready', () => {
    const p = makeProject();
    useAtriumStore.getState().setProject(p);
    const s = useAtriumStore.getState();
    expect(s.project).toBe(p);
    expect(s.canvas).toEqual({ kind: 'ready' });
  });
});

describe('clearProject', () => {
  it('resets project / UI slices and transitions canvas to empty', () => {
    useAtriumStore.getState().setProject(makeProject());
    useAtriumStore.getState().selectNode('node-a');
    useAtriumStore.setState({ tooltipTarget: 'node-a', activePanel: 'selection' });
    useAtriumStore.getState().clearProject();
    const s = useAtriumStore.getState();
    expect(s.project).toBeNull();
    expect(s.selectedNodes.size).toBe(0);
    expect(s.tooltipTarget).toBeNull();
    expect(s.activePanel).toBe('project');
    expect(s.canvas).toEqual({ kind: 'empty' });
  });
});

// ---------------------------------------------------------------------------
// Canvas helpers
// ---------------------------------------------------------------------------

describe('setCanvasError', () => {
  it('sets canvas to error with the given message', () => {
    useAtriumStore.getState().setCanvasError('oops');
    expect(useAtriumStore.getState().canvas).toEqual({ kind: 'error', message: 'oops' });
  });
});

describe('setCanvasLoading', () => {
  it('sets canvas to loading', () => {
    useAtriumStore.getState().setCanvasLoading();
    expect(useAtriumStore.getState().canvas).toEqual({ kind: 'loading' });
  });
});

// ---------------------------------------------------------------------------
// Selection helpers
// ---------------------------------------------------------------------------

describe('selectNode / deselectNode / clearSelection', () => {
  it('selectNode adds slug', () => {
    useAtriumStore.getState().selectNode('slug-a');
    expect(useAtriumStore.getState().selectedNodes.has('slug-a')).toBe(true);
  });

  it('deselectNode removes slug', () => {
    useAtriumStore.getState().selectNode('slug-a');
    useAtriumStore.getState().deselectNode('slug-a');
    expect(useAtriumStore.getState().selectedNodes.has('slug-a')).toBe(false);
  });

  it('clearSelection empties the set', () => {
    useAtriumStore.getState().selectNode('slug-a');
    useAtriumStore.getState().selectNode('slug-b');
    useAtriumStore.getState().clearSelection();
    expect(useAtriumStore.getState().selectedNodes.size).toBe(0);
  });

  it('deselectNode on non-existent slug is a no-op', () => {
    useAtriumStore.getState().deselectNode('ghost');
    expect(useAtriumStore.getState().selectedNodes.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// toggleSelectedNode / setTooltipTarget
// ---------------------------------------------------------------------------

describe('toggleSelectedNode', () => {
  it('adds slug on first call and flips activePanel to selection', () => {
    useAtriumStore.getState().toggleSelectedNode('node-a');
    const s = useAtriumStore.getState();
    expect(s.selectedNodes.has('node-a')).toBe(true);
    expect(s.activePanel).toBe('selection');
  });

  it('removes slug on second call and flips activePanel back to project', () => {
    useAtriumStore.getState().toggleSelectedNode('node-a');
    useAtriumStore.getState().toggleSelectedNode('node-a');
    const s = useAtriumStore.getState();
    expect(s.selectedNodes.has('node-a')).toBe(false);
    expect(s.activePanel).toBe('project');
  });

  it('keeps activePanel as selection when other nodes remain after removal', () => {
    useAtriumStore.getState().toggleSelectedNode('node-a');
    useAtriumStore.getState().toggleSelectedNode('node-b');
    useAtriumStore.getState().toggleSelectedNode('node-a');
    const s = useAtriumStore.getState();
    expect(s.selectedNodes.has('node-b')).toBe(true);
    expect(s.activePanel).toBe('selection');
  });

  it('stays consistent across 10 rapid toggles (even = removed, odd = added)', () => {
    for (let i = 0; i < 10; i++) {
      useAtriumStore.getState().toggleSelectedNode('node-a');
    }
    expect(useAtriumStore.getState().selectedNodes.has('node-a')).toBe(false);
    expect(useAtriumStore.getState().activePanel).toBe('project');
  });
});

describe('setTooltipTarget', () => {
  it('sets target on first call', () => {
    useAtriumStore.getState().setTooltipTarget('node-a');
    expect(useAtriumStore.getState().tooltipTarget).toBe('node-a');
  });

  it('toggles to null when called with the same slug', () => {
    useAtriumStore.getState().setTooltipTarget('node-a');
    useAtriumStore.getState().setTooltipTarget('node-a');
    expect(useAtriumStore.getState().tooltipTarget).toBeNull();
  });

  it('replaces target when called with a different slug', () => {
    useAtriumStore.getState().setTooltipTarget('node-a');
    useAtriumStore.getState().setTooltipTarget('node-b');
    expect(useAtriumStore.getState().tooltipTarget).toBe('node-b');
  });

  it('accepts null directly to clear target', () => {
    useAtriumStore.getState().setTooltipTarget('node-a');
    useAtriumStore.getState().setTooltipTarget(null);
    expect(useAtriumStore.getState().tooltipTarget).toBeNull();
  });
});

describe('clearSelection', () => {
  it('resets activePanel to project', () => {
    useAtriumStore.getState().toggleSelectedNode('node-a');
    expect(useAtriumStore.getState().activePanel).toBe('selection');
    useAtriumStore.getState().clearSelection();
    expect(useAtriumStore.getState().activePanel).toBe('project');
    expect(useAtriumStore.getState().selectedNodes.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Terminal state machine
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Health slice defaults
// ---------------------------------------------------------------------------

describe('health slice initial state', () => {
  it('claudeStatus defaults to "checking"', () => {
    expect(useAtriumStore.getState().claudeStatus).toBe('checking');
  });

  it('claudeInfo defaults to null', () => {
    expect(useAtriumStore.getState().claudeInfo).toBeNull();
  });

  it('pluginStatus defaults to "checking"', () => {
    expect(useAtriumStore.getState().pluginStatus).toBe('checking');
  });

  it('installState defaults to { kind: "idle" }', () => {
    expect(useAtriumStore.getState().installState).toEqual({ kind: 'idle' });
  });

  it('_recheckHealth defaults to null', () => {
    expect(useAtriumStore.getState()._recheckHealth).toBeNull();
  });
});

describe('_setClaude', () => {
  it('updates claudeStatus and claudeInfo', () => {
    const info = { claudePath: '/usr/bin/claude', version: '2.0.0' };
    useAtriumStore.getState()._setClaude({ status: 'healthy', info });
    expect(useAtriumStore.getState().claudeStatus).toBe('healthy');
    expect(useAtriumStore.getState().claudeInfo).toEqual(info);
  });

  it('sets claudeInfo to null when status is unreachable', () => {
    useAtriumStore.getState()._setClaude({ status: 'unreachable', info: null });
    expect(useAtriumStore.getState().claudeInfo).toBeNull();
  });
});

describe('_setPlugin', () => {
  it('updates pluginStatus and pluginInfo', () => {
    const info = { pluginId: 'architector@getleverage' as const, version: '1.1.0', enabled: true };
    useAtriumStore.getState()._setPlugin({ status: 'present', info });
    const s = useAtriumStore.getState();
    expect(s.pluginStatus).toBe('present');
    expect(s.pluginInfo).toEqual(info);
  });

  it('sets pluginInfo to null when status is missing', () => {
    useAtriumStore.getState()._setPlugin({ status: 'missing', info: null });
    const s = useAtriumStore.getState();
    expect(s.pluginStatus).toBe('missing');
    expect(s.pluginInfo).toBeNull();
  });
});

describe('installState transitions', () => {
  it('_startInstall sets installState to installing', () => {
    useAtriumStore.getState()._startInstall();
    expect(useAtriumStore.getState().installState).toEqual({ kind: 'installing' });
  });

  it('_failInstall sets installState to failed with failure payload', () => {
    const failure = {
      kind: 'failed' as const,
      step: 'install' as const,
      code: 'INSTALL_FAILED' as const,
      message: 'step failed',
      stdout: 'some output',
      stderr: '',
    };
    useAtriumStore.getState()._startInstall();
    useAtriumStore.getState()._failInstall(failure);
    const s = useAtriumStore.getState();
    expect(s.installState).toEqual({ kind: 'failed', failure });
  });

  it('_resetInstall returns installState to idle', () => {
    useAtriumStore.getState()._startInstall();
    useAtriumStore.getState()._resetInstall();
    expect(useAtriumStore.getState().installState).toEqual({ kind: 'idle' });
  });
});

describe('_setRecheckHealth', () => {
  it('stores the function reference', () => {
    const fn = vi.fn();
    useAtriumStore.getState()._setRecheckHealth(fn);
    expect(useAtriumStore.getState()._recheckHealth).toBe(fn);
  });

  it('clears the reference when called with null', () => {
    const fn = vi.fn();
    useAtriumStore.getState()._setRecheckHealth(fn);
    useAtriumStore.getState()._setRecheckHealth(null);
    expect(useAtriumStore.getState()._recheckHealth).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Relayout slice
// ---------------------------------------------------------------------------

describe('triggerRelayout', () => {
  it('relayoutRequestId defaults to 0', () => {
    expect(useAtriumStore.getState().relayoutRequestId).toBe(0);
  });

  it('increments relayoutRequestId monotonically', () => {
    useAtriumStore.setState({ relayoutRequestId: 0 });
    useAtriumStore.getState().triggerRelayout();
    expect(useAtriumStore.getState().relayoutRequestId).toBe(1);
    useAtriumStore.getState().triggerRelayout();
    expect(useAtriumStore.getState().relayoutRequestId).toBe(2);
    useAtriumStore.getState().triggerRelayout();
    expect(useAtriumStore.getState().relayoutRequestId).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Terminal state machine
// ---------------------------------------------------------------------------

describe('setTerminal — legal transitions', () => {
  const legalCases: [string, string][] = [
    ['idle', 'spawning'],
    ['spawning', 'active'],
    ['spawning', 'exited'],
    ['active', 'exited'],
    ['exited', 'closing'],
    ['closing', 'idle'],
  ];

  for (const [from, to] of legalCases) {
    it(`${from} → ${to} is allowed`, () => {
      useAtriumStore.setState({ terminal: { id: null, status: from as never, fullscreen: false } });
      const result = useAtriumStore.getState().setTerminal({ status: to as never });
      expect(result.ok).toBe(true);
      expect(useAtriumStore.getState().terminal.status).toBe(to);
    });
  }
});

describe('setTerminal — illegal transitions', () => {
  const illegalCases: [string, string][] = [
    ['idle', 'active'],
    ['idle', 'exited'],
    ['idle', 'closing'],
    ['idle', 'idle'],
    ['spawning', 'idle'],
    ['spawning', 'closing'],
    ['active', 'idle'],
    ['active', 'spawning'],
    ['active', 'closing'],
    ['exited', 'idle'],
    ['exited', 'spawning'],
    ['exited', 'active'],
    ['closing', 'spawning'],
    ['closing', 'active'],
    ['closing', 'exited'],
  ];

  for (const [from, to] of illegalCases) {
    it(`${from} → ${to} is rejected`, () => {
      useAtriumStore.setState({ terminal: { id: null, status: from as never, fullscreen: false } });
      const result = useAtriumStore.getState().setTerminal({ status: to as never });
      expect(result.ok).toBe(false);
      // State must not change
      expect(useAtriumStore.getState().terminal.status).toBe(from);
    });
  }
});

// ---------------------------------------------------------------------------
// _autoDismissExited — IPC wiring
// ---------------------------------------------------------------------------

const TERM_ID = 't_abc' as import('@shared/domain').TerminalId;

describe('_autoDismissExited — IPC wiring', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls window.atrium.terminal.close with the current terminal id when id is non-null', () => {
    const closeSpy = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    vi.stubGlobal('atrium', { terminal: { close: closeSpy } });
    useAtriumStore.setState({ terminal: { id: TERM_ID, status: 'exited', fullscreen: false } });

    useAtriumStore.getState()._autoDismissExited();

    expect(closeSpy).toHaveBeenCalledOnce();
    expect(closeSpy).toHaveBeenCalledWith(TERM_ID);
    const s = useAtriumStore.getState();
    expect(s.terminal.status).toBe('idle');
    expect(s.terminal.id).toBeNull();
  });

  it('does not call terminal.close when id is null', () => {
    const closeSpy = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    vi.stubGlobal('atrium', { terminal: { close: closeSpy } });
    useAtriumStore.setState({ terminal: { id: null, status: 'exited', fullscreen: false } });

    useAtriumStore.getState()._autoDismissExited();

    expect(closeSpy).not.toHaveBeenCalled();
    expect(useAtriumStore.getState().terminal.status).toBe('idle');
  });

  it('fires the IPC synchronously between closing and idle', () => {
    const snapshots: { status: string; callCount: number }[] = [];
    const closeSpy = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    vi.stubGlobal('atrium', { terminal: { close: closeSpy } });

    const unsub = useAtriumStore.subscribe((state) => {
      snapshots.push({ status: state.terminal.status, callCount: closeSpy.mock.calls.length });
    });

    useAtriumStore.setState({ terminal: { id: TERM_ID, status: 'exited', fullscreen: false } });
    snapshots.length = 0; // clear seed snapshot

    useAtriumStore.getState()._autoDismissExited();
    unsub();

    // Expect at least two snapshots: one for closing, one for idle
    expect(snapshots.length).toBeGreaterThanOrEqual(2);
    const closingSnap = snapshots.find((s) => s.status === 'closing');
    const idleSnap = snapshots.find((s) => s.status === 'idle');
    expect(closingSnap).toBeDefined();
    expect(closingSnap!.callCount).toBe(0);
    expect(idleSnap).toBeDefined();
    // close was called before idle transition
    expect(idleSnap!.callCount).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Consultation slice — Phase 7
// ---------------------------------------------------------------------------

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const makeThread = (overrides: Partial<ConsultationThread> = {}): ConsultationThread => ({
  sessionId: 'session-existing',
  createdAt: 1000,
  lastActiveAt: 1000,
  model: 'sonnet',
  systemPromptVersion: 1,
  messages: [],
  ...overrides,
});

const makeFile = (thread: ConsultationThread): ConsultationFile => ({
  schemaVersion: 1,
  activeThreadId: thread.sessionId,
  threads: { [thread.sessionId]: thread },
  orphanedThreads: [],
});

describe('consultation — panel state machine', () => {
  it('openPanel: closed → open-unpinned (pin off)', () => {
    useAtriumStore.getState().openConsultationPanel();
    expect(useAtriumStore.getState().consultation.panel).toEqual({ kind: 'open-unpinned' });
  });

  it('openPanel: closed → open-pinned (pin on)', () => {
    useAtriumStore.setState({
      consultation: { ...defaultConsultation(), pinState: true },
    });
    useAtriumStore.getState().openConsultationPanel();
    expect(useAtriumStore.getState().consultation.panel).toEqual({ kind: 'open-pinned' });
  });

  it('closePanel: any → closed', () => {
    useAtriumStore.setState({
      consultation: { ...defaultConsultation(), panel: { kind: 'open-pinned' }, pinState: true },
    });
    useAtriumStore.getState().closeConsultationPanel();
    expect(useAtriumStore.getState().consultation.panel).toEqual({ kind: 'closed' });
  });

  it('togglePin: open-unpinned → open-pinned (and pinState true)', () => {
    useAtriumStore.setState({
      consultation: { ...defaultConsultation(), panel: { kind: 'open-unpinned' } },
    });
    useAtriumStore.getState().toggleConsultationPin();
    const c = useAtriumStore.getState().consultation;
    expect(c.pinState).toBe(true);
    expect(c.panel).toEqual({ kind: 'open-pinned' });
  });

  it('togglePin: open-pinned → open-unpinned (and pinState false)', () => {
    useAtriumStore.setState({
      consultation: { ...defaultConsultation(), panel: { kind: 'open-pinned' }, pinState: true },
    });
    useAtriumStore.getState().toggleConsultationPin();
    const c = useAtriumStore.getState().consultation;
    expect(c.pinState).toBe(false);
    expect(c.panel).toEqual({ kind: 'open-unpinned' });
  });

  it('togglePin while closed: flips pinState; panel stays closed; later open lands on open-pinned', () => {
    useAtriumStore.getState().toggleConsultationPin();
    let c = useAtriumStore.getState().consultation;
    expect(c.pinState).toBe(true);
    expect(c.panel).toEqual({ kind: 'closed' });

    useAtriumStore.getState().openConsultationPanel();
    c = useAtriumStore.getState().consultation;
    expect(c.pinState).toBe(true);
    expect(c.panel).toEqual({ kind: 'open-pinned' });
  });

  it('togglePin: preview + pin-on → open-pinned', () => {
    useAtriumStore.setState({
      consultation: { ...defaultConsultation(), panel: { kind: 'preview' } },
    });
    useAtriumStore.getState().toggleConsultationPin();
    const c = useAtriumStore.getState().consultation;
    expect(c.pinState).toBe(true);
    expect(c.panel).toEqual({ kind: 'open-pinned' });
  });

  it('enterPreview: any → preview', () => {
    useAtriumStore.getState().enterConsultationPreview();
    expect(useAtriumStore.getState().consultation.panel).toEqual({ kind: 'preview' });
  });
});

describe('consultation — setSelectedModel', () => {
  it('changes selectedModel when thread is null', () => {
    useAtriumStore.getState().setConsultationModel('opus');
    expect(useAtriumStore.getState().consultation.selectedModel).toBe('opus');
  });

  it('is a no-op when thread is non-null (model locked)', () => {
    useAtriumStore.setState({
      consultation: {
        ...defaultConsultation(),
        thread: makeThread({ model: 'sonnet' }),
        selectedModel: 'sonnet',
      },
    });
    useAtriumStore.getState().setConsultationModel('opus');
    expect(useAtriumStore.getState().consultation.selectedModel).toBe('sonnet');
  });
});

describe('consultation — sendConsultationMessage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('first send (no thread, no pending): calls newSession then sendMessage and sets inFlight', async () => {
    const newSession = vi
      .fn()
      .mockResolvedValue({ ok: true, data: { sessionId: 'new-sid', systemPromptVersion: 7 } });
    const sendMessage = vi.fn().mockResolvedValue({ ok: true, data: { messageId: 'm1' } });
    vi.stubGlobal('atrium', { consultation: { newSession, sendMessage } });

    useAtriumStore.setState({ project: makeProject('p', '/root') });
    await useAtriumStore.getState().sendConsultationMessage('hello');

    expect(newSession).toHaveBeenCalledWith('/root', 'sonnet');
    expect(sendMessage).toHaveBeenCalledWith('/root', 'hello');
    const c = useAtriumStore.getState().consultation;
    expect(c.thread).toBeNull();
    expect(c.pending?.sessionId).toBe('new-sid');
    expect(c.pending?.systemPromptVersion).toBe(7);
    expect(c.pending?.messages).toHaveLength(1);
    expect(c.pending?.messages[0]).toMatchObject({ id: 'm1', role: 'user', content: 'hello' });
    expect(c.inFlight).toMatchObject({ messageId: 'm1', text: 'hello', assistantText: '' });
    expect(c.lastError).toBeNull();
  });

  it('subsequent send (thread non-null): skips newSession and appends to thread.messages', async () => {
    const newSession = vi.fn();
    const sendMessage = vi.fn().mockResolvedValue({ ok: true, data: { messageId: 'm2' } });
    vi.stubGlobal('atrium', { consultation: { newSession, sendMessage } });

    const thread = makeThread({ messages: [{ id: 'u1', role: 'user', content: 'hi', ts: 1 }] });
    useAtriumStore.setState({
      project: makeProject('p', '/root'),
      consultation: { ...defaultConsultation(), thread },
    });

    await useAtriumStore.getState().sendConsultationMessage('again');

    expect(newSession).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith('/root', 'again');
    const c = useAtriumStore.getState().consultation;
    expect(c.thread?.messages).toHaveLength(2);
    expect(c.thread?.messages[1]).toMatchObject({ id: 'm2', role: 'user', content: 'again' });
    expect(c.inFlight?.messageId).toBe('m2');
  });

  it('does nothing when project is null', async () => {
    const newSession = vi.fn();
    const sendMessage = vi.fn();
    vi.stubGlobal('atrium', { consultation: { newSession, sendMessage } });

    await useAtriumStore.getState().sendConsultationMessage('hello');
    expect(newSession).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('newSession failure: bails without setting lastError or inFlight (pre-send failure stays out of retry path)', async () => {
    const newSession = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { code: 'NOT_AUTHENTICATED', message: 'auth' } });
    const sendMessage = vi.fn();
    vi.stubGlobal('atrium', { consultation: { newSession, sendMessage } });

    useAtriumStore.setState({ project: makeProject('p', '/root') });
    await useAtriumStore.getState().sendConsultationMessage('hello');

    expect(sendMessage).not.toHaveBeenCalled();
    const c = useAtriumStore.getState().consultation;
    expect(c.lastError).toBeNull();
    expect(c.inFlight).toBeNull();
    expect(c.pending).toBeNull();
  });

  it('sendMessage failure (newSession ok): bails without setting lastError; pending preserved for retry', async () => {
    const newSession = vi
      .fn()
      .mockResolvedValue({ ok: true, data: { sessionId: 'sid', systemPromptVersion: 1 } });
    const sendMessage = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { code: 'NETWORK_ERROR', message: 'down' } });
    vi.stubGlobal('atrium', { consultation: { newSession, sendMessage } });

    useAtriumStore.setState({ project: makeProject('p', '/root') });
    await useAtriumStore.getState().sendConsultationMessage('hello');

    expect(newSession).toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith('/root', 'hello');
    const c = useAtriumStore.getState().consultation;
    expect(c.lastError).toBeNull();
    expect(c.inFlight).toBeNull();
    // Reserved sessionId remains so retry skips newSession on the next attempt
    expect(c.pending?.sessionId).toBe('sid');
    expect(c.pending?.messages).toHaveLength(0);
  });
});

describe('consultation — handleStreamChunk', () => {
  it('replaces assistantText (does not concatenate)', () => {
    useAtriumStore.setState({
      consultation: {
        ...defaultConsultation(),
        inFlight: { messageId: 'm1', text: 'hi', assistantText: '', startedAt: 1 },
      },
    });
    const store = useAtriumStore.getState();
    store.handleConsultationStreamChunk('m1', 'A');
    store.handleConsultationStreamChunk('m1', 'AB');
    store.handleConsultationStreamChunk('m1', 'ABC');
    expect(useAtriumStore.getState().consultation.inFlight?.assistantText).toBe('ABC');
  });

  it('ignores chunks for stale messageId', () => {
    useAtriumStore.setState({
      consultation: {
        ...defaultConsultation(),
        inFlight: { messageId: 'm1', text: 'hi', assistantText: 'X', startedAt: 1 },
      },
    });
    useAtriumStore.getState().handleConsultationStreamChunk('m-stale', 'IGNORED');
    expect(useAtriumStore.getState().consultation.inFlight?.assistantText).toBe('X');
  });

  it('ignores chunks when inFlight is null', () => {
    useAtriumStore.getState().handleConsultationStreamChunk('m1', 'data');
    expect(useAtriumStore.getState().consultation.inFlight).toBeNull();
  });
});

describe('consultation — handleStreamComplete', () => {
  it('materialises thread from pending and appends assistant message', () => {
    useAtriumStore.setState({
      consultation: {
        ...defaultConsultation(),
        pending: {
          sessionId: 's1',
          model: 'sonnet',
          systemPromptVersion: 7,
          messages: [{ id: 'm1', role: 'user', content: 'hi', ts: 1 }],
        },
        inFlight: { messageId: 'm1', text: 'hi', assistantText: 'partial', startedAt: 1 },
      },
    });
    useAtriumStore.getState().handleConsultationStreamComplete('m1', 'final answer');
    const c = useAtriumStore.getState().consultation;
    expect(c.pending).toBeNull();
    expect(c.thread).not.toBeNull();
    expect(c.thread?.sessionId).toBe('s1');
    expect(c.thread?.systemPromptVersion).toBe(7);
    expect(c.thread?.messages).toHaveLength(2);
    expect(c.thread?.messages[1]).toMatchObject({ role: 'assistant', content: 'final answer' });
    expect(c.inFlight).toBeNull();
    expect(c.lastError).toBeNull();
  });

  it('appends to existing thread.messages when thread is non-null', () => {
    const existingThread = makeThread({
      messages: [
        { id: 'u1', role: 'user', content: 'first', ts: 1 },
        { id: 'a1', role: 'assistant', content: 'reply', ts: 2 },
        { id: 'm2', role: 'user', content: 'second', ts: 3 },
      ],
    });
    useAtriumStore.setState({
      consultation: {
        ...defaultConsultation(),
        thread: existingThread,
        inFlight: { messageId: 'm2', text: 'second', assistantText: 'partial', startedAt: 3 },
      },
    });
    useAtriumStore.getState().handleConsultationStreamComplete('m2', 'second reply');
    const c = useAtriumStore.getState().consultation;
    expect(c.thread?.messages).toHaveLength(4);
    expect(c.thread?.messages[3]).toMatchObject({ role: 'assistant', content: 'second reply' });
  });

  it('uses fullContent from result event, not inFlight.assistantText', () => {
    useAtriumStore.setState({
      consultation: {
        ...defaultConsultation(),
        pending: { sessionId: 's1', model: 'sonnet', systemPromptVersion: 1, messages: [] },
        inFlight: { messageId: 'm1', text: 'hi', assistantText: 'STREAMED', startedAt: 1 },
      },
    });
    useAtriumStore.getState().handleConsultationStreamComplete('m1', 'AUTHORITATIVE');
    expect(useAtriumStore.getState().consultation.thread?.messages[0]?.content).toBe('AUTHORITATIVE');
  });

  it('preview → open-unpinned on first complete', () => {
    useAtriumStore.setState({
      consultation: {
        ...defaultConsultation(),
        panel: { kind: 'preview' },
        pending: { sessionId: 's1', model: 'sonnet', systemPromptVersion: 1, messages: [] },
        inFlight: { messageId: 'm1', text: 'hi', assistantText: '', startedAt: 1 },
      },
    });
    useAtriumStore.getState().handleConsultationStreamComplete('m1', 'reply');
    expect(useAtriumStore.getState().consultation.panel).toEqual({ kind: 'open-unpinned' });
  });

  it('keeps panel state when not preview', () => {
    useAtriumStore.setState({
      consultation: {
        ...defaultConsultation(),
        panel: { kind: 'open-pinned' },
        pinState: true,
        pending: { sessionId: 's1', model: 'sonnet', systemPromptVersion: 1, messages: [] },
        inFlight: { messageId: 'm1', text: 'hi', assistantText: '', startedAt: 1 },
      },
    });
    useAtriumStore.getState().handleConsultationStreamComplete('m1', 'reply');
    expect(useAtriumStore.getState().consultation.panel).toEqual({ kind: 'open-pinned' });
  });

  it('ignores complete for stale messageId', () => {
    useAtriumStore.setState({
      consultation: {
        ...defaultConsultation(),
        pending: { sessionId: 's1', model: 'sonnet', systemPromptVersion: 1, messages: [] },
        inFlight: { messageId: 'm1', text: 'hi', assistantText: '', startedAt: 1 },
      },
    });
    useAtriumStore.getState().handleConsultationStreamComplete('m-stale', 'reply');
    const c = useAtriumStore.getState().consultation;
    expect(c.thread).toBeNull();
    expect(c.inFlight).not.toBeNull();
  });
});

describe('consultation — handleStreamError', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('CANCELLED clears inFlight and does NOT set lastError', () => {
    useAtriumStore.setState({
      consultation: {
        ...defaultConsultation(),
        inFlight: { messageId: 'm1', text: 'hi', assistantText: '', startedAt: 1 },
      },
    });
    useAtriumStore.getState().handleConsultationStreamError('m1', { code: 'CANCELLED' });
    const c = useAtriumStore.getState().consultation;
    expect(c.inFlight).toBeNull();
    expect(c.lastError).toBeNull();
  });

  it('NOT_AUTHENTICATED in EmptyThreadMode keeps thread null and sets lastError', () => {
    useAtriumStore.setState({
      consultation: {
        ...defaultConsultation(),
        pending: {
          sessionId: 's1',
          model: 'sonnet',
          systemPromptVersion: 1,
          messages: [{ id: 'm1', role: 'user', content: 'hi', ts: 1 }],
        },
        inFlight: { messageId: 'm1', text: 'hi', assistantText: '', startedAt: 1 },
      },
    });
    useAtriumStore
      .getState()
      .handleConsultationStreamError('m1', { code: 'NOT_AUTHENTICATED', raw: 'no auth' });
    const c = useAtriumStore.getState().consultation;
    expect(c.thread).toBeNull();
    expect(c.inFlight).toBeNull();
    expect(c.lastError).toEqual({ messageId: 'm1', code: 'NOT_AUTHENTICATED', raw: 'no auth' });
    // Failed user message is preserved in pending.messages for retry
    expect(c.pending?.messages).toHaveLength(1);
  });

  it('SESSION_LOST triggers rotation: new sessionId, carry-over user message, lastError set', async () => {
    const newSession = vi
      .fn()
      .mockResolvedValue({ ok: true, data: { sessionId: 'new-sid', systemPromptVersion: 1 } });
    vi.stubGlobal('atrium', { consultation: { newSession } });

    const lostThread = makeThread({
      sessionId: 'lost-sid',
      model: 'opus',
      messages: [{ id: 'm1', role: 'user', content: 'lost-message', ts: 1 }],
    });
    useAtriumStore.setState({
      project: makeProject('p', '/root'),
      consultation: {
        ...defaultConsultation(),
        thread: lostThread,
        inFlight: { messageId: 'm1', text: 'lost-message', assistantText: '', startedAt: 1 },
        selectedModel: 'opus',
      },
    });

    useAtriumStore
      .getState()
      .handleConsultationStreamError('m1', { code: 'SESSION_LOST', raw: 'session 404' });

    await flush();

    expect(newSession).toHaveBeenCalledWith('/root', 'opus');
    const c = useAtriumStore.getState().consultation;
    expect(c.thread).toBeNull();
    expect(c.pending?.sessionId).toBe('new-sid');
    expect(c.pending?.model).toBe('opus');
    expect(c.pending?.messages).toEqual([
      { id: 'm1', role: 'user', content: 'lost-message', ts: 1 },
    ]);
    expect(c.inFlight).toBeNull();
    expect(c.lastError).toEqual({ messageId: 'm1', code: 'SESSION_LOST', raw: 'session 404' });
  });

  it('generic error sets lastError and clears inFlight', () => {
    useAtriumStore.setState({
      consultation: {
        ...defaultConsultation(),
        inFlight: { messageId: 'm1', text: 'hi', assistantText: '', startedAt: 1 },
      },
    });
    useAtriumStore.getState().handleConsultationStreamError('m1', { code: 'NETWORK_ERROR' });
    const c = useAtriumStore.getState().consultation;
    expect(c.inFlight).toBeNull();
    expect(c.lastError).toEqual({ messageId: 'm1', code: 'NETWORK_ERROR' });
  });

  it('post-cancel generic error (inFlight === null): does NOT pop a lastError bubble', () => {
    // Regression: stream tear-down after cancelConsultationInFlight previously
    // slipped past the else-branch guard and set lastError. Mirrors chunk/complete.
    useAtriumStore.setState({
      consultation: {
        ...defaultConsultation(),
        inFlight: null,
        lastError: null,
      },
    });
    useAtriumStore.getState().handleConsultationStreamError('m1', { code: 'NETWORK_ERROR' });
    const c = useAtriumStore.getState().consultation;
    expect(c.lastError).toBeNull();
    expect(c.inFlight).toBeNull();
  });

  it('SESSION_LOST early-returns when project is null (no rotation IPC)', async () => {
    const newSession = vi.fn();
    vi.stubGlobal('atrium', { consultation: { newSession } });

    useAtriumStore.setState({
      project: null,
      consultation: {
        ...defaultConsultation(),
        inFlight: { messageId: 'm1', text: 'hi', assistantText: '', startedAt: 1 },
      },
    });
    useAtriumStore.getState().handleConsultationStreamError('m1', { code: 'SESSION_LOST' });
    await flush();

    expect(newSession).not.toHaveBeenCalled();
    const c = useAtriumStore.getState().consultation;
    // No rotation occurred: state untouched on the rotation path
    expect(c.lastError).toBeNull();
    expect(c.pending).toBeNull();
  });

  it('SESSION_LOST: newSession failure inside rotation sets lastError(messageId), clears inFlight', async () => {
    const newSession = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { code: 'NOT_AUTHENTICATED', message: 'auth' } });
    vi.stubGlobal('atrium', { consultation: { newSession } });

    const lostThread = makeThread({
      sessionId: 'lost-sid',
      messages: [{ id: 'm1', role: 'user', content: 'lost', ts: 1 }],
    });
    useAtriumStore.setState({
      project: makeProject('p', '/root'),
      consultation: {
        ...defaultConsultation(),
        thread: lostThread,
        inFlight: { messageId: 'm1', text: 'lost', assistantText: '', startedAt: 1 },
      },
    });

    useAtriumStore.getState().handleConsultationStreamError('m1', { code: 'SESSION_LOST' });
    await flush();

    expect(newSession).toHaveBeenCalled();
    const c = useAtriumStore.getState().consultation;
    expect(c.inFlight).toBeNull();
    // lastError carries the rotation-failure code AND the original messageId so
    // retryLastConsultationError can find the user message in thread/pending.
    expect(c.lastError).toEqual({ messageId: 'm1', code: 'NOT_AUTHENTICATED' });
    // No new pending was committed since rotation failed
    expect(c.pending).toBeNull();
  });
});

describe('consultation — loadConsultationForProject', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('thread loaded from disk: hydrates thread + selectedModel', async () => {
    const thread = makeThread({ sessionId: 's1', model: 'opus' });
    const file = makeFile(thread);
    vi.stubGlobal('atrium', {
      consultation: { loadThread: vi.fn().mockResolvedValue({ ok: true, data: file }) },
    });

    await useAtriumStore.getState().loadConsultationForProject('/root');
    const c = useAtriumStore.getState().consultation;
    expect(c.thread).toEqual(thread);
    expect(c.selectedModel).toBe('opus');
    expect(c.inFlight).toBeNull();
    expect(c.lastError).toBeNull();
  });

  it('no thread on disk: clears thread, defaults model to sonnet', async () => {
    vi.stubGlobal('atrium', {
      consultation: { loadThread: vi.fn().mockResolvedValue({ ok: true, data: null }) },
    });

    useAtriumStore.setState({
      consultation: {
        ...defaultConsultation(),
        thread: makeThread({ model: 'opus' }),
        selectedModel: 'opus',
      },
    });
    await useAtriumStore.getState().loadConsultationForProject('/root');
    const c = useAtriumStore.getState().consultation;
    expect(c.thread).toBeNull();
    expect(c.selectedModel).toBe('sonnet');
  });

  it('IPC error: falls back to empty state', async () => {
    vi.stubGlobal('atrium', {
      consultation: {
        loadThread: vi
          .fn()
          .mockResolvedValue({ ok: false, error: { code: 'IO_FAILED', message: 'disk' } }),
      },
    });
    await useAtriumStore.getState().loadConsultationForProject('/root');
    const c = useAtriumStore.getState().consultation;
    expect(c.thread).toBeNull();
    expect(c.selectedModel).toBe('sonnet');
  });

  it('missing atrium.consultation (test env): falls back to empty state without throwing', async () => {
    vi.stubGlobal('atrium', {});
    await expect(useAtriumStore.getState().loadConsultationForProject('/root')).resolves.toBeUndefined();
    expect(useAtriumStore.getState().consultation.thread).toBeNull();
  });
});

describe('consultation — setProject integration', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('triggers loadConsultationForProject on setProject', async () => {
    const thread = makeThread({ sessionId: 's1', model: 'sonnet' });
    const loadThread = vi.fn().mockResolvedValue({ ok: true, data: makeFile(thread) });
    vi.stubGlobal('atrium', { consultation: { loadThread } });

    useAtriumStore.getState().setProject(makeProject('p', '/root'));
    await flush();
    expect(loadThread).toHaveBeenCalledWith('/root');
  });

  it('panel: closed + !pinState → preview', () => {
    vi.stubGlobal('atrium', { consultation: { loadThread: vi.fn().mockResolvedValue({ ok: true, data: null }) } });
    useAtriumStore.getState().setProject(makeProject('p', '/root'));
    expect(useAtriumStore.getState().consultation.panel).toEqual({ kind: 'preview' });
  });

  it('panel: open-pinned + pinState=true → preserved (no preview transition)', () => {
    vi.stubGlobal('atrium', { consultation: { loadThread: vi.fn().mockResolvedValue({ ok: true, data: null }) } });
    useAtriumStore.setState({
      consultation: {
        ...defaultConsultation(),
        panel: { kind: 'open-pinned' },
        pinState: true,
      },
    });
    useAtriumStore.getState().setProject(makeProject('p', '/root'));
    expect(useAtriumStore.getState().consultation.panel).toEqual({ kind: 'open-pinned' });
  });

  it('panel: open-unpinned + !pinState → preserved (no transition)', () => {
    vi.stubGlobal('atrium', { consultation: { loadThread: vi.fn().mockResolvedValue({ ok: true, data: null }) } });
    useAtriumStore.setState({
      consultation: {
        ...defaultConsultation(),
        panel: { kind: 'open-unpinned' },
      },
    });
    useAtriumStore.getState().setProject(makeProject('p', '/root'));
    expect(useAtriumStore.getState().consultation.panel).toEqual({ kind: 'open-unpinned' });
  });
});

describe('consultation — switchProject integration', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('blocked by terminal: consultation stream NOT cancelled', async () => {
    const cancel = vi.fn();
    const switchSpy = vi.fn();
    const loadThread = vi.fn();
    vi.stubGlobal('atrium', {
      project: { switch: switchSpy },
      consultation: { cancel, loadThread },
    });

    useAtriumStore.setState({
      project: makeProject('p', '/root-old'),
      terminal: { id: null, status: 'active', fullscreen: false },
      consultation: {
        ...defaultConsultation(),
        inFlight: { messageId: 'm1', text: 'hi', assistantText: '', startedAt: 1 },
      },
    });

    const r = await useAtriumStore.getState().switchProject('/root-new');
    expect(r.ok).toBe(false);
    expect(cancel).not.toHaveBeenCalled();
    expect(switchSpy).not.toHaveBeenCalled();
    // inFlight remains
    expect(useAtriumStore.getState().consultation.inFlight).not.toBeNull();
  });

  it('allowed: cancels in-flight consultation BEFORE project.switch', async () => {
    const cancel = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    let cancelOrder = 0;
    let switchOrder = 0;
    let counter = 0;
    cancel.mockImplementation(() => {
      cancelOrder = ++counter;
      return Promise.resolve({ ok: true, data: undefined });
    });
    const switchSpy = vi.fn().mockImplementation((path: string) => {
      switchOrder = ++counter;
      return Promise.resolve({ ok: true, data: makeProject('new', path) });
    });
    const loadThread = vi.fn().mockResolvedValue({ ok: true, data: null });
    vi.stubGlobal('atrium', {
      project: { switch: switchSpy },
      consultation: { cancel, loadThread },
    });

    useAtriumStore.setState({
      project: makeProject('p', '/root-old'),
      terminal: { id: null, status: 'idle', fullscreen: false },
      consultation: {
        ...defaultConsultation(),
        inFlight: { messageId: 'm1', text: 'hi', assistantText: '', startedAt: 1 },
        lastError: { messageId: 'm0', code: 'NETWORK_ERROR' },
      },
    });

    const r = await useAtriumStore.getState().switchProject('/root-new');
    expect(r.ok).toBe(true);
    expect(cancel).toHaveBeenCalledWith('/root-old', 'm1');
    expect(switchSpy).toHaveBeenCalledWith('/root-new');
    expect(cancelOrder).toBeGreaterThan(0);
    expect(switchOrder).toBeGreaterThan(cancelOrder);
    const c = useAtriumStore.getState().consultation;
    expect(c.inFlight).toBeNull();
    expect(c.lastError).toBeNull();
  });

  it('success: loadConsultationForProject called for new project root', async () => {
    const switchSpy = vi
      .fn()
      .mockResolvedValue({ ok: true, data: makeProject('new', '/root-new') });
    const loadThread = vi.fn().mockResolvedValue({ ok: true, data: null });
    vi.stubGlobal('atrium', {
      project: { switch: switchSpy },
      consultation: { loadThread, cancel: vi.fn() },
    });

    useAtriumStore.setState({
      project: makeProject('p', '/root-old'),
    });
    await useAtriumStore.getState().switchProject('/root-new');
    await flush();
    expect(loadThread).toHaveBeenCalledWith('/root-new');
  });
});

describe('consultation — startNewConsultationSession', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rotates: clears thread, sets pending with new sessionId, updates selectedModel', async () => {
    const newSession = vi
      .fn()
      .mockResolvedValue({ ok: true, data: { sessionId: 'rot-sid', systemPromptVersion: 2 } });
    vi.stubGlobal('atrium', { consultation: { newSession } });

    useAtriumStore.setState({
      project: makeProject('p', '/root'),
      consultation: {
        ...defaultConsultation(),
        thread: makeThread({ messages: [{ id: 'u1', role: 'user', content: 'old', ts: 1 }] }),
        selectedModel: 'sonnet',
      },
    });

    await useAtriumStore.getState().startNewConsultationSession('opus');
    expect(newSession).toHaveBeenCalledWith('/root', 'opus');
    const c = useAtriumStore.getState().consultation;
    expect(c.thread).toBeNull();
    expect(c.pending).toEqual({
      sessionId: 'rot-sid',
      model: 'opus',
      systemPromptVersion: 2,
      messages: [],
    });
    expect(c.selectedModel).toBe('opus');
    expect(c.inFlight).toBeNull();
    expect(c.lastError).toBeNull();
  });
});

describe('consultation — retryLastConsultationError', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('strips failed user message and re-sends it', async () => {
    const newSession = vi
      .fn()
      .mockResolvedValue({ ok: true, data: { sessionId: 'sid', systemPromptVersion: 1 } });
    const sendMessage = vi.fn().mockResolvedValue({ ok: true, data: { messageId: 'm-retry' } });
    vi.stubGlobal('atrium', { consultation: { newSession, sendMessage } });

    useAtriumStore.setState({
      project: makeProject('p', '/root'),
      consultation: {
        ...defaultConsultation(),
        pending: {
          sessionId: 'sid-pending',
          model: 'sonnet',
          systemPromptVersion: 1,
          messages: [{ id: 'm-failed', role: 'user', content: 'retry-me', ts: 1 }],
        },
        lastError: { messageId: 'm-failed', code: 'NETWORK_ERROR' },
      },
    });

    await useAtriumStore.getState().retryLastConsultationError();

    expect(sendMessage).toHaveBeenCalledWith('/root', 'retry-me');
    const c = useAtriumStore.getState().consultation;
    expect(c.lastError).toBeNull();
    // The old user message was stripped and a new one was appended with the new id
    const userMessages = c.pending?.messages.filter((m) => m.role === 'user') ?? [];
    expect(userMessages).toHaveLength(1);
    expect(userMessages[0]).toMatchObject({ id: 'm-retry', content: 'retry-me' });
    expect(c.inFlight?.messageId).toBe('m-retry');
  });
});

describe('consultation — cancelConsultationInFlight', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls cancel IPC and clears inFlight + lastError', async () => {
    const cancel = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    vi.stubGlobal('atrium', { consultation: { cancel } });

    useAtriumStore.setState({
      project: makeProject('p', '/root'),
      consultation: {
        ...defaultConsultation(),
        inFlight: { messageId: 'm1', text: 'hi', assistantText: '', startedAt: 1 },
      },
    });

    await useAtriumStore.getState().cancelConsultationInFlight();
    expect(cancel).toHaveBeenCalledWith('/root', 'm1');
    const c = useAtriumStore.getState().consultation;
    expect(c.inFlight).toBeNull();
  });

  it('no-op when inFlight is null', async () => {
    const cancel = vi.fn();
    vi.stubGlobal('atrium', { consultation: { cancel } });

    useAtriumStore.setState({ project: makeProject('p', '/root') });
    await useAtriumStore.getState().cancelConsultationInFlight();
    expect(cancel).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Phase 10 — Project-switch cancel + SESSION_LOST recovery (end-to-end)
// ---------------------------------------------------------------------------

describe('consultation — Phase 10: project-switch mid-stream end-to-end', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('cancel before switch + load for new root + late stream events for old messageId are filtered', async () => {
    // Project A has an in-flight stream. Switch to project B.
    // Expected order: cancel(A, m-A) → switch(B) → load(B-root).
    // After the switch, late chunks/complete/error for m-A must NOT mutate state.
    const cancel = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    const switchSpy = vi
      .fn()
      .mockResolvedValue({ ok: true, data: makeProject('B', '/root-B') });
    const loadThread = vi.fn().mockResolvedValue({ ok: true, data: null });
    vi.stubGlobal('atrium', {
      project: { switch: switchSpy },
      consultation: { cancel, loadThread },
    });

    useAtriumStore.setState({
      project: makeProject('A', '/root-A'),
      terminal: { id: null, status: 'idle', fullscreen: false },
      consultation: {
        ...defaultConsultation(),
        pending: {
          sessionId: 'sid-A',
          model: 'sonnet',
          systemPromptVersion: 1,
          messages: [{ id: 'm-A', role: 'user', content: 'A question', ts: 1 }],
        },
        inFlight: { messageId: 'm-A', text: 'A question', assistantText: 'streamed-so-far', startedAt: 1 },
      },
    });

    const r = await useAtriumStore.getState().switchProject('/root-B');
    expect(r.ok).toBe(true);

    // Assert IPC sequence
    expect(cancel).toHaveBeenCalledWith('/root-A', 'm-A');
    expect(switchSpy).toHaveBeenCalledWith('/root-B');
    await flush();
    expect(loadThread).toHaveBeenCalledWith('/root-B');

    // Post-switch state: project replaced, in-flight cleared, no carryover error bubble
    let s = useAtriumStore.getState();
    expect(s.project?.rootPath).toBe('/root-B');
    expect(s.consultation.inFlight).toBeNull();
    expect(s.consultation.lastError).toBeNull();
    // Old pending was wiped by loadConsultationForProject
    expect(s.consultation.pending).toBeNull();
    expect(s.consultation.thread).toBeNull();

    // Late events for the old messageId arrive after the switch — they must be filtered.
    // In this scenario, no stream is mid-flight in project B, so the filter mechanism
    // is the `inFlight === null` early-return (switchProject cleared inFlight before
    // these arrive). The messageId-mismatch guard is exercised by the next test.
    useAtriumStore.getState().handleConsultationStreamChunk('m-A', 'late chunk');
    s = useAtriumStore.getState();
    expect(s.consultation.inFlight).toBeNull();

    useAtriumStore.getState().handleConsultationStreamError('m-A', { code: 'CANCELLED' });
    s = useAtriumStore.getState();
    expect(s.consultation.inFlight).toBeNull();
    expect(s.consultation.lastError).toBeNull();

    // A late generic error (e.g., parser tear-down) must also be filtered out.
    useAtriumStore.getState().handleConsultationStreamError('m-A', { code: 'NETWORK_ERROR' });
    s = useAtriumStore.getState();
    expect(s.consultation.lastError).toBeNull();

    // A late complete must not materialise a thread.
    useAtriumStore.getState().handleConsultationStreamComplete('m-A', 'late answer');
    s = useAtriumStore.getState();
    expect(s.consultation.thread).toBeNull();
  });

  it('after switch, project B starts a new stream — late events for old messageId are filtered by messageId-mismatch guard', async () => {
    // Switch from A (with m-A in-flight) to B, then start a fresh stream in B that
    // assigns a new messageId 'm-B'. Now `inFlight !== null`, so any late events
    // for the old 'm-A' must be filtered specifically by the
    // `inFlight.messageId !== messageId` guard, not by the `inFlight === null` path.
    const cancel = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    const switchSpy = vi
      .fn()
      .mockResolvedValue({ ok: true, data: makeProject('B', '/root-B') });
    const loadThread = vi.fn().mockResolvedValue({ ok: true, data: null });
    const newSession = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, data: { sessionId: 'sid-B', systemPromptVersion: 1 } });
    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, data: { messageId: 'm-B' } });
    vi.stubGlobal('atrium', {
      project: { switch: switchSpy },
      consultation: { cancel, loadThread, newSession, sendMessage },
    });

    useAtriumStore.setState({
      project: makeProject('A', '/root-A'),
      terminal: { id: null, status: 'idle', fullscreen: false },
      consultation: {
        ...defaultConsultation(),
        pending: {
          sessionId: 'sid-A',
          model: 'sonnet',
          systemPromptVersion: 1,
          messages: [{ id: 'm-A', role: 'user', content: 'A question', ts: 1 }],
        },
        inFlight: { messageId: 'm-A', text: 'A question', assistantText: 'streamed-so-far', startedAt: 1 },
      },
    });

    const r = await useAtriumStore.getState().switchProject('/root-B');
    expect(r.ok).toBe(true);
    await flush();

    // Start a new stream in B → newSession + sendMessage assign messageId 'm-B'.
    await useAtriumStore.getState().sendConsultationMessage('B question');

    let s = useAtriumStore.getState();
    expect(s.consultation.inFlight).toMatchObject({ messageId: 'm-B', text: 'B question' });
    expect(s.consultation.pending?.sessionId).toBe('sid-B');
    expect(s.consultation.pending?.messages).toEqual([
      expect.objectContaining({ id: 'm-B', role: 'user', content: 'B question' }),
    ]);

    // Late chunk for old m-A — filtered by messageId mismatch (inFlight is m-B, not null).
    useAtriumStore.getState().handleConsultationStreamChunk('m-A', 'late chunk for A');
    s = useAtriumStore.getState();
    expect(s.consultation.inFlight).toMatchObject({ messageId: 'm-B', assistantText: '' });

    // Late generic error for old m-A — filtered by messageId mismatch, no lastError bubble.
    useAtriumStore.getState().handleConsultationStreamError('m-A', { code: 'NETWORK_ERROR' });
    s = useAtriumStore.getState();
    expect(s.consultation.inFlight).toMatchObject({ messageId: 'm-B' });
    expect(s.consultation.lastError).toBeNull();

    // Late CANCELLED for old m-A — filtered by messageId mismatch, B's inFlight is preserved.
    useAtriumStore.getState().handleConsultationStreamError('m-A', { code: 'CANCELLED' });
    s = useAtriumStore.getState();
    expect(s.consultation.inFlight).toMatchObject({ messageId: 'm-B' });

    // Late complete for old m-A — filtered by messageId mismatch, must not materialise B's thread.
    useAtriumStore.getState().handleConsultationStreamComplete('m-A', 'late answer for A');
    s = useAtriumStore.getState();
    expect(s.consultation.thread).toBeNull();
    expect(s.consultation.inFlight).toMatchObject({ messageId: 'm-B' });
  });
});

// ---------------------------------------------------------------------------
// Detached-run slice
// ---------------------------------------------------------------------------

const SKILLS: DetachedSkillName[] = ['audit', 'status'];

describe('detachedRuns — initial state', () => {
  it('defaults both skills to idle', () => {
    const s = useAtriumStore.getState();
    expect(s.detachedRuns.audit).toEqual({ kind: 'idle' });
    expect(s.detachedRuns.status).toEqual({ kind: 'idle' });
    expect(s.lastDetachedError).toBeNull();
  });
});

describe.each(SKILLS.map((s) => [s]))('detachedRuns — startDetachedRun (%s)', (skill) => {
  it('idle → waiting: returns ok(undefined)', () => {
    const r = useAtriumStore.getState().startDetachedRun(skill);
    expect(r.ok).toBe(true);
    const run = useAtriumStore.getState().detachedRuns[skill];
    expect(run.kind).toBe('waiting');
  });

  it('waiting → BUSY: returns err("BUSY") and does not change state', () => {
    useAtriumStore.setState({
      detachedRuns: {
        audit: { kind: 'idle' },
        status: { kind: 'idle' },
        [skill]: { kind: 'waiting', startedAt: 1 },
      },
    });
    const r = useAtriumStore.getState().startDetachedRun(skill);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('BUSY');
    expect(useAtriumStore.getState().detachedRuns[skill].kind).toBe('waiting');
  });

  it('done → waiting: ok (previous done is replaced)', () => {
    useAtriumStore.setState({
      detachedRuns: {
        audit: { kind: 'idle' },
        status: { kind: 'idle' },
        [skill]: { kind: 'done', output: 'old', finishedAt: 1 },
      },
    });
    const r = useAtriumStore.getState().startDetachedRun(skill);
    expect(r.ok).toBe(true);
    expect(useAtriumStore.getState().detachedRuns[skill].kind).toBe('waiting');
  });

  it('error → waiting: ok (previous error is replaced)', () => {
    useAtriumStore.setState({
      detachedRuns: {
        audit: { kind: 'idle' },
        status: { kind: 'idle' },
        [skill]: { kind: 'error', message: 'old error', finishedAt: 1 },
      },
    });
    const r = useAtriumStore.getState().startDetachedRun(skill);
    expect(r.ok).toBe(true);
    expect(useAtriumStore.getState().detachedRuns[skill].kind).toBe('waiting');
  });
});

describe.each(SKILLS.map((s) => [s]))('detachedRuns — setDetachedRunResult (%s)', (skill) => {
  it('transitions waiting → done with the supplied output', () => {
    useAtriumStore.setState({
      detachedRuns: {
        audit: { kind: 'idle' },
        status: { kind: 'idle' },
        [skill]: { kind: 'waiting', startedAt: 1 },
      },
    });
    useAtriumStore.getState().setDetachedRunResult(skill, 'some output');
    const run = useAtriumStore.getState().detachedRuns[skill];
    expect(run.kind).toBe('done');
    if (run.kind === 'done') expect(run.output).toBe('some output');
  });

  it('does not mutate the other skill slot', () => {
    const other: DetachedSkillName = skill === 'audit' ? 'status' : 'audit';
    useAtriumStore.setState({
      detachedRuns: {
        audit: { kind: 'idle' },
        status: { kind: 'idle' },
        [skill]: { kind: 'waiting', startedAt: 1 },
      },
    });
    useAtriumStore.getState().setDetachedRunResult(skill, 'result');
    expect(useAtriumStore.getState().detachedRuns[other].kind).toBe('idle');
  });

  it('does not clear lastDetachedError', () => {
    useAtriumStore.setState({
      detachedRuns: {
        audit: { kind: 'idle' },
        status: { kind: 'idle' },
        [skill]: { kind: 'waiting', startedAt: 1 },
      },
      lastDetachedError: { skill, message: 'prior error' },
    });
    useAtriumStore.getState().setDetachedRunResult(skill, 'new output');
    expect(useAtriumStore.getState().lastDetachedError).toEqual({ skill, message: 'prior error' });
  });
});

describe.each(SKILLS.map((s) => [s]))('detachedRuns — setDetachedRunError (%s)', (skill) => {
  it('transitions waiting → error and sets lastDetachedError', () => {
    useAtriumStore.setState({
      detachedRuns: {
        audit: { kind: 'idle' },
        status: { kind: 'idle' },
        [skill]: { kind: 'waiting', startedAt: 1 },
      },
    });
    useAtriumStore.getState().setDetachedRunError(skill, 'something went wrong');
    const s = useAtriumStore.getState();
    expect(s.detachedRuns[skill].kind).toBe('error');
    if (s.detachedRuns[skill].kind === 'error') {
      expect(s.detachedRuns[skill].message).toBe('something went wrong');
    }
    expect(s.lastDetachedError).toEqual({ skill, message: 'something went wrong' });
  });
});

describe.each(SKILLS.map((s) => [s]))('detachedRuns — closeDetachedResult (%s)', (skill) => {
  it('done → idle', () => {
    useAtriumStore.setState({
      detachedRuns: {
        audit: { kind: 'idle' },
        status: { kind: 'idle' },
        [skill]: { kind: 'done', output: 'out', finishedAt: 1 },
      },
    });
    useAtriumStore.getState().closeDetachedResult(skill);
    expect(useAtriumStore.getState().detachedRuns[skill]).toEqual({ kind: 'idle' });
  });
});

describe.each(SKILLS.map((s) => [s]))('detachedRuns — clearDetachedRunError (%s)', (skill) => {
  it('error → idle; clears lastDetachedError when it matches the skill', () => {
    useAtriumStore.setState({
      detachedRuns: {
        audit: { kind: 'idle' },
        status: { kind: 'idle' },
        [skill]: { kind: 'error', message: 'oops', finishedAt: 1 },
      },
      lastDetachedError: { skill, message: 'oops' },
    });
    useAtriumStore.getState().clearDetachedRunError(skill);
    const s = useAtriumStore.getState();
    expect(s.detachedRuns[skill]).toEqual({ kind: 'idle' });
    expect(s.lastDetachedError).toBeNull();
  });

  it('does not clear lastDetachedError when it belongs to the other skill', () => {
    const other: DetachedSkillName = skill === 'audit' ? 'status' : 'audit';
    useAtriumStore.setState({
      detachedRuns: {
        audit: { kind: 'idle' },
        status: { kind: 'idle' },
        [skill]: { kind: 'error', message: 'oops', finishedAt: 1 },
      },
      lastDetachedError: { skill: other, message: 'other error' },
    });
    useAtriumStore.getState().clearDetachedRunError(skill);
    expect(useAtriumStore.getState().lastDetachedError).toEqual({ skill: other, message: 'other error' });
  });
});

describe('detachedRuns — independent slots', () => {
  it('audit and status run concurrently without interfering', () => {
    useAtriumStore.getState().startDetachedRun('audit');
    useAtriumStore.getState().startDetachedRun('status');
    const s = useAtriumStore.getState();
    expect(s.detachedRuns.audit.kind).toBe('waiting');
    expect(s.detachedRuns.status.kind).toBe('waiting');

    useAtriumStore.getState().setDetachedRunResult('audit', 'audit out');
    useAtriumStore.getState().setDetachedRunError('status', 'status failed');

    const s2 = useAtriumStore.getState();
    expect(s2.detachedRuns.audit.kind).toBe('done');
    expect(s2.detachedRuns.status.kind).toBe('error');
    expect(s2.lastDetachedError).toEqual({ skill: 'status', message: 'status failed' });
  });
});

describe('consultation — Phase 10: SESSION_LOST recovery → retry → success end-to-end', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rotates session, preserves user message, retry re-sends, complete materialises a fresh thread', async () => {
    // Setup: a thread is mid-stream when SESSION_LOST arrives.
    const newSession = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, data: { sessionId: 'sid-rotated', systemPromptVersion: 3 } });
    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, data: { messageId: 'm-retry' } });
    vi.stubGlobal('atrium', { consultation: { newSession, sendMessage } });

    const lostThread = makeThread({
      sessionId: 'sid-lost',
      model: 'opus',
      systemPromptVersion: 2,
      messages: [
        { id: 'u0', role: 'user', content: 'old', ts: 1 },
        { id: 'a0', role: 'assistant', content: 'reply', ts: 2 },
        { id: 'm-failed', role: 'user', content: 'will be retried', ts: 3 },
      ],
    });
    useAtriumStore.setState({
      project: makeProject('p', '/root'),
      consultation: {
        ...defaultConsultation(),
        thread: lostThread,
        inFlight: { messageId: 'm-failed', text: 'will be retried', assistantText: 'partial', startedAt: 3 },
        selectedModel: 'opus',
      },
    });

    // 1. SESSION_LOST arrives → rotation triggered
    useAtriumStore
      .getState()
      .handleConsultationStreamError('m-failed', { code: 'SESSION_LOST', raw: '404 session not found' });
    await flush();

    expect(newSession).toHaveBeenCalledWith('/root', 'opus');
    let c = useAtriumStore.getState().consultation;
    // Old thread cleared; pending now holds the rotated session + carried user message
    expect(c.thread).toBeNull();
    expect(c.pending).toEqual({
      sessionId: 'sid-rotated',
      model: 'opus',
      systemPromptVersion: 3,
      messages: [{ id: 'm-failed', role: 'user', content: 'will be retried', ts: 3 }],
    });
    expect(c.inFlight).toBeNull();
    expect(c.lastError).toEqual({
      messageId: 'm-failed',
      code: 'SESSION_LOST',
      raw: '404 session not found',
    });
    // Historical messages from the lost thread (u0 / a0) are dropped — only the
    // failed user message is carried forward into the rotated session. Guards
    // against rotation accidentally preserving stale history under the new sessionId.
    expect(c.pending?.messages.find((m) => m.id === 'u0')).toBeUndefined();
    expect(c.pending?.messages.find((m) => m.id === 'a0')).toBeUndefined();

    // 2. User clicks Retry → retryLastConsultationError → sendConsultationMessage('will be retried')
    await useAtriumStore.getState().retryLastConsultationError();

    // newSession is NOT called again — the rotated pending already has a sessionId
    expect(newSession).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith('/root', 'will be retried');

    c = useAtriumStore.getState().consultation;
    // Failed user message stripped; new user message bound to the new messageId is present
    expect(c.pending?.messages).toHaveLength(1);
    expect(c.pending?.messages[0]).toMatchObject({ id: 'm-retry', role: 'user', content: 'will be retried' });
    expect(c.inFlight).toMatchObject({ messageId: 'm-retry', text: 'will be retried', assistantText: '' });
    expect(c.lastError).toBeNull();

    // 3. Stream completes happily → thread materialises from pending
    useAtriumStore.getState().handleConsultationStreamComplete('m-retry', 'authoritative reply');
    c = useAtriumStore.getState().consultation;
    expect(c.thread).not.toBeNull();
    expect(c.thread?.sessionId).toBe('sid-rotated');
    expect(c.thread?.model).toBe('opus');
    expect(c.thread?.systemPromptVersion).toBe(3);
    expect(c.thread?.messages).toEqual([
      expect.objectContaining({ id: 'm-retry', role: 'user', content: 'will be retried' }),
      expect.objectContaining({ role: 'assistant', content: 'authoritative reply' }),
    ]);
    expect(c.pending).toBeNull();
    expect(c.inFlight).toBeNull();
    expect(c.lastError).toBeNull();
  });
});
