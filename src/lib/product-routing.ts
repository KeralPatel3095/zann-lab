import type { Actor } from "./privacy";

/** Bench ownership by product family. Emails match seeded technician accounts. */
export const PRODUCT_OWNERS = {
  negar: "negar.qureshi@zann-lab.test",
  zoca: "zoca.bogdanovic@zann-lab.test",
  ned: "ned.bogdanovic@zann-lab.test",
} as const;

/**
 * Nightguard / sportsguard / bleaching / ortho → Negar
 * Crown / bridge → Zoca
 * Denture / gold crown → Ned
 */
export function ownerEmailForCaseType(caseType: string | null | undefined): string | null {
  const text = (caseType ?? "").trim().toLowerCase();
  if (!text) return null;

  if (/gold\s*crown/.test(text)) return PRODUCT_OWNERS.ned;
  if (/denture|partial|repair\s*\/?\s*reline|reline|flipper/.test(text)) return PRODUCT_OWNERS.ned;

  if (/crown_bridge|bridge|veneer|post\s*\/\s*core|(^|[^a-z])crown([^a-z]|$)/.test(text) && !/gold/.test(text)) {
    return PRODUCT_OWNERS.zoca;
  }

  if (
    /night\s*guard|ng design|nti|sports|mouth\s*guard|bleach|bleaching|essix|ortho|lingual|space\s*maintainer|custom\s*trays?|dual\s*lem/.test(
      text,
    )
  ) {
    return PRODUCT_OWNERS.negar;
  }

  return null;
}

/** Admins see every product. Technicians see their routed products plus unrouted types. */
export function canViewCaseType(actor: Pick<Actor, "email" | "role">, caseType: string | null | undefined) {
  if (actor.role !== "technician") return true;
  const owner = ownerEmailForCaseType(caseType);
  if (!owner) return true;
  return (actor.email ?? "").trim().toLowerCase() === owner;
}

export const technicianDepartments: Record<string, string> = {
  [PRODUCT_OWNERS.negar]: "Nightguards and Sports Guards",
  [PRODUCT_OWNERS.zoca]: "Crowns and Bridges",
  [PRODUCT_OWNERS.ned]: "Dentures, Partials, and Repairs",
};
