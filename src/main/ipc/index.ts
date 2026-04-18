/**
 * index.ts — barrel export for src/main/ipc/.
 *
 * Consumers:
 *   import { registerIpc } from '@main/ipc';
 */

export { registerIpc, __resetRegisteredForTests } from './register';
