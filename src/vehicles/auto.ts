import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GeoBuilder } from '../world/geo';
import { plateTexture } from './plates';

// ---- Driving feel ---------------------------------------------------------------------------
const MAX_SPEED = 18; // m/s (~65 km/h; autos in Chennai traffic are quick)
const MAX_REVERSE = 4;
const ENGINE_FORCE = 1250; // N per rear wheel
const BRAKE = 12;
const HANDBRAKE = 30;
const ROLLING_BRAKE = 0.6; // engine braking when off the throttle
const STEER_LOW_SPEED = 0.6; // rad, full lock at walking pace
const STEER_HIGH_SPEED = 0.18; // rad, at top speed (keeps it from flipping)
const STEER_RATE = 3; // how fast the handlebar turns, rad/s

// ---- Geometry / physics layout (model space: ground at y = 0, front = +z) -------------------
const MASS = 380;
const BODY_Y = 0.6; // physics body origin height above the model origin
const WHEEL_RADIUS = 0.21;
const SUSPENSION_REST = 0.3;
const STIFFNESS = 40;
/** Expected static compression, so wheels sit where the model draws them. */
const SAG = 9.81 / (3 * STIFFNESS);
const WHEELS = [
  { x: 0, z: 0.98, steer: true, drive: false },
  { x: 0.6, z: -0.8, steer: false, drive: true },
  { x: -0.6, z: -0.8, steer: false, drive: true },
];
/**
 * Driver's hip position (model space) while seated. Measured against the Mixamo "Driving" pose:
 * hands land 0.23 m above / 0.27 m ahead of the hips (on the handlebar), feet 0.5 m below (on the floor).
 */
export const SEAT = new THREE.Vector3(0, 0.97, 0.33);
/** Where you stand to climb in, per side (+1 = model +x side), level with the seat. */
export const ENTRY_OFFSET = { x: 1.0, z: SEAT.z };
/** Passenger's hip position on the rear bench (model space). */
export const BENCH = new THREE.Vector3(0, 1.1, -0.84);

/**
 * Chennai auto rickshaw: detailed procedural model + Rapier raycast-vehicle physics
 * (1 steered front wheel, 2 driven rear wheels). Drive with `control()`, then `update()`
 * before each physics step and `sync()` once per frame.
 */
export class AutoRickshaw {
  readonly group = new THREE.Group();
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  private readonly vehicle: RAPIER.DynamicRayCastVehicleController;
  private readonly wheelMeshes: THREE.Object3D[] = [];
  private readonly headlight: THREE.MeshStandardMaterial;
  private readonly tail: THREE.MeshStandardMaterial;
  private steer = 0;
  private readonly prevPos = new THREE.Vector3();
  private readonly currPos = new THREE.Vector3();
  private readonly prevRot = new THREE.Quaternion();
  private readonly currRot = new THREE.Quaternion();
  private readonly bodyOffset = new THREE.Vector3();
  private captured = false;
  private throttle = 0;
  private handbrake = true;

