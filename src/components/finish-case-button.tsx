import { finishCaseAction, undoFinishCaseAction } from "@/server/actions";

export function FinishCaseButton({ caseId, returnTo }: { caseId: string; returnTo: string }) {
  return (
    <form action={finishCaseAction}>
      <input type="hidden" name="case_id" value={caseId} />
      <input type="hidden" name="return_to" value={returnTo} />
      <button className="lab-btn lab-btn-compact lab-btn-finish" type="submit">Finish case</button>
    </form>
  );
}

export function UndoFinishButton({ caseId }: { caseId: string }) {
  return (
    <form action={undoFinishCaseAction}>
      <input type="hidden" name="case_id" value={caseId} />
      <button className="lab-btn lab-btn-compact lab-btn-undo" type="submit">Delete</button>
    </form>
  );
}
