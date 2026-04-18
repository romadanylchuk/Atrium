/**
 * Compile-time check — proves that the ambient Window augmentation from
 * src/preload/api.ts is visible in the renderer TypeScript project.
 *
 * Import '@preload/api' purely for its declare global side-effect.
 * No runtime symbols are consumed.
 *
 * A grep for `AtriumAPI` under src/renderer/ must find a hit — this is
 * the grep-visible proof required by the Phase 6 exit criteria.
 */
import type { AtriumAPI } from '@preload/api';

// Type-only position — never executed at runtime.
// If Window['atrium'] is not AtriumAPI the assignment is a compile error.
// Use type assertion to avoid unused-variable lint errors.
type _AtriumCheck = typeof window extends { atrium: AtriumAPI } ? true : false;
// This is a compile-time assertion: the type must be `true` to satisfy the constraint.
const _satisfies: _AtriumCheck = true;
void _satisfies;
