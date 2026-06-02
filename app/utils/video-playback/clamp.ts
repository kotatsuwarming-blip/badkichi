export function clampMs(ms: number, durationMs: number | null): number {
  if (ms < 0) {
    return 0
  }
  if (durationMs !== null && ms > durationMs) {
    return durationMs
  }
  return ms
}
