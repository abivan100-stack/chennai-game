/**
 * Adaptive quality. Pure logic (no three.js imports) so scripts/check.ts can run it in Node.
 * main.ts applies settings via onChange.
 *
 * Step-down order: render resolution -> shadows -> effects. Step-up is the reverse.
 */

export type ShadowLevel = 0 | 1 | 2; // off, 1024, 2048
export const SHADOW_MAP_SIZES = [0, 1024, 2048] as const;

export interface QualitySettings {
  resScale: number; // multiplier on the capped pixel ratio
  shadows: ShadowLevel;
  effects: boolean; // currently: atmospheric sky + clouds. Later: post-processing.
}

export type QualityMode = 'auto' | 'low' | 'medium' | 'high';

export const PRESETS: Record<Exclude<QualityMode, 'auto'>, QualitySettings> = {
  low: { resScale: 0.6, shadows: 0, effects: false },
  medium: { resScale: 0.8, shadows: 1, effects: true },
  high: { resScale: 1, shadows: 2, effects: true },
};

const RES_MIN = 0.5;
const RES_MAX = 1;
const RES_STEP = 0.1;
const WINDOW_MS = 2000;
const SLOW_MS = 33; // below 30 fps -> step down
// "Well below 16 ms" can't be observed on a 60 Hz screen: rAF is vsync-capped at ~16.7 ms.
// So step up when we're holding a steady 60 fps (avg under 18 ms).
const FAST_MS = 18;
const UP_COOLDOWN_MS = 20000; // after a step down, don't climb straight back into the slow level
const HITCH_MS = 250; // ignore background-tab gaps and shader-compile hitches

const round = (x: number) => Math.round(x * 100) / 100;

export function stepDown(s: QualitySettings): QualitySettings | null {
  if (s.resScale > RES_MIN) return { ...s, resScale: round(Math.max(RES_MIN, s.resScale - RES_STEP)) };
  if (s.shadows > 0) return { ...s, shadows: (s.shadows - 1) as ShadowLevel };
  if (s.effects) return { ...s, effects: false };
  return null;
}

export function stepUp(s: QualitySettings): QualitySettings | null {
  if (!s.effects) return { ...s, effects: true };
  if (s.shadows < 2) return { ...s, shadows: (s.shadows + 1) as ShadowLevel };
  if (s.resScale < RES_MAX) return { ...s, resScale: round(Math.min(RES_MAX, s.resScale + RES_STEP)) };
  return null;
}

export function describe(s: QualitySettings) {
  const shadows = s.shadows ? `${SHADOW_MAP_SIZES[s.shadows]}` : 'off';
  return `res ${Math.round(s.resScale * 100)}% | shadows ${shadows} | effects ${s.effects ? 'on' : 'off'}`;
}

export class QualityManager {
  mode: QualityMode = 'auto';
  settings: QualitySettings = { ...PRESETS.medium };
  onChange: (s: QualitySettings) => void = () => {};

  private sumMs = 0;
  private frames = 0;
  private clockMs = 0;
  private upBlockedUntil = 0;

  setMode(mode: QualityMode) {
    this.mode = mode;
    this.sumMs = this.frames = 0;
    if (mode === 'auto') console.log('[quality] auto mode on');
    else this.apply({ ...PRESETS[mode] }, `manual ${mode}`);
  }

  /** Feed one frame's duration in ms. */
  sample(frameMs: number) {
    if (frameMs > HITCH_MS) return;
    this.clockMs += frameMs;
    this.sumMs += frameMs;
    this.frames++;
    if (this.mode !== 'auto' || this.sumMs < WINDOW_MS) return;

    const avg = this.sumMs / this.frames;
    this.sumMs = this.frames = 0;

    if (avg > SLOW_MS) {
      const next = stepDown(this.settings);
      if (!next) return;
      this.upBlockedUntil = this.clockMs + UP_COOLDOWN_MS;
      this.apply(next, `avg ${avg.toFixed(1)} ms > ${SLOW_MS} ms, stepping down`);
    } else if (avg < FAST_MS && this.clockMs >= this.upBlockedUntil) {
      const next = stepUp(this.settings);
      if (next) this.apply(next, `avg ${avg.toFixed(1)} ms < ${FAST_MS} ms, stepping up`);
    }
  }

  label() {
    return `${this.mode} | ${describe(this.settings)}`;
  }

  private apply(s: QualitySettings, why: string) {
    this.settings = s;
    console.log(`[quality] ${why} -> ${describe(s)}`);
    this.onChange(s);
  }
}
