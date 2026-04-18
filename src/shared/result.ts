/**
 * Result<T, E> — discriminated union for all IPC invoke returns.
 *
 * Two variants:
 *   Ok<T>  — { ok: true,  data: T }
 *   Err<E> — { ok: false, error: { code: E; message: string } }
 *
 * No Electron, Node, or React imports — safe for @shared.
 */

export type Ok<T> = { readonly ok: true; readonly data: T };
export type Err<E> = { readonly ok: false; readonly error: { readonly code: E; readonly message: string } };

export type Result<T, E> = Ok<T> | Err<E>;

/** Construct a successful result. */
export function ok<T>(data: T): Ok<T> {
  return { ok: true, data };
}

/** Construct a failed result. */
export function err<E>(code: E, message: string): Err<E> {
  return { ok: false, error: { code, message } };
}
