import type * as THREE from 'three';
import type { QualityManager, QualityMode } from '../core/quality';

const REFRESH_MS = 250;

/** F3 overlay: FPS, frame time, draw calls, triangles, quality, IST time + quality selector. */
export class DebugPanel {
  private readonly el = document.getElementById('debug')!;
  private readonly text = document.getElementById('debug-text')!;
  private accMs = 0;
  private cpuMs = 0;
  private frames = 0;

  constructor(quality: QualityManager) {
    const select = document.getElementById('quality-mode') as HTMLSelectElement;
    select.value = quality.mode;
    select.addEventListener('change', () => {
      quality.setMode(select.value as QualityMode);
      select.blur(); // give keys back to the game
    });
  }

  toggle() {
    this.el.style.display = this.el.style.display === 'block' ? 'none' : 'block';
  }

  /**
   * Call once per frame after rendering. cpuMs = main-thread time spent in our frame
   * (FPS is vsync-capped, so this shows real headroom). extra = more "label: value" lines.
   */
  update(frameMs: number, cpuMs: number, renderer: THREE.WebGLRenderer, extra: Record<string, string>) {
    this.accMs += frameMs;
    this.cpuMs += cpuMs;
    this.frames++;
    if (this.accMs < REFRESH_MS || this.el.style.display !== 'block') return;
    const avg = this.accMs / this.frames;
    const cpu = this.cpuMs / this.frames;
    this.accMs = this.cpuMs = this.frames = 0;
    const { calls, triangles } = renderer.info.render;
    const rows: Record<string, string> = {
      FPS: (1000 / avg).toFixed(0),
      frame: `${avg.toFixed(1)} ms`,
      cpu: `${cpu.toFixed(2)} ms`,
      'draw calls': `${calls}`,
      triangles: triangles.toLocaleString(),
      ...extra,
    };
    this.text.textContent = Object.entries(rows).map(([k, v]) => `${k.padEnd(11)}${v}`).join('\n');
  }
}
