/** Longest simulated step; stops physics tunnelling after a hitch or a background tab. */
const MAX_DT = 1 / 20;

/**
 * Calls tick once per animation frame.
 * dt = clamped seconds for simulation; frameMs = raw frame time for stats/quality.
 */
export function startLoop(tick: (dt: number, frameMs: number) => void) {
  let last = performance.now();
  const frame = (now: number) => {
    const frameMs = now - last;
    last = now;
    tick(Math.min(frameMs / 1000, MAX_DT), frameMs);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
