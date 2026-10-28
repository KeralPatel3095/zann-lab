import { describe, expect, it } from "vitest";
import { productTone } from "../src/components/case-marks";

const products = [
  "Nightguard",
  "Crown",
  "Denture",
  "Repair/Reline",
  "Essix",
  "Remake",
  "Implant",
  "Bridge",
  "Models",
  "Ortho",
  "Post/Core",
  "Veneer",
  "Custom Trays",
  "Bleach Trays",
  "Wax Up",
  "NTI",
  "Dual Leminate",
  "Gold Crown",
  "Flipper",
  "Sports Mouthguards",
  "Space Maintainer",
];

describe("product colors", () => {
  it("gives every tracker product a different color", () => {
    const colors = products.map((name) => productTone(name).background);
    expect(new Set(colors).size).toBe(products.length);
  });
});
