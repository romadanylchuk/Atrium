import { execFile } from 'node:child_process';

const WHICH_TIMEOUT_MS = 3000;

let cached: string | null = null;

export function resolveClaudeBin(): Promise<string> {
  if (cached !== null) return Promise.resolve(cached);

  return new Promise<string>((resolve, reject) => {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    let done = false;

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try { cp.kill(); } catch { /* ignore */ }
      reject(new Error("'claude' not on PATH — check your installation"));
    }, WHICH_TIMEOUT_MS);

    const cp = execFile(cmd, ['claude'], (error, stdout) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (error) {
        reject(new Error("'claude' not on PATH — check your installation"));
        return;
      }
      const firstLine = (stdout as unknown as string).trim().split(/\r?\n/)[0]?.trim() ?? '';
      if (!firstLine) {
        reject(new Error("'claude' not on PATH — check your installation"));
        return;
      }
      cached = firstLine;
      resolve(firstLine);
    });
  });
}

export function getCachedClaudeBin(): string | null {
  return cached;
}
