#!/usr/bin/env node
/**
 * Fake claude binary for E2E testing.
 *
 * Behaviour:
 *   --version → prints a semver string and exits 0
 *   anything else → prints HELLO_ATRIUM, then waits until killed
 */
'use strict';

const args = process.argv.slice(2);

if (args[0] === '--version') {
  process.stdout.write('1.0.0-e2e\r\n');
  process.exit(0);
}

if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) {
  process.stdout.write(
    JSON.stringify([{ id: 'architector@getleverage', version: '1.0.0-e2e', enabled: true, scope: 'user' }]) + '\n',
  );
  process.exit(0);
}

// For skill invocations: emit the sentinel and block until SIGTERM/SIGINT.
process.stdout.write('HELLO_ATRIUM\r\n');

// Keep the process alive so the terminal manager sees it as active.
// Node exits when the signal arrives.
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));

// On Windows, node-pty kills via TerminateProcess which won't send signals —
// just keep the event loop alive and the OS will clean up.
setInterval(() => {}, 60_000);
