import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: vi.fn(() => '/fake/app'),
  },
}));

describe('resolveSkillsPath', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns resourcesPath/skills when packaged', async () => {
    const { app } = await import('electron');
    (app as { isPackaged: boolean }).isPackaged = true;
    Object.defineProperty(process, 'resourcesPath', {
      value: '/fake/resources',
      writable: true,
      configurable: true,
    });

    const { resolveSkillsPath } = await import('../resolveSkillsPath.js');
    expect(resolveSkillsPath()).toMatch(/[/\\]skills$/);
  });

  it('returns appPath/.claude/skills when not packaged', async () => {
    const { app } = await import('electron');
    (app as { isPackaged: boolean }).isPackaged = false;
    (app.getAppPath as ReturnType<typeof vi.fn>).mockReturnValue('/fake/app');

    const { resolveSkillsPath } = await import('../resolveSkillsPath.js');
    expect(resolveSkillsPath()).toMatch(/\.claude[/\\]skills$/);
  });
});
