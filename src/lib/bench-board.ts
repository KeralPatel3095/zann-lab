import { PRODUCT_OWNERS, ownerEmailForCaseType } from "./product-routing";

/** Ana, Keral, and Parneet receive finished cases. Other technicians do not. */
const finishedBoardEmails = new Set([
  "keral.patel@zann-lab.test",
  "ana.bogdanovic@zann-lab.test",
  "parneet.kaur@zann-lab.test",
]);

/** Daily production report. Keral and Ana watch the count; Parneet shares the same desk. */
const productionReportEmails = finishedBoardEmails;

export function canMarkBenchFinish(actor: { email: string }) {
  return (actor.email ?? "").trim().toLowerCase() === PRODUCT_OWNERS.negar;
}

/** Only Negar's product family. Crowns, dentures, and unrouted types stay off this action. */
export function caseIsNegarProduct(caseType: string | null | undefined) {
  return ownerEmailForCaseType(caseType) === PRODUCT_OWNERS.negar;
}

export function canSeeFinishedBoard(actor: { email: string }) {
  return finishedBoardEmails.has((actor.email ?? "").trim().toLowerCase());
}

export function canSeeProductionReport(actor: { email: string }) {
  return productionReportEmails.has((actor.email ?? "").trim().toLowerCase());
}

/** Keep redirects inside the app. */
export function safeReturnPath(value: string, fallback: string) {
  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || path.includes("://")) return fallback;
  return path.slice(0, 200);
}

export function withNotice(path: string, notice: string) {
  const join = path.includes("?") ? "&" : "?";
  return `${path}${join}notice=${encodeURIComponent(notice)}`;
}
