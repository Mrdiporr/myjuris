import { describe, expect, it } from "vitest";
import { resolveSessionDuration } from "@/lib/session-archive";

describe("resolveSessionDuration", () => {
  it("preserves the saved 7-second duration when the archive timer has not loaded", () => {
    expect(resolveSessionDuration(0, 0, 7)).toBe(7);
  });

  it("uses the current 12-second recording duration over an older 7-second saved value", () => {
    expect(resolveSessionDuration(12, 0, 7)).toBe(12);
  });
});