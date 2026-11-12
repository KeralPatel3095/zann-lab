import type { Actor } from "./privacy";

/** Bench ownership by product family. Emails match seeded technician accounts. */
export const PRODUCT_OWNERS = {
  negar: "negar.qureshi@zann-lab.test",
  zoca: "zoca.bogdanovic@zann-lab.test",
  ned: "ned.bogdanovic@zann-lab.test",
} as const;

/** Implant work is shared. Both benches see it; it is not assigned to only one of them. */
const IMPLANT_OWNERS = [PRODUCT_OWNERS.zoca, PRODUCT_OWNERS.ned] as const;

/**
 * Nightguard / sportsguard / bleaching / ortho → Negar
 * Crown / bridge → Zoca
 * Denture / gold crown → Ned
 * Implant → Zoca and Ned
 */
export function ownerEmailsForCaseType(caseType: string | null | undefined): string[] {
  const text = (caseType ?? "").trim().toLowerCase();
  if (!text) return [];
  if (/\bimplants?\b/.test(text)) return [...IMPLANT_OWNERS];
  const owner = exclusiveOwner(text);
  return owner ? [owner] : [];
}

/** Single bench owner. Shared products such as implants return null. */
export function ownerEmailForCaseType(caseType: string | null | undefined): string | null {
  const owners = ownerEmailsForCaseType(caseType);
  return owners.length === 1 ? owners[0] : null;
}

function exclusiveOwner(text: string): string | null {
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

export type BenchTone = "negar" | "zoca" | "ned" | "shared" | "other";

/** Row color for the bench that owns this product. Implants are shared. */
export function benchTone(caseType: string | null | undefined): BenchTone {
  const owners = ownerEmailsForCaseType(caseType);
  if (owners.length > 1) return "shared";
  if (owners[0] === PRODUCT_OWNERS.negar) return "negar";
  if (owners[0] === PRODUCT_OWNERS.zoca) return "zoca";
  if (owners[0] === PRODUCT_OWNERS.ned) return "ned";
  return "other";
}

export function benchRowClass(caseType: string | null | undefined) {
  return `bench-${benchTone(caseType)}`;
}

/** Admins see every product. Technicians see their routed products plus unrouted types. */
export function canViewCaseType(actor: Pick<Actor, "email" | "role">, caseType: string | null | undefined) {
  if (actor.role !== "technician") return true;
  const owners = ownerEmailsForCaseType(caseType);
  if (owners.length === 0) return true;
  return owners.includes((actor.email ?? "").trim().toLowerCase());
}

export const technicianDepartments: Record<string, string> = {
  [PRODUCT_OWNERS.negar]: "Nightguards and Sports Guards",
  [PRODUCT_OWNERS.zoca]: "Crowns and Bridges",
  [PRODUCT_OWNERS.ned]: "Dentures, Partials, and Repairs",
};
