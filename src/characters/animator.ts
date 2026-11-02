import * as THREE from 'three';

const DEFAULT_FADE = 0.2; // seconds

export interface PlayOptions {
  once?: boolean; // play one time and hold the last frame (jumps)
  then?: string; // with once: clip to crossfade to when this one finishes (wave -> idle)
  startAt?: number; // seconds into the clip
  fade?: number;
}

/**
 * AnimationMixer wrapper: named clips, crossfades, playback speed.
 * Clips are shared (not copied) between every Animator that uses them.
 */
export class Animator {
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private then = '';
  currentName = '';
  /** Walk/run blend in progress (see locomotion()). */
  private loco: { a: THREE.AnimationAction; b: THREE.AnimationAction } | null = null;
  private locoIn = 1;

  constructor(root: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(root);
    for (const clip of clips) this.actions.set(clip.name, this.mixer.clipAction(clip));
    this.mixer.addEventListener('finished', (e) => {
      if (e.action === this.current && this.then) this.play(this.then);
    });
  }

  has(name: string) {
    return this.actions.has(name);
  }

  /** Crossfade to a clip. No-op if it is already playing. */
  play(name: string, opts: PlayOptions = {}) {
    const next = this.actions.get(name);
    if (!next || next === this.current) return;
    if (this.loco) {
      // Leaving the walk/run blend: fade both cycles out together.
      const fade = opts.fade ?? DEFAULT_FADE;
      this.loco.a.fadeOut(fade);
      this.loco.b.fadeOut(fade);
      this.loco = null;
    }
    this.then = opts.then ?? '';
    next.reset();
    next.setLoop(opts.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = !!opts.once;
    next.time = opts.startAt ?? 0;
    next.timeScale = 1;
    const fade = opts.fade ?? DEFAULT_FADE;
    next.fadeIn(fade).play();
    this.current?.fadeOut(fade);
    this.current = next;
    this.currentName = name;
  }

  /**
   * Blend two looping cycles (walk -> run) by weight w (0 = all a, 1 = all b), phase-locked so the
   * feet stay in step while the mix changes. rateA / rateB: each clip's playback speed on its own
   * (matched to ground speed); the shared phase advances at their weighted average.
   */
  locomotion(a: string, b: string, w: number, rateA: number, rateB: number) {
    const A = this.actions.get(a);
    const B = this.actions.get(b);
    if (!A || !B) return;
    if (!this.loco) {
      const fade = DEFAULT_FADE;
      this.current?.fadeOut(fade);
      this.current = null;
      this.currentName = 'locomotion';
      for (const x of [A, B]) {
        x.reset();
        x.setLoop(THREE.LoopRepeat, Infinity);
        x.clampWhenFinished = false;
        x.play();
      }
      this.loco = { a: A, b: B };
      this.locoIn = 0;
    }
    const da = A.getClip().duration;
    const db = B.getClip().duration;
    const cyclesPerSec = (1 - w) * (rateA / da) + w * (rateB / db);
    A.timeScale = cyclesPerSec * da;
    B.timeScale = cyclesPerSec * db;
    A.setEffectiveWeight((1 - w) * this.locoIn);
    B.setEffectiveWeight(w * this.locoIn);
  }

  /** Playback speed of the current clip (e.g. match walk cycle to movement speed). */
  setSpeed(scale: number) {
    if (this.current) this.current.timeScale = scale;
  }

  /** Jump to a random point in the current clip, so crowds don't move in lockstep. */
  randomizePhase() {
    if (this.current) this.current.time = Math.random() * this.current.getClip().duration;
  }

  update(dt: number) {
    if (this.loco) {
      this.locoIn = Math.min(1, this.locoIn + dt / DEFAULT_FADE);
      // Lock run's phase to walk's so both feet land together.
      const { a, b } = this.loco;
      b.time = (a.time / a.getClip().duration) * b.getClip().duration;
    }
    this.mixer.update(dt);
  }
}