  constructor(scene: THREE.Scene, world: RAPIER.World, position: THREE.Vector3, heading = 0) {
    const { headlight, tail, wheels } = buildAutoModel(this.group);
    this.wheelMeshes.push(...wheels);
    this.headlight = headlight;
    this.tail = tail;
    this.group.position.copy(position);
    this.group.rotation.y = heading;
    scene.add(this.group);

    const q = this.group.quaternion;
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y + BODY_Y, position.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        // Mass set by hand with a low centre of mass so the three-wheeler doesn't tip.
        .setAdditionalMassProperties(MASS, { x: 0, y: -0.25, z: -0.1 }, { x: 230, y: 250, z: 80 }, { x: 0, y: 0, z: 0, w: 1 })
        .setLinearDamping(0.1)
        .setAngularDamping(0.8)
        .setCanSleep(false),
    );
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.64, 0.72, 1.3).setTranslation(0, 1.17 - BODY_Y, -0.05).setDensity(0).setFriction(0.3),
      this.body,
    );

    this.vehicle = world.createVehicleController(this.body);
    this.vehicle.indexUpAxis = 1;
    this.vehicle.setIndexForwardAxis = 2;
    WHEELS.forEach((w, i) => {
      const hardpointY = WHEEL_RADIUS + SUSPENSION_REST - SAG - BODY_Y;
      this.vehicle.addWheel({ x: w.x, y: hardpointY, z: w.z }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, SUSPENSION_REST, WHEEL_RADIUS);
      this.vehicle.setWheelSuspensionStiffness(i, STIFFNESS);
      this.vehicle.setWheelSuspensionCompression(i, 4);
      this.vehicle.setWheelSuspensionRelaxation(i, 5);
      this.vehicle.setWheelMaxSuspensionTravel(i, 0.2);
      this.vehicle.setWheelMaxSuspensionForce(i, 20000);
      this.vehicle.setWheelFrictionSlip(i, 3);
      this.vehicle.setWheelSideFrictionStiffness(i, 1.2);
    });
  }

  /** Signed forward speed, m/s. */
  get speed() {
    return this.vehicle.currentVehicleSpeed();
  }

  /** throttle: -1 (brake / reverse) .. 1; steer: -1 (right) .. 1 (left). */
  control(throttle: number, steer: number, handbrake: boolean) {
    this.throttle = throttle;
    this.handbrake = handbrake;
    this.steerInput = steer;
  }

  /** Engine off, handbrake on (parked / driver getting out). */
  park() {
    this.control(0, 0, true);
  }

  private steerInput = 0;

  /** Call before each physics step. */
  update(dt: number) {
    const v = this.speed;
    const t = Math.min(Math.abs(v) / MAX_SPEED, 1);
    const maxSteer = STEER_LOW_SPEED + (STEER_HIGH_SPEED - STEER_LOW_SPEED) * t;
    const target = this.steerInput * maxSteer;
    this.steer += THREE.MathUtils.clamp(target - this.steer, -STEER_RATE * dt, STEER_RATE * dt);

    let engine = 0;
    let brake = 0;
    if (this.throttle > 0) {
      if (v < -0.5) brake = BRAKE;
      else engine = ENGINE_FORCE * this.throttle * (1 - Math.min(Math.max(v, 0) / MAX_SPEED, 1));
    } else if (this.throttle < 0) {
      if (v > 0.5) brake = BRAKE;
      else engine = v > -MAX_REVERSE ? -ENGINE_FORCE * 0.6 : 0;
    } else {
      brake = ROLLING_BRAKE;
    }
    WHEELS.forEach((w, i) => {
      if (w.steer) this.vehicle.setWheelSteering(i, this.steer);
      this.vehicle.setWheelEngineForce(i, w.drive ? engine : 0);
      this.vehicle.setWheelBrake(i, this.handbrake ? HANDBRAKE : brake);
    });
    this.vehicle.updateVehicle(dt);
  }

  /** Record the body pose after each physics step (for interpolation). */
  capture() {
    this.prevPos.copy(this.currPos);
    this.prevRot.copy(this.currRot);
    const p = this.body.translation();
    const r = this.body.rotation();
    this.currPos.set(p.x, p.y, p.z);
    this.currRot.set(r.x, r.y, r.z, r.w);
    if (!this.captured) {
      this.prevPos.copy(this.currPos);
      this.prevRot.copy(this.currRot);
      this.captured = true;
    }
  }

  /**
   * Copy physics to the model, spin/steer wheels. Call once per frame after stepping.
   * alpha (0..1): how far between the last two physics steps this frame is. Blending the two
   * poses removes the stutter of a 60 Hz simulation on a faster (or uneven) display.
   */
  sync(night: number, alpha = 1) {
    this.group.quaternion.slerpQuaternions(this.prevRot, this.currRot, alpha);
    this.group.position.lerpVectors(this.prevPos, this.currPos, alpha).sub(this.bodyOffset.set(0, BODY_Y, 0).applyQuaternion(this.group.quaternion));
    WHEELS.forEach((w, i) => {
      const mesh = this.wheelMeshes[i];
      const len = this.vehicle.wheelSuspensionLength(i) ?? SUSPENSION_REST;
      mesh.position.set(w.x, WHEEL_RADIUS + SUSPENSION_REST - SAG - len, w.z);
      mesh.rotation.set(this.vehicle.wheelRotation(i) ?? 0, w.steer ? (this.vehicle.wheelSteering(i) ?? 0) : 0, 0, 'YXZ');
    });
    this.headlight.emissiveIntensity = this.handbrake ? night * 0.3 : 0.5 + night * 2.5;
    this.tail.emissiveIntensity = this.throttle < 0 ? 3 : 0.4 + night;
  }

  /** Horizontal distance check from a world point (e.g. the player). */
  isNear(p: THREE.Vector3, radius: number) {
    const a = this.group.position;
    return Math.hypot(p.x - a.x, p.z - a.z) < radius;
  }

  /** Heading (yaw) of the auto in world space. */
  get heading() {
    const f = new THREE.Vector3(0, 0, 1).applyQuaternion(this.group.quaternion);
    return Math.atan2(f.x, f.z);
  }

  // ---------------------------------------------------------------------------------------
}

