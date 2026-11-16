import * as THREE from "three";
import { clamp } from "../core/mathx";
import type { Vehicle } from "../vehicle/vehicle";

/** Lightweight GPU point-based tyre smoke / dust. */
export class SmokeSystem {
  private points: THREE.Points;
  private positions: Float32Array;
  private colors: Float32Array;
  private lives: Float32Array;
  private sizes: Float32Array;
  private velocities: Float32Array;
  private capacity = 420;
  private cursor = 0;
  private wheelPos = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(this.capacity * 3);
    this.colors = new Float32Array(this.capacity * 3);
    this.lives = new Float32Array(this.capacity);
    this.sizes = new Float32Array(this.capacity);
    this.velocities = new Float32Array(this.capacity * 3);
    for (let i = 0; i < this.capacity; i++) {
      this.positions[i * 3 + 1] = -100;
      this.sizes[i] = 1;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(this.colors, 3));
    geo.setAttribute("aLife", new THREE.BufferAttribute(this.lives, 1));
    geo.setAttribute("aSize", new THREE.BufferAttribute(this.sizes, 1));

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute float aLife;
        attribute float aSize;
        attribute vec3 aColor;
        varying float vLife;
        varying vec3 vColor;
        void main() {
          vLife = aLife;
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (260.0 / max(0.001, -mv.z));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying float vLife;
        varying vec3 vColor;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = length(d);
          if (r > 0.5) discard;
          float soft = smoothstep(0.5, 0.08, r);
          gl_FragColor = vec4(vColor, soft * vLife * 0.42);
        }
      `
    });

    this.points = new THREE.Points(geo, material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  private spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, dust: boolean): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.positions[i * 3] = x;
    this.positions[i * 3 + 1] = y;
    this.positions[i * 3 + 2] = z;
    this.velocities[i * 3] = vx;
    this.velocities[i * 3 + 1] = vy;
    this.velocities[i * 3 + 2] = vz;
    this.lives[i] = 1;
    this.sizes[i] = size;
    if (dust) {
      this.colors[i * 3] = 0.62;
      this.colors[i * 3 + 1] = 0.55;
      this.colors[i * 3 + 2] = 0.4;
    } else {
      this.colors[i * 3] = 0.86;
      this.colors[i * 3 + 1] = 0.88;
      this.colors[i * 3 + 2] = 0.9;
    }
  }

  update(dt: number, vehicle: Vehicle, throttle: number): void {
    const slip = vehicle.slip;
    const speed = Math.abs(vehicle.speed);
    const dust = !vehicle.onTrack;
    const intensity = clamp((dust ? speed / 26 : slip / 6) + (vehicle.controls.handbrake ? speed / 30 : 0), 0, 1);

    if (intensity > 0.06 && speed > 2.5) {
      const count = Math.round(intensity * 5);
      for (let w = 2; w < 4; w++) {
        vehicle.visual.wheels[w].spin.getWorldPosition(this.wheelPos);
        for (let n = 0; n < count; n++) {
          const jitter = 0.22;
          this.spawn(
            this.wheelPos.x + (Math.random() - 0.5) * jitter,
            0.14 + Math.random() * 0.1,
            this.wheelPos.z + (Math.random() - 0.5) * jitter,
            (Math.random() - 0.5) * 1.6,
            0.6 + Math.random() * 1.1,
            (Math.random() - 0.5) * 1.6,
            2.2 + Math.random() * 2.4 + (dust ? 1.4 : 0),
            dust
          );
        }
      }
      if (throttle > 0.8 && speed < 12) {
        vehicle.visual.wheels[0].spin.getWorldPosition(this.wheelPos);
        this.spawn(this.wheelPos.x, 0.12, this.wheelPos.z, (Math.random() - 0.5) * 1.2, 0.7, (Math.random() - 0.5) * 1.2, 2.6, false);
      }
    }

    for (let i = 0; i < this.capacity; i++) {
      if (this.lives[i] <= 0) continue;
      this.lives[i] -= dt * 1.35;
      if (this.lives[i] <= 0) {
        this.lives[i] = 0;
        this.positions[i * 3 + 1] = -100;
        continue;
      }
      this.positions[i * 3] += this.velocities[i * 3] * dt;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;
      this.velocities[i * 3] *= 1 - dt * 1.6;
      this.velocities[i * 3 + 1] *= 1 - dt * 0.9;
      this.velocities[i * 3 + 2] *= 1 - dt * 1.6;
      this.sizes[i] += dt * 3.4;
    }

    const geo = this.points.geometry;
    (geo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute("aLife") as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute("aSize") as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute("aColor") as THREE.BufferAttribute).needsUpdate = true;
  }
}
