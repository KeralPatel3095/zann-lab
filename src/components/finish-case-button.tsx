import { finishCaseAction } from "@/server/actions";

export function FinishCaseButton({ caseId, returnTo }: { caseId: string; returnTo: string }) {
  return (
    <form action={finishCaseAction}>
      <input type="hidden" name="case_id" value={caseId} />
      <input type="hidden" name="return_to" value={returnTo} />
      <button className="lab-btn lab-btn-compact" type="submit">Finish case</button>
    </form>
  );
}