/**
 * Build the auto rickshaw's meshes into `group` (model space: ground y = 0, front +z).
 * Shared by the player's auto and traffic autos. Returns the parts that animate.
 */
export function buildAutoModel(group: THREE.Group, plateText = 'TN 09 AK 4521') {
const wheels: THREE.Object3D[] = [];
  const yellow = new THREE.MeshStandardMaterial({ color: 0xf5c400, roughness: 0.38, metalness: 0.15 });
  const black = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.85 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd0d4d8, roughness: 0.25, metalness: 0.9 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fc4d6, roughness: 0.05, transparent: true, opacity: 0.28, depthWrite: false });
  const seat = new THREE.MeshStandardMaterial({ color: 0x4a1418, roughness: 0.7 });
  const headlight = new THREE.MeshStandardMaterial({ color: 0xfffbe8, emissive: 0xfff0c0, emissiveIntensity: 0 });
  const tail = new THREE.MeshStandardMaterial({ color: 0xa00000, emissive: 0xff2000, emissiveIntensity: 0.4 });
  const amber = new THREE.MeshStandardMaterial({ color: 0xff9800, emissive: 0x803000, emissiveIntensity: 0.3 });
  const plate = new THREE.MeshStandardMaterial({ map: plateTexture(plateText, 'commercial'), roughness: 0.5 });

  const rb = (w: number, h: number, d: number, r: number, x: number, y: number, z: number, rx = 0) =>
    new RoundedBoxGeometry(w, h, d, 3, r).rotateX(rx).translate(x, y, z);
  const bx = (w: number, h: number, d: number, x: number, y: number, z: number, rx = 0) =>
    new THREE.BoxGeometry(w, h, d).rotateX(rx).translate(x, y, z);
  const rod = (from: THREE.Vector3, to: THREE.Vector3, r: number) => {
    const len = from.distanceTo(to);
    const g = new THREE.CylinderGeometry(r, r, len, 6);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    return g.applyQuaternion(q).translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
  };
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  const parts: [THREE.BufferGeometry[], THREE.Material][] = [
    [[
      rb(1.32, 0.52, 1.15, 0.1, 0, 0.72, -0.7), // rear passenger tub
      rb(0.8, 1.0, 0.32, 0.1, 0, 0.86, 1.08, -0.12), // front cowl
      rb(0.22, 0.12, 0.6, 0.05, 0, 0.5, 0.98), // front mudguard
      bx(0.04, 0.26, 0.85, 0.61, 0.56, 0.28), // side skirts
      bx(0.04, 0.26, 0.85, -0.61, 0.56, 0.28),
      rb(1.4, 0.05, 0.12, 0.02, 0, 1.79, 0.9), // yellow canopy lip at the front
    ], yellow],
    [[
      bx(1.2, 0.1, 2.3, 0, 0.42, -0.05), // floor pan
      rb(1.42, 0.09, 2.1, 0.04, 0, 1.84, -0.15), // canvas roof
      rb(1.36, 0.78, 0.06, 0.03, 0, 1.43, -1.24), // rear canvas wall
      bx(0.04, 0.5, 0.62, 0.69, 1.55, -0.92), // rear side flaps
      bx(0.04, 0.5, 0.62, -0.69, 1.55, -0.92),
      rb(0.74, 0.1, 0.26, 0.03, 0, 1.33, 0.98), // dashboard
      bx(1.1, 0.06, 0.06, 0, 1.79, 0.98), // windscreen top bar
      rod(V(0.55, 1.3, 1.05), V(0.62, 1.8, 0.95), 0.025), // front pillars
      rod(V(-0.55, 1.3, 1.05), V(-0.62, 1.8, 0.95), 0.025),
      rod(V(0.66, 0.95, -0.22), V(0.68, 1.82, -0.22), 0.025), // middle pillars
      rod(V(-0.66, 0.95, -0.22), V(-0.68, 1.82, -0.22), 0.025),
      rod(V(0, 0.95, 0.95), V(0, 1.23, 0.6), 0.03), // steering column
      rod(V(0.17, 1.25, 0.6), V(0.3, 1.26, 0.59), 0.032), // grips (where the Driving pose's hands are)
      rod(V(-0.17, 1.25, 0.6), V(-0.3, 1.26, 0.59), 0.032),
    ], black],
    [[
      rod(V(-0.31, 1.25, 0.6), V(0.31, 1.25, 0.6), 0.018), // handlebar
      rb(0.62, 0.05, 0.05, 0.02, 0, 0.62, 1.29), // front bumper
      rb(1.3, 0.05, 0.05, 0.02, 0, 0.5, -1.33), // rear bumper
    ], chrome],
    [[bx(1.08, 0.5, 0.015, 0, 1.55, 1.0, -0.2)], glass],
    [[
      rb(0.5, 0.12, 0.42, 0.05, 0, 0.82, 0.36), // driver seat
      rb(0.5, 0.3, 0.08, 0.04, 0, 1.02, 0.12, -0.15), // driver backrest
      rb(1.18, 0.14, 0.46, 0.06, 0, 1.04, -0.78), // passenger bench
      rb(1.18, 0.46, 0.1, 0.05, 0, 1.33, -1.13, -0.1), // bench backrest
    ], seat],
    [[new THREE.CylinderGeometry(0.09, 0.09, 0.08, 16).rotateX(Math.PI / 2).translate(0, 1.08, 1.26)], headlight],
    [[bx(0.12, 0.08, 0.03, 0.55, 0.75, -1.29), bx(0.12, 0.08, 0.03, -0.55, 0.75, -1.29)], tail],
    [[bx(0.07, 0.05, 0.03, 0.3, 1.22, 1.24), bx(0.07, 0.05, 0.03, -0.3, 1.22, 1.24)], amber],
    [[bx(0.34, 0.11, 0.01, 0, 0.66, 1.27, -0.12), bx(0.34, 0.11, 0.01, 0, 0.66, -1.3).rotateY(Math.PI).translate(0, 0, -2.6)], plate],
  ];
  for (const [geos, mat] of parts) {
    const mesh = new THREE.Mesh(mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g))), mat);
    mesh.castShadow = mat !== glass;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // Wheels: tyre + hub in one vertex-coloured mesh each (spun/steered every frame).
  const wb = new GeoBuilder();
  const spin = new THREE.Matrix4().makeRotationZ(Math.PI / 2);
  wb.add(new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.13, 16), spin, new THREE.Color(0x111111));
  wb.add(new THREE.CylinderGeometry(0.11, 0.11, 0.14, 8), spin, new THREE.Color(0x9aa0a6));
  const wheelGeo = wb.build();
  const wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  for (const w of WHEELS) {
    const mesh = new THREE.Mesh(wheelGeo, wheelMat);
    mesh.position.set(w.x, WHEEL_RADIUS, w.z);
    mesh.castShadow = true;
    wheels.push(mesh);
    group.add(mesh);
  }
  return { headlight, tail, wheels };
}
