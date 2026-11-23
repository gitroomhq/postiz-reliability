import { RunsTable } from '@reliability/web/components/runs.table';

export default function RunsPage() {
  return (
    <>
      <h2 className="font-semibold">Run history</h2>
      <RunsTable limit={200} />
    </>
  );
}
