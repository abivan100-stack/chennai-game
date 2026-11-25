// n8ao ships no types; only what core/post.ts uses.
declare module 'n8ao' {
  import type { Pass } from 'postprocessing';
  import type { Camera, Scene } from 'three';
  export class N8AOPostPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number);
    autoDetectTransparency: boolean;
    configuration: {
      transparencyAware: boolean;
      gammaCorrection: boolean;
      halfRes: boolean;
      aoRadius: number;
      distanceFalloff: number;
      intensity: number;
    };
    setQualityMode(mode: 'Performance' | 'Low' | 'Medium' | 'High' | 'Ultra'): void;
  }
}
