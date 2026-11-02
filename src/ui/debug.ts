import type * as THREE from 'three';
import type { QualityManager, QualityMode } from '../core/quality';

const REFRESH_MS = 250;

/** F3 overlay: FPS, frame time, draw calls, triangles, quality, IST time + quality selector. */
export class DebugPanel {
  private readonly el = document.getElementById('debug')!;
  private readonly text = document.getElementById('debug-text')!;
  private accMs = 0;
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

  /** Call once per frame after rendering. */
  update(frameMs: number, renderer: THREE.WebGLRenderer, quality: string, clock: string, pos: THREE.Vector3) {
    this.accMs += frameMs;
    this.frames++;
    if (this.accMs < REFRESH_MS || this.el.style.display !== 'block') return;
    const avg = this.accMs / this.frames;
    this.accMs = this.frames = 0;
    const { calls, triangles } = renderer.info.render;
    this.text.textContent = [
      `FPS        ${(1000 / avg).toFixed(0)}`,
      `frame      ${avg.toFixed(1)} ms`,
      `draw calls ${calls}`,
      `triangles  ${triangles.toLocaleString()}`,
      `quality    ${quality}`,
      `time       ${clock}`,
      `position   ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`,
    ].join('\n');
  }
}
