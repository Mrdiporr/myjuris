/** Keep saved duration when an archive page has not loaded or restored a local timer. */
export function resolveSessionDuration(
  recorderDuration: number,
  restoredDuration: number,
  savedDuration: number,
): number {
  const activeDuration = recorderDuration > 0 ? recorderDuration : restoredDuration;
  const duration = activeDuration > 0 ? activeDuration : savedDuration;
  return Number.isFinite(duration) ? Math.max(0, duration) : 0;
}