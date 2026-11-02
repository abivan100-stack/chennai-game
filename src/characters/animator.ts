import * as THREE from 'three';

const DEFAULT_FADE = 0.2; // seconds

export interface PlayOptions {
  once?: boolean; // play one time and hold the last frame (jumps)
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
  currentName = '';

  constructor(root: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(root);
    for (const clip of clips) this.actions.set(clip.name, this.mixer.clipAction(clip));
  }

  /** Crossfade to a clip. No-op if it is already playing. */
  play(name: string, opts: PlayOptions = {}) {
    const next = this.actions.get(name);
    if (!next || next === this.current) return;
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

  /** Playback speed of the current clip (e.g. match walk cycle to movement speed). */
  setSpeed(scale: number) {
    if (this.current) this.current.timeScale = scale;
  }

  /** Jump to a random point in the current clip, so crowds don't move in lockstep. */
  randomizePhase() {
    if (this.current) this.current.time = Math.random() * this.current.getClip().duration;
  }

  update(dt: number) {
    this.mixer.update(dt);
  }
}
