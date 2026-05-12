import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAtriumStore } from '../atriumStore';
import type { ProjectState } from '@shared/domain';
import type { TerminalId } from '@shared/domain';

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
    consultationTerminal: { id: null, status: 'idle' },
    claudeStatus: 'checking',
    claudeInfo: null,
    pluginStatus: 'checking',
    pluginInfo: null,
    installState: { kind: 'idle' },
    _recheckHealth: null,
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

const TERM_ID = 't_abc' as TerminalId;

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
// Consultation slice — panel state machine
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Consultation terminal slice
// ---------------------------------------------------------------------------

const CONSULT_ID = 't_consult' as TerminalId;

describe('consultationTerminal — initial state', () => {
  it('defaults to { id: null, status: "idle" }', () => {
    expect(useAtriumStore.getState().consultationTerminal).toEqual({ id: null, status: 'idle' });
  });
});

describe('setConsultationTerminalSpawning', () => {
  it('transitions status to spawning, preserves id', () => {
    useAtriumStore.getState().setConsultationTerminalSpawning();
    expect(useAtriumStore.getState().consultationTerminal).toEqual({ id: null, status: 'spawning' });
  });

  it('preserves non-null id when transitioning to spawning', () => {
    useAtriumStore.setState({ consultationTerminal: { id: CONSULT_ID, status: 'active' } });
    useAtriumStore.getState().setConsultationTerminalSpawning();
    expect(useAtriumStore.getState().consultationTerminal).toEqual({ id: CONSULT_ID, status: 'spawning' });
  });
});

describe('setConsultationTerminalActive', () => {
  it('stores the id and transitions status to active', () => {
    useAtriumStore.getState().setConsultationTerminalActive(CONSULT_ID);
    expect(useAtriumStore.getState().consultationTerminal).toEqual({ id: CONSULT_ID, status: 'active' });
  });
});

describe('setConsultationTerminalExited', () => {
  it('transitions status to exited, preserves id', () => {
    useAtriumStore.setState({ consultationTerminal: { id: CONSULT_ID, status: 'active' } });
    useAtriumStore.getState().setConsultationTerminalExited();
    expect(useAtriumStore.getState().consultationTerminal).toEqual({ id: CONSULT_ID, status: 'exited' });
  });
});

describe('clearConsultationTerminal', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resets to idle and fires terminal.kill when id is non-null', () => {
    const killSpy = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    vi.stubGlobal('atrium', { terminal: { kill: killSpy } });

    useAtriumStore.setState({ consultationTerminal: { id: CONSULT_ID, status: 'active' } });
    useAtriumStore.getState().clearConsultationTerminal();

    expect(killSpy).toHaveBeenCalledOnce();
    expect(killSpy).toHaveBeenCalledWith(CONSULT_ID);
    expect(useAtriumStore.getState().consultationTerminal).toEqual({ id: null, status: 'idle' });
  });

  it('resets to idle without calling terminal.kill when id is null', () => {
    const killSpy = vi.fn();
    vi.stubGlobal('atrium', { terminal: { kill: killSpy } });

    useAtriumStore.getState().clearConsultationTerminal();

    expect(killSpy).not.toHaveBeenCalled();
    expect(useAtriumStore.getState().consultationTerminal).toEqual({ id: null, status: 'idle' });
  });
});

// ---------------------------------------------------------------------------
// switchProject — consultation terminal integration
// ---------------------------------------------------------------------------

describe('switchProject — consultation terminal integration', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('blocked by terminal: returns error, consultationTerminal unchanged', async () => {
    const killSpy = vi.fn();
    vi.stubGlobal('atrium', { terminal: { kill: killSpy } });

    useAtriumStore.setState({
      project: makeProject('p', '/root-old'),
      terminal: { id: null, status: 'active', fullscreen: false },
      consultationTerminal: { id: CONSULT_ID, status: 'active' },
    });

    const r = await useAtriumStore.getState().switchProject('/root-new');
    expect(r.ok).toBe(false);
    expect(killSpy).not.toHaveBeenCalled();
    expect(useAtriumStore.getState().consultationTerminal).toEqual({ id: CONSULT_ID, status: 'active' });
  });

  it('idle terminal: clears consultationTerminal before project.switch', async () => {
    const killSpy = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    const switchSpy = vi
      .fn()
      .mockResolvedValue({ ok: true, data: makeProject('new', '/root-new') });
    vi.stubGlobal('atrium', {
      terminal: { kill: killSpy },
      project: { switch: switchSpy },
    });

    useAtriumStore.setState({
      project: makeProject('p', '/root-old'),
      terminal: { id: null, status: 'idle', fullscreen: false },
      consultationTerminal: { id: CONSULT_ID, status: 'active' },
    });

    const r = await useAtriumStore.getState().switchProject('/root-new');
    expect(r.ok).toBe(true);
    expect(killSpy).toHaveBeenCalledWith(CONSULT_ID);
    expect(useAtriumStore.getState().consultationTerminal).toEqual({ id: null, status: 'idle' });
    expect(switchSpy).toHaveBeenCalledWith('/root-new');
  });

  it('success: resets UI state and sets new project', async () => {
    const switchSpy = vi
      .fn()
      .mockResolvedValue({ ok: true, data: makeProject('new', '/root-new') });
    vi.stubGlobal('atrium', {
      terminal: { kill: vi.fn() },
      project: { switch: switchSpy },
    });

    useAtriumStore.setState({
      project: makeProject('p', '/root-old'),
      terminal: { id: null, status: 'idle', fullscreen: false },
      selectedNodes: new Set(['node-a']),
    });

    const r = await useAtriumStore.getState().switchProject('/root-new');
    expect(r.ok).toBe(true);
    const s = useAtriumStore.getState();
    expect(s.project?.rootPath).toBe('/root-new');
    expect(s.selectedNodes.size).toBe(0);
    expect(s.canvas).toEqual({ kind: 'ready' });
  });
});
