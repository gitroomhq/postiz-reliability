import { Context } from '@temporalio/activity';

const HEARTBEAT_INTERVAL = 15_000;

const DETAILS = Symbol.for('reliability.heartbeatDetails');

const readDetails = (ctx: any) => ctx[DETAILS];

export const setHeartbeatDetails = (details: string) => {
  try {
    const ctx = Context.current() as any;
    ctx[DETAILS] = details;
  } catch (err) {
    /**empty - not inside an activity**/
  }
};

export const withHeartbeat = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    const ctx = Context.current() as any;
    setHeartbeatDetails(`${ctx.info?.activityType || 'activity'}: entered`);
  } catch (err) {
    /**empty**/
  }

  let logged = false;
  const interval = setInterval(() => {
    try {
      const ctx = Context.current() as any;
      ctx.heartbeat(readDetails(ctx));
    } catch (err) {
      if (!logged) {
        logged = true;
        console.error('withHeartbeat: heartbeat failed', err);
      }
    }
  }, HEARTBEAT_INTERVAL);

  try {
    return await fn();
  } finally {
    clearInterval(interval);
  }
};
