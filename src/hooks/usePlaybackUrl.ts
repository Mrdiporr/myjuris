import { useEffect, useState } from "react";

/**
 * Contract:
 *   Responsibility: manage a single audio playback URL for the session, preferring
 *     the signed URL from cloud storage over a locally-created Object URL from a
 *     fresh recording blob.
 *   Inputs: `signedUrl` (nullable), `blob` (nullable).
 *   Outputs: a string URL or null.
 *   Side effects: creates and revokes Object URLs.
 *   Guarantees:
 *     - Only one Object URL is ever active for a given blob.
 *     - Object URL is revoked on unmount, blob change, or when a signed URL takes over.
 *     - Never leaks memory across recording cycles.
 *   Does NOT: render controls, manage playback state, or perform business logic.
 */
export function usePlaybackUrl(signedUrl: string | null, blob: Blob | null): string | null {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(blob);
    setObjectUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [blob]);

  // Signed URL wins as soon as it exists — no need to keep the Object URL alive.
  return signedUrl ?? objectUrl;
}
