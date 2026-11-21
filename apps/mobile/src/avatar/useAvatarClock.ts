import { useEffect, useRef, useState } from 'react';
import { FrameRateGovernor } from '@anime/scene-engine';

/**
 * Drives avatar animation at ~30 fps with requestAnimationFrame and feeds the frame-rate
 * governor. Returns the current time (ms) and the measured fps.
 */
export function useAvatarClock(opts: { running: boolean; fps?: number; onSlow?: () => void }) {
  const { running, fps = 30, onSlow } = opts;
  const [now, setNow] = useState(0);
  const [measured, setMeasured] = useState<number | null>(null);
  const start = useRef<number | null>(null);
  const governor = useRef(new FrameRateGovernor());
  const onSlowRef = useRef(onSlow);
  onSlowRef.current = onSlow;

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = 0;
    const minGap = 1000 / fps - 2;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last < minGap) return;
      last = t;
      start.current ??= t;
      setNow(t - start.current);
      if (governor.current.tick(t)) onSlowRef.current?.();
      const f = governor.current.lastFps;
      if (f !== null) setMeasured((m) => (m === f ? m : f));
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, fps]);

  return { now, fps: measured };
}
