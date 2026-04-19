#!/usr/bin/env node
/**
 * Cross-platform test:e2e runner.
 * Sets ATRIUM_E2E=1 before building, then runs Playwright.
 * Uses npx to resolve local devDep binaries on all platforms.
 */
import { execSync } from 'node:child_process';

const env = { ...process.env, ATRIUM_E2E: '1' };
const opts = { stdio: 'inherit', env };

execSync('npx electron-vite build', opts);
execSync('npx playwright test', opts);
