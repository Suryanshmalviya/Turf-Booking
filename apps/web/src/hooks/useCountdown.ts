import { useEffect, useState } from 'react';

/**
 * Seconds remaining until `expiresAt`, ticking once a second. Returns `null`
 * when there is no deadline so callers can distinguish "not started" from
 * "counting down" without extra checks.
 */
export function useCountdown(expiresAt: string | undefined): number | null {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!expiresAt) {
      setSecondsLeft(null);
      return undefined;
    }

    const deadline = new Date(expiresAt).getTime();
    if (Number.isNaN(deadline)) {
      setSecondsLeft(null);
      return undefined;
    }

    const update = () => setSecondsLeft(Math.max(0, Math.floor((deadline - Date.now()) / 1000)));
    update();

    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  return secondsLeft;
}