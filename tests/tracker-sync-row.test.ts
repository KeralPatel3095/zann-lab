import { describe, expect, it } from "vitest";
import { trackerRowIsCurrent } from "../src/lib/domain/tracker-sync";

describe("tracker row freshness", () => {
  it("leaves a saved row alone", () => {
    expect(
      trackerRowIsCurrent(
        { fingerprint: "abc", dueRaw: "Nov 5" },
        { tracker_fingerprint: "abc", tracker_status: "Delivered", tracker_due: "Nov 5" },
      ),
    ).toBe(true);
  });

  it("writes a row when the sheet status changed", () => {
    expect(
      trackerRowIsCurrent(
        { fingerprint: "new", dueRaw: "Nov 5" },
        { tracker_fingerprint: "old", tracker_status: "Picked Up", tracker_due: "Nov 5" },
      ),
    ).toBe(false);
  });
});
