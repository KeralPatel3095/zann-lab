import { describe, expect, it } from "vitest";
import { canViewCaseType, ownerEmailForCaseType, PRODUCT_OWNERS } from "../src/lib/product-routing";

describe("product routing", () => {
  it("sends guards and ortho to Negar", () => {
    expect(ownerEmailForCaseType("Nightguard")).toBe(PRODUCT_OWNERS.negar);
    expect(ownerEmailForCaseType("Sports Mouthguards")).toBe(PRODUCT_OWNERS.negar);
    expect(ownerEmailForCaseType("Bleach Trays")).toBe(PRODUCT_OWNERS.negar);
    expect(ownerEmailForCaseType("Essix")).toBe(PRODUCT_OWNERS.negar);
    expect(ownerEmailForCaseType("Ortho")).toBe(PRODUCT_OWNERS.negar);
  });

  it("sends crowns and bridges to Zoca", () => {
    expect(ownerEmailForCaseType("Crown")).toBe(PRODUCT_OWNERS.zoca);
    expect(ownerEmailForCaseType("Bridge")).toBe(PRODUCT_OWNERS.zoca);
    expect(ownerEmailForCaseType("crown_bridge")).toBe(PRODUCT_OWNERS.zoca);
  });

  it("sends dentures and gold crowns to Ned", () => {
    expect(ownerEmailForCaseType("Denture")).toBe(PRODUCT_OWNERS.ned);
    expect(ownerEmailForCaseType("Gold Crown")).toBe(PRODUCT_OWNERS.ned);
    expect(ownerEmailForCaseType("Repair/Reline")).toBe(PRODUCT_OWNERS.ned);
  });

  it("hides other technicians' products on the board", () => {
    const negar = { email: PRODUCT_OWNERS.negar, role: "technician" as const };
    const zoca = { email: PRODUCT_OWNERS.zoca, role: "technician" as const };
    expect(canViewCaseType(negar, "Nightguard")).toBe(true);
    expect(canViewCaseType(negar, "Crown")).toBe(false);
    expect(canViewCaseType(zoca, "Crown")).toBe(true);
    expect(canViewCaseType({ email: "keral.patel@zann-lab.test", role: "administrator" }, "Crown")).toBe(true);
  });
});
