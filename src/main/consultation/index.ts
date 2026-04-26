/**
 * Barrel export for src/main/consultation/.
 *
 * Consumers:
 *   import { ConsultationService, registerConsultationHandlers } from '@main/consultation';
 */

export { ConsultationService } from './consultationService.js';
export type {
  ConsultationServiceDeps,
  ConsultationStorageDeps,
} from './consultationService.js';
export { registerConsultationHandlers } from '@main/ipc/consultation';
