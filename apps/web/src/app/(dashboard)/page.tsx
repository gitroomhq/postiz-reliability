import Link from 'next/link';
import { StateControls } from '@reliability/web/components/state.controls';
import { CurrentRun } from '@reliability/web/components/current.run';
import { RunsTable } from '@reliability/web/components/runs.table';

export default function HomePage() {
  return (
    <>
      <StateControls />
      <div className="flex flex-col gap-2">
        <h2 className="font-semibold">Current run</h2>
        <CurrentRun />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold">Recent runs</h2>
          <Link href="/runs" className="text-blue-400">
            All runs
          </Link>
        </div>
        <RunsTable limit={10} />
      </div>
    </>
  );
}
