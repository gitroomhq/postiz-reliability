import { RunDetail } from '@reliability/web/components/run.detail';

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RunDetail id={id} />;
}
