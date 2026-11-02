// Procedural WebAudio: engines, footsteps, city / temple / sea / rain ambience and one-shots.
// No audio files. The graph is built once on unlock(); update() only moves AudioParams.
// Short one-shots (steps, hits, bells, honks) create a few nodes that die after < 3 s.

const MASTER = 0.5;
const MUTE_RAMP = 0.08;   // s time constant for mute / unmute
const SMOOTH = 0.06;      // s time constant for per-frame param moves (no zipper noise)

const ENGINE_VOL = 0.55;
const HUM_VOL = 0.05;
const CROWD_VOL = 0.025;
const SEA_VOL = 0.35;
const RAIN_VOL = 0.22;
const DRONE_VOL = 0.025;
const BELL_VOL = 0.25;
const HONK_VOL = 0.035;
const STEP_VOL = 0.18;

const HONK_MIN = 4, HONK_MAX = 12;   // s between distant honks
const BELL_MIN = 5, BELL_MAX = 10;   // s between temple bells
const SEA_CYCLE = 10;                // s per wave swell

/** Per vehicle kind: oscillator pitch, putt (amplitude chop) rate and depth, lowpass, noise. */
interface EngineParams {
  wave: OscillatorType;
  pitch: number; pitchPerMs: number;
  putt: number; puttPerMs: number; puttMax: number; depth: number;
  cutoff: number; cutoffPerMs: number;
  noise: number; vol: number;
}
const ENGINES: Record<'auto' | 'car' | 'bus' | 'bike' | 'scooter' | 'truck', EngineParams> = {
  // 2-stroke putt-putt: deep chop, ~9 Hz idle up to 30 Hz
  auto:    { wave: 'sawtooth', pitch: 55, pitchPerMs: 3, putt: 9, puttPerMs: 1.4, puttMax: 30, depth: 0.9, cutoff: 700, cutoffPerMs: 40, noise: 0.25, vol: 1 },
  // smooth: chop rate high and shallow so it blurs into a hum
  car:     { wave: 'sawtooth', pitch: 38, pitchPerMs: 2.2, putt: 30, puttPerMs: 3, puttMax: 90, depth: 0.15, cutoff: 350, cutoffPerMs: 25, noise: 0.08, vol: 0.7 },
  bus:     { wave: 'square', pitch: 28, pitchPerMs: 1.2, putt: 11, puttPerMs: 1.2, puttMax: 28, depth: 0.45, cutoff: 260, cutoffPerMs: 12, noise: 0.2, vol: 1 },
  truck:   { wave: 'square', pitch: 26, pitchPerMs: 1.1, putt: 10, puttPerMs: 1.1, puttMax: 26, depth: 0.5, cutoff: 240, cutoffPerMs: 12, noise: 0.25, vol: 1 },
  bike:    { wave: 'sawtooth', pitch: 85, pitchPerMs: 5, putt: 20, puttPerMs: 3, puttMax: 70, depth: 0.55, cutoff: 1400, cutoffPerMs: 60, noise: 0.15, vol: 0.8 },
  scooter: { wave: 'sawtooth', pitch: 110, pitchPerMs: 5, putt: 25, puttPerMs: 3, puttMax: 70, depth: 0.4, cutoff: 1800, cutoffPerMs: 50, noise: 0.15, vol: 0.6 },
};

// inharmonic bell partials (ratio, relative gain, decay s)
const BELL_PARTIALS: readonly (readonly [number, number, number])[] = [
  [1, 1, 2.6], [2.0, 0.6, 1.8], [2.76, 0.5, 1.4], [5.4, 0.3, 0.9], [8.93, 0.15, 0.6],
];

export interface SoundState {
  inVehicle: boolean;      // driving uncle's auto or a stolen vehicle
  vehicleKind: 'auto' | 'car' | 'bus' | 'bike' | 'scooter' | 'truck' | null;
  speed: number;           // vehicle speed m/s when inVehicle, else 0
  throttle: number;        // -1..1 (W/S)
  footSpeed: number;       // on-foot speed m/s (0 when driving or standing)
  nearTemple: number;      // 0..1 (1 = right at the temple)
  nearSea: number;         // 0..1 (1 = on the beach by the water)
  rain: number;            // 0..1 rain intensity
  night: number;           // 0 day .. 1 night (city quieter at night)
}

