import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CrashLog, mirrorConsole, LOG_FILE, OLD_LOG_FILE, MAX_LOG_BYTES } from '../crashLog';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atrium-log-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const read = () => fs.readFileSync(path.join(dir, LOG_FILE), 'utf8');

describe('CrashLog', () => {
  it('appends timestamped lines with level and scope', () => {
    const log = new CrashLog(dir);
    log.write('WARN', 'test', 'value is %d', 42);
    log.write('INFO', 'test', 'second');
    const lines = read().trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^\d{4}-\d\d-\d\dT[\d:.]+Z WARN  \[test\] value is 42$/);
  });

  it('records the stack of an Error', () => {
    const log = new CrashLog(dir);
    log.write('FATAL', 'main', new Error('boom'));
    expect(read()).toContain('Error: boom\n    at ');
  });

  it('creates a missing logs directory', () => {
    const nested = path.join(dir, 'a', 'b');
    new CrashLog(nested).write('INFO', 'x', 'hi');
    expect(fs.existsSync(path.join(nested, LOG_FILE))).toBe(true);
  });

  it('rotates an oversized log at startup', () => {
    fs.writeFileSync(path.join(dir, LOG_FILE), Buffer.alloc(MAX_LOG_BYTES + 1));
    new CrashLog(dir).write('INFO', 'x', 'fresh');
    expect(fs.statSync(path.join(dir, OLD_LOG_FILE)).size).toBe(MAX_LOG_BYTES + 1);
    expect(read()).toContain('fresh');
  });

  it('never throws when the file cannot be written', () => {
    const log = new CrashLog(dir);
    vi.spyOn(fs, 'appendFileSync').mockImplementationOnce(() => {
      throw new Error('EACCES');
    });
    expect(() => log.write('ERROR', 'x', 'lost')).not.toThrow();
  });
});

describe('mirrorConsole', () => {
  it('copies warn/error into the log and still prints them', () => {
    const log = new CrashLog(dir);
    const warn = vi.fn();
    const error = vi.fn();
    const target = { warn, error };
    mirrorConsole(log, target);
    target.warn('[atrium:x] careful', 1);
    target.error(new Error('bad'));
    expect(warn).toHaveBeenCalledWith('[atrium:x] careful', 1);
    expect(error).toHaveBeenCalledOnce();
    const text = read();
    expect(text).toContain('WARN  [console] [atrium:x] careful 1');
    expect(text).toContain('ERROR [console] Error: bad');
  });
});
