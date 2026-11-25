import * as THREE from 'three';
import { BloomEffect, Effect, EffectComposer, EffectPass, RenderPass, SMAAEffect, SMAAPreset, VignetteEffect } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { GRADE_GLSL } from './renderer';

/**
 * Post-processing (quality `post` level 1 or 2; 0 = plain renderer.render with the grade in the
 * materials). Level 1: bloom + colour grade + vignette + SMAA, merged into ONE full-screen pass.
 * Level 2 adds ambient occlusion (N8AO, half resolution): soft contact shadows in every corner,
 * under eaves, round feet and wheels, which the town's flat lighting lacks most.
 * None of it re-renders the scene, so the CPU-bound draw-call budget is untouched; it is GPU only.
 */
const BLOOM_INTENSITY = 0.75;
/** Bloom starts at this brightness after exposure (sunlit white walls are ~3, lamp heads 4-6). */
const BLOOM_THRESHOLD = 4;
const BLOOM_SMOOTHING = 1.2;
/** Mip levels of the bloom blur: fewer = tighter glow, cheaper. */
const BLOOM_LEVELS = 5;
const AO_RADIUS = 1.6; // m
const AO_FALLOFF = 0.6; // m
const AO_INTENSITY = 2.2;
const VIGNETTE_DARKNESS = 0.42;

class GradeEffect extends Effect {
  constructor() {
    super(
      'GradeEffect',
      `uniform float exposure;
      ${GRADE_GLSL}
      void mainImage( const in vec4 inputColor, const in vec2 uv, out vec4 outputColor ) {
        outputColor = vec4( gradeColor( inputColor.rgb, exposure ), inputColor.a );
      }`,
      { uniforms: new Map([['exposure', new THREE.Uniform(0.6)]]) },
    );
  }
}

export class PostFx {
  /** 0 = off, 1 = bloom + grade + SMAA, 2 = + ambient occlusion. */
  level = 0;
  private readonly composer: EffectComposer;
  private readonly ao: N8AOPostPass;
  private readonly bloom: BloomEffect;
  private readonly grade = new GradeEffect();
  private readonly renderer: THREE.WebGLRenderer;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.renderer = renderer;
    this.composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
    this.composer.addPass(new RenderPass(scene, camera));

    this.ao = new N8AOPostPass(scene, camera, innerWidth, innerHeight);
    // Its transparency mode renders the scene twice more (draw calls are what we're short of).
    this.ao.autoDetectTransparency = false;
    const c = this.ao.configuration;
    c.transparencyAware = false;
    c.gammaCorrection = false; // the grade pass after it writes the output
    c.halfRes = true;
    c.aoRadius = AO_RADIUS;
    c.distanceFalloff = AO_FALLOFF;
    c.intensity = AO_INTENSITY;
    this.ao.setQualityMode('Performance'); // 8 samples: fine at half res, cheapest
    this.composer.addPass(this.ao);

    this.bloom = new BloomEffect({ mipmapBlur: true, intensity: BLOOM_INTENSITY, luminanceThreshold: BLOOM_THRESHOLD, luminanceSmoothing: BLOOM_SMOOTHING, radius: 0.7, levels: BLOOM_LEVELS });
    const vignette = new VignetteEffect({ offset: 0.32, darkness: VIGNETTE_DARKNESS });
    const smaa = new SMAAEffect({ preset: SMAAPreset.MEDIUM });
    this.composer.addPass(new EffectPass(camera, smaa, this.bloom, this.grade, vignette));
  }

  setLevel(level: number) {
    this.level = level;
    this.ao.enabled = level >= 2;
  }

  /** Call after the renderer's size or pixel ratio changes. */
  resize() {
    this.composer.setSize(innerWidth, innerHeight, false);
  }

  render(dt: number) {
    const exposure = this.renderer.toneMappingExposure;
    (this.grade.uniforms.get('exposure') as THREE.Uniform).value = exposure;
    // Threshold in exposed brightness, so day and night bloom alike: day exposure is lower.
    this.bloom.luminanceMaterial.threshold = (BLOOM_THRESHOLD * 0.6) / exposure;
    this.composer.render(dt);
  }
}