const rand = (a: number, b: number): number => a + Math.random() * (b - a);
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export class Sound {
  private ctx: AudioContext | null = null;
  private failed = false;
  private _muted = false;
  private master!: GainNode;
  private noise!: AudioBuffer;

  // engine
  private engOsc!: OscillatorNode;
  private engFilter!: BiquadFilterNode;
  private engNoise!: GainNode;
  private engChop!: GainNode;
  private engLfo!: OscillatorNode;
  private engLfoDepth!: GainNode;
  private engOut!: GainNode;
  private engKind: SoundState['vehicleKind'] = null;

  // loops
  private hum!: GainNode;
  private crowd!: GainNode;
  private sea!: GainNode;
  private rain!: GainNode;
  private drone!: GainNode;

  // timers
  private stepPhase = 0;
  private honkIn = rand(HONK_MIN, HONK_MAX);
  private bellIn = 1;
  private seaPhase = 0;
  private crowdPhase = 0;

  get muted(): boolean { return this._muted; }
  set muted(m: boolean) { this.setMuted(m); }

  /** Call from a user gesture (click / pointer lock) — browsers block audio before that. Safe to call repeatedly. */
  unlock(): void {
    if (this.failed) return;
    if (!this.ctx) {
      try {
        const Ctor = window.AudioContext
          ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) { this.failed = true; return; }
        this.ctx = new Ctor();
        this.build(this.ctx);
      } catch (e) {
        console.warn('[sound] audio unavailable', e);
        this.ctx = null;
        this.failed = true;
        return;
      }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => { /* retried on next gesture */ });
  }

  setMuted(m: boolean): void {
    this._muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : MASTER, this.ctx.currentTime, MUTE_RAMP);
  }

  /** Once per frame. */
  update(dt: number, s: SoundState): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;

    // --- engine
    if (s.inVehicle && s.vehicleKind) {
      const p = ENGINES[s.vehicleKind];
      if (s.vehicleKind !== this.engKind) {
        this.engKind = s.vehicleKind;
        this.engOsc.type = p.wave;
        this.engLfoDepth.gain.setValueAtTime(p.depth / 2, t);
        this.engChop.gain.setValueAtTime(1 - p.depth / 2, t);
        this.engNoise.gain.setValueAtTime(p.noise, t);
      }
      const v = Math.abs(s.speed);
      const thr = Math.abs(s.throttle);
      this.engOsc.frequency.setTargetAtTime(p.pitch + p.pitchPerMs * v + thr * p.pitch * 0.25, t, SMOOTH);
      this.engLfo.frequency.setTargetAtTime(Math.min(p.puttMax, p.putt + p.puttPerMs * v + thr * 4), t, SMOOTH);
      this.engFilter.frequency.setTargetAtTime(p.cutoff + p.cutoffPerMs * v + thr * 300, t, SMOOTH);
      this.engOut.gain.setTargetAtTime(ENGINE_VOL * p.vol * (0.7 + 0.3 * thr), t, SMOOTH);
    } else {
      this.engOut.gain.setTargetAtTime(0, t, 0.25);
    }

    // --- footsteps: walk 2 m/s ≈ 1.8 steps/s, run 6 m/s ≈ 2.8
    if (!s.inVehicle && s.footSpeed > 0.3) {
      this.stepPhase += dt * Math.min(3.4, 1.3 + 0.25 * s.footSpeed);
      if (this.stepPhase >= 1) {
        this.stepPhase -= 1;
        const loud = STEP_VOL * Math.min(1, 0.6 + s.footSpeed / 10);
        this.burst(t, 0.06, 'bandpass', rand(500, 900) * (1 + s.rain * 0.8), 1.2, loud, 0.02);
      }
    } else {
      this.stepPhase = 0.6; // first step lands soon after starting to move
    }

    // --- city
    const day = 1 - s.night;
    const away = 1 - 0.7 * Math.max(s.nearSea, s.nearTemple * 0.5);
    this.hum.gain.setTargetAtTime(HUM_VOL * (0.4 + 0.6 * day) * away, t, 0.5);
    this.crowdPhase += dt * 0.13;
    const murmur = 0.7 + 0.3 * Math.sin(this.crowdPhase * Math.PI * 2);
    this.crowd.gain.setTargetAtTime(CROWD_VOL * day * away * murmur, t, 0.5);
    this.honkIn -= dt;
    if (this.honkIn <= 0) {
      this.honkIn = rand(HONK_MIN, HONK_MAX) * (1 + s.night);
      this.honk(t, HONK_VOL * (0.3 + 0.7 * day) * away);
    }

    // --- temple
    this.bellIn -= dt;
    if (this.bellIn <= 0) {
      this.bellIn = rand(BELL_MIN, BELL_MAX);
      if (s.nearTemple > 0.02) this.bell(t, BELL_VOL * s.nearTemple);
    }
    this.drone.gain.setTargetAtTime(DRONE_VOL * clamp01((s.nearTemple - 0.5) * 2), t, 0.6);

    // --- sea: slow swell, asymmetric (quick rise, long wash out)
    this.seaPhase = (this.seaPhase + dt / SEA_CYCLE) % 1;
    const swell = Math.pow(Math.sin(this.seaPhase * Math.PI), 3);
    this.sea.gain.setTargetAtTime(SEA_VOL * s.nearSea * (0.25 + 0.75 * swell), t, 0.3);

    // --- rain
    this.rain.gain.setTargetAtTime(RAIN_VOL * clamp01(s.rain), t, 0.4);
  }

  /** One-shots. */
  hit(kind: 'punch' | 'swing' | 'kick'): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    if (kind === 'swing') {
      // lathi crack: sharp bright snap + a short wooden knock
      this.burst(t, 0.05, 'highpass', 2500, 0.7, 0.9, 0.001);
      this.tone(t, 'triangle', 900, 300, 0.08, 0.35);
    } else {
      // body thud: falling low sine + dull noise
      const f = kind === 'kick' ? 70 : 95;
      this.tone(t, 'sine', f * 1.8, f * 0.5, 0.16, 0.9);
      this.burst(t, 0.09, 'lowpass', kind === 'kick' ? 500 : 800, 0.8, 0.6, 0.002);
    }
  }

  /** Your horn: the auto's two squeaky toots, a car's dual tone, a bus / lorry's deep blare, a bike's beep. */
  horn(kind: 'auto' | 'car' | 'bus' | 'bike' | 'scooter' | 'truck'): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    if (kind === 'auto') {
      for (const dt of [0, 0.2]) {
        this.tone(t + dt, 'square', 620, 590, 0.13, 0.22);
        this.tone(t + dt, 'square', 930, 880, 0.13, 0.08);
      }
    } else if (kind === 'bus' || kind === 'truck') {
      this.tone(t, 'sawtooth', 220, 214, 0.7, 0.26);
      this.tone(t, 'sawtooth', 277, 270, 0.7, 0.2);
    } else if (kind === 'bike' || kind === 'scooter') {
      this.tone(t, 'square', 720, 700, 0.28, 0.18);
    } else {
      this.tone(t, 'square', 415, 410, 0.4, 0.2);
      this.tone(t, 'square', 523, 518, 0.4, 0.16);
    }
  }

  coin(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(t, 'sine', 1318, 1318, 0.25, 0.25);
    this.tone(t + 0.08, 'sine', 1976, 1976, 0.45, 0.25);
    this.tone(t + 0.08, 'sine', 3952, 3952, 0.2, 0.06);
  }

  eat(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) this.burst(t + i * 0.09 + rand(0, 0.02), 0.05, 'bandpass', rand(1200, 2200), 2, 0.3, 0.003);
  }

  splash(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const f = this.burst(t, 0.6, 'lowpass', 3500, 0.8, 0.6, 0.01);
    f.frequency.exponentialRampToValueAtTime(350, t + 0.6);
  }

  door(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(t, 'sine', 160, 80, 0.12, 0.5);
    this.burst(t, 0.03, 'bandpass', 1800, 1.5, 0.35, 0.001);
  }

  // ---------------------------------------------------------------- graph

  private build(ctx: AudioContext): void {
    this.master = ctx.createGain();
    this.master.gain.value = this._muted ? 0 : MASTER;
    this.master.connect(ctx.destination);

    // one shared 2 s white-noise buffer; every noise loop reads it from a different offset
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // engine: osc (+noise) -> lowpass -> chop (gain = base + LFO square) -> out
    this.engOsc = ctx.createOscillator();
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.Q.value = 2;
    this.engNoise = ctx.createGain();
    this.engChop = ctx.createGain();
    this.engLfo = ctx.createOscillator();
    this.engLfo.type = 'square';
    this.engLfoDepth = ctx.createGain();
    this.engOut = ctx.createGain();
    this.engOut.gain.value = 0;
    this.engOsc.connect(this.engFilter);
    this.noiseLoop(ctx, 0.1).connect(this.engNoise).connect(this.engFilter);
    this.engFilter.connect(this.engChop).connect(this.engOut).connect(this.master);
    this.engLfo.connect(this.engLfoDepth).connect(this.engChop.gain);
    this.engOsc.start();
    this.engLfo.start();

    // city hum: brown-ish noise (double lowpass)
    this.hum = this.filteredLoop(ctx, 0.5, 'lowpass', 180, 0.5);
    // crowd murmur: voice band
    this.crowd = this.filteredLoop(ctx, 0.9, 'bandpass', 450, 1.2);
    // sea: lowpassed noise, swell from update()
    this.sea = this.filteredLoop(ctx, 1.3, 'lowpass', 700, 0.6);
    // rain hiss
    this.rain = this.filteredLoop(ctx, 1.7, 'highpass', 3000, 0.5);

    // nadaswaram-ish drone: two detuned reedy oscillators through a nasal bandpass
    this.drone = ctx.createGain();
    this.drone.gain.value = 0;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1100;
    bp.Q.value = 3;
    bp.connect(this.drone).connect(this.master);
    for (const f of [233, 233.9, 349.5]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(bp);
      o.start();
    }

    this.setMuted(this._muted);
  }

  private noiseLoop(ctx: AudioContext, offset: number): AudioBufferSourceNode {
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.start(0, offset);
    return src;
  }

  private filteredLoop(ctx: AudioContext, offset: number, type: BiquadFilterType, freq: number, q: number): GainNode {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    let head: AudioNode = this.noiseLoop(ctx, offset).connect(f);
    if (type === 'lowpass' && freq < 300) {
      // second pole pair darkens white noise towards brown
      const f2 = ctx.createBiquadFilter();
      f2.type = 'lowpass';
      f2.frequency.value = freq;
      head = head.connect(f2);
    }
    head.connect(g).connect(this.master);
    return g;
  }

  // ---------------------------------------------------------------- one-shot helpers

  /** Noise burst through a filter with a fast attack + exponential decay. Returns the filter for sweeps. */
  private burst(t: number, dur: number, type: BiquadFilterType, freq: number, q: number, vol: number, attack: number): BiquadFilterNode {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, rand(0, 1.8));
    src.stop(t + dur + 0.02);
    return f;
  }

  /** Oscillator blip with a pitch glide and exponential decay. */
  private tone(t: number, type: OscillatorType, f0: number, f1: number, dur: number, vol: number, dest: AudioNode = this.master): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private bell(t: number, vol: number): void {
    const base = rand(480, 560);
    for (const [ratio, gain, decay] of BELL_PARTIALS) this.tone(t, 'sine', base * ratio, base * ratio, decay, vol * gain);
  }

  /** Distant horn: two detuned squares, muffled by distance, sometimes a double toot. */
  private honk(t: number, vol: number): void {
    const ctx = this.ctx!;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1200;
    lp.connect(this.master);
    const f = rand(380, 520);
    const n = Math.random() < 0.4 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const at = t + i * 0.28;
      this.tone(at, 'square', f, f, 0.22, vol, lp);
      this.tone(at, 'square', f * 1.26, f * 1.26, 0.22, vol * 0.7, lp);
    }
  }
}
