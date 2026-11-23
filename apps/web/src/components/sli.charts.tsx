'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import dayjs from 'dayjs';
import { fetcher } from '@reliability/web/lib/fetcher';
import { SliChart } from '@reliability/web/components/sli.chart';

type Series = {
  metric: string;
  points: Array<{ ts: string; value: number; release: string | null; runId: string | null }>;
};

const META: Record<string, { title: string; unit: string; scale: number }> = {
  publish_success: { title: 'Publish success rate per run', unit: '%', scale: 100 },
  publish_latency_ms: { title: 'Publish latency', unit: 's', scale: 1 / 1000 },
  scheduling_lateness_ms: { title: 'Scheduling lateness', unit: 's', scale: 1 / 1000 },
  run_duration_ms: { title: 'Run duration', unit: 'min', scale: 1 / 60000 },
};

const useSlis = (days: number) =>
  useSWR<Series[]>(`/api/slis?days=${days}`, fetcher, { refreshInterval: 60000 });

// Success is one point per publishing scenario, shown as the rate of each run
const toChart = (series: Series) => {
  const { scale } = META[series.metric];
  const rows =
    series.metric === 'publish_success'
      ? Object.values(
          series.points.reduce<Record<string, { ts: string; values: number[] }>>((acc, p) => {
            const key = p.runId || p.ts;
            acc[key] = acc[key] || { ts: p.ts, values: [] };
            acc[key].values.push(p.value);
            return acc;
          }, {})
        ).map((r) => ({ ts: r.ts, value: r.values.reduce((a, b) => a + b, 0) / r.values.length }))
      : series.points;
  return {
    labels: rows.map((r) => dayjs(r.ts).format('MM-DD HH:mm')),
    values: rows.map((r) => Math.round(r.value * scale * 100) / 100),
  };
};

const SliCard = ({ series }: { series: Series }) => {
  const { labels, values } = useMemo(() => toChart(series), [series]);
  const meta = META[series.metric];
  const latest = values[values.length - 1];
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex items-baseline gap-2">
        <h3 className="font-semibold">{meta.title}</h3>
        <span className="text-neutral-400">
          {values.length ? `latest ${latest}${meta.unit}, ${values.length} points` : 'no data yet'}
        </span>
      </div>
      <div className="h-48">
        {values.length ? (
          <SliChart label={`${meta.title} (${meta.unit})`} labels={labels} values={values} />
        ) : (
          <div className="flex h-full items-center justify-center text-neutral-600">No data points</div>
        )}
      </div>
    </section>
  );
};

export const SliCharts = () => {
  const [days, setDays] = useState(30);
  const { data, error } = useSlis(days);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-neutral-400">Range</span>
        {[1, 7, 30, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`rounded px-2 py-1 ${d === days ? 'bg-neutral-700' : 'bg-neutral-900'}`}
          >
            {d}d
          </button>
        ))}
      </div>
      {!!error && <div className="text-red-400">{error.message}</div>}
      {!data && !error && <div className="text-neutral-400">Loading SLIs...</div>}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {data?.map((series) => <SliCard key={series.metric} series={series} />)}
      </div>
    </div>
  );
};
