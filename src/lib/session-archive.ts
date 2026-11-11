/** Keep saved duration when an archive page has not loaded or restored a local timer. */
export function resolveSessionDuration(
  recorderDuration: number,
  restoredDuration: number,
  savedDuration: number,
): number {
  return Math.max(0, recorderDuration, restoredDuration, savedDuration);
}