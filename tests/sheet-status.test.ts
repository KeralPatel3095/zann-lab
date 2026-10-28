import { describe, expect, it } from "vitest";
import { sheetStatus } from "../src/lib/labels";

describe("tracker status wording", () => {
  it("treats scheduled as finished, packing as ready to pack, and returns from Streamline or Argen as in production", () => {
    expect(sheetStatus("Scheduled", "delivered")).toEqual({ text: "Finished", tone: "delivered" });
    expect(sheetStatus("Packing", "ready_for_dispatch")).toEqual({ text: "Ready to pack", tone: "ready_for_dispatch" });
    expect(sheetStatus("In Lab", "in_production")).toEqual({ text: "In lab", tone: "in_production" });
    expect(sheetStatus("Back from Streamline", "in_production").text).toBe("Back from Streamline");
    expect(sheetStatus("Back from Argen", "in_production").tone).toBe("in_production");
  });
});
