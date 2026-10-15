'use client';

import { FC, useEffect, useRef } from 'react';
import DrawChart from 'chart.js/auto';

export const SliChart: FC<{ label: string; labels: string[]; values: number[] }> = ({
  label,
  labels,
  values,
}) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const chart = new DrawChart(ref.current!, {
      type: 'line',
      options: {
        maintainAspectRatio: false,
        responsive: true,
        scales: {
          x: { ticks: { color: '#a3a3a3', maxTicksLimit: 8 }, grid: { color: '#262626' } },
          y: { beginAtZero: true, ticks: { color: '#a3a3a3' }, grid: { color: '#262626' } },
        },
        plugins: { legend: { display: false } },
      },
      data: {
        labels,
        datasets: [{ label, data: values, borderColor: '#60a5fa', backgroundColor: '#60a5fa', tension: 0.2 }],
      },
    });
    return () => {
      chart.destroy();
    };
  }, [label, labels, values]);
  return <canvas className="h-full w-full" ref={ref} />;
};
