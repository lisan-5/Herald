const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 12 * 60 * 60 * 1000;
const MIN_JITTER = 0.8;
const MAX_JITTER = 1.2;

export function retryDelayMs(attemptNo: number, random = Math.random): number {
  if (!Number.isInteger(attemptNo) || attemptNo < 2) {
    throw new RangeError("attemptNo must be an integer greater than or equal to 2");
  }

  const exponent = attemptNo - 2;
  const baseDelay = Math.min(BASE_DELAY_MS * 4 ** exponent, MAX_DELAY_MS);
  const jitter = MIN_JITTER + random() * (MAX_JITTER - MIN_JITTER);

  return Math.round(baseDelay * jitter);
}

export function nextAttemptAt(now: Date, attemptNo: number, random = Math.random): Date {
  return new Date(now.getTime() + retryDelayMs(attemptNo, random));
}
