import { defineSignal } from '@temporalio/workflow';

export const runNowSignal = defineSignal<[{ actor: string }]>('runNow');
export const pauseSignal = defineSignal<[{ actor: string; reason?: string }]>(
  'pause'
);
export const resumeSignal = defineSignal<[{ actor: string; reason: string }]>(
  'resume'
);
