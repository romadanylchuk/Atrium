import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const MAIN_ENTRY = path.join(REPO_ROOT, 'out/main/index.js');
const FIXTURE_PROJECT = path.join(REPO_ROOT, 'e2e/fixtures/fake-project');

// On Windows node-pty can spawn .cmd wrappers directly.
// On POSIX the .js file has a shebang so it is directly executable.
const FAKE_CLAUDE_BIN =
  process.platform === 'win32'
    ? path.join(REPO_ROOT, 'e2e/fixtures/fake-claude.cmd')
    : path.join(REPO_ROOT, 'e2e/fixtures/fake-claude.js');

type LaunchOptions = {
  e2eFolder?: string;
};

export async function launchApp(opts: LaunchOptions = {}): Promise<{
  app: ElectronApplication;
  page: Page;
  userDataDir: string;
}> {
  // Fresh temp dir per test — isolates Electron userData so recents are always empty.
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atrium-e2e-'));

  const app = await electron.launch({
    args: [
      MAIN_ENTRY,
      `--user-data-dir=${userDataDir}`,
    ],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      ATRIUM_E2E_CLAUDE_BIN: FAKE_CLAUDE_BIN,
      ...(opts.e2eFolder ? { ATRIUM_E2E_FOLDER: opts.e2eFolder } : {}),
    },
    timeout: 30_000,
  });

  // firstWindow() waits for the first BrowserWindow to be ready
  const page = await app.firstWindow();

  return { app, page, userDataDir };
}

export { FIXTURE_PROJECT, FAKE_CLAUDE_BIN };
