export default function LabLoading() {
  return (
    <div className="grid gap-4 p-1" aria-busy="true" aria-live="polite">
      <div className="h-8 w-40 animate-pulse rounded bg-zinc-200" />
      <div className="h-4 w-64 animate-pulse rounded bg-zinc-100" />
      <div className="lab-card mt-2 h-48 animate-pulse rounded bg-zinc-50" />
    </div>
  );
}
