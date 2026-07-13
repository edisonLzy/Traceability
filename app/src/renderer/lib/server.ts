/**
 * Backend server address, read from the `VITE_SERVER_URL` env var at build time.
 *
 * There is no hardcoded fallback: if the var is unset, `SERVER_URL` is `''` and
 * the first request fails fast (visible at startup) rather than silently hitting
 * a wrong default. Auth is intentionally absent in the MVP - this is purely a
 * transport target.
 */
export const SERVER_URL = (import.meta.env.VITE_SERVER_URL ?? '').replace(/\/$/, '')
