import * as THREE from "three";
import { SETTINGS } from "../core/settings";
import { clamp, damp } from "../core/mathx";
import type { Vehicle } from "../vehicle/vehicle";

export type CameraMode = "chase" | "hood" | "wide";

const MODE_ORDER: CameraMode[] = ["chase", "hood", "wide"];

const _forward = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _look = new THREE.Vector3();
const _position = new THREE.Vector3();
const _curve = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/** Three modes share the same physics vehicle and world camera. */
export const CAMERA_LABELS: Record<CameraMode, string> = {
  chase: "3ª persona · persecución",
  hood: "1ª persona · piloto",
  wide: "3ª persona · panorámica"
};

export class ChaseCamera {
  mode: CameraMode = "chase";
  private position = new THREE.Vector3();
  private lookAt = new THREE.Vector3();
  private initialized = false;
  private shakeSeed = Math.random() * 100;

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  toggle(): CameraMode {
    const next = (MODE_ORDER.indexOf(this.mode) + 1) % MODE_ORDER.length;
    this.setMode(MODE_ORDER[next]);
    return this.mode;
  }

  setMode(mode: CameraMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    // Never blend from the old side of the car: the old camera lag looked detached.
    this.snap();
  }

  snap(): void {
    this.initialized = false;
  }

  update(dt: number, vehicle: Vehicle, time: number, constrain?: (position: THREE.Vector3) => void, roadAhead?: THREE.Vector3): void {
    const t = vehicle.body.translation();
    const pos = _position.set(t.x, t.y, t.z);
    _quat.set(vehicle.body.rotation().x, vehicle.body.rotation().y, vehicle.body.rotation().z, vehicle.body.rotation().w);
    _forward.set(0, 0, 1).applyQuaternion(_quat);
    _forward.y = 0;
    if (_forward.lengthSq() < 0.0001) _forward.set(0, 0, 1);
    _forward.normalize();

    const speed = Math.abs(vehicle.speed);
    const cameraSettings = SETTINGS.camera;

    if (this.mode === "hood") {
      // Driver-eye view follows the SAME Rapier chassis in both tracks.
      // The eye sits forward of the embedded pilot's visor, avoiding an opaque helmet.
      _right.set(_forward.z, 0, -_forward.x);
      _desired.copy(pos).addScaledVector(_forward, .21)
        .addScaledVector(_right, -.24).addScaledVector(_up, .46);
      _look.copy(_desired).addScaledVector(_forward, 25);
      _look.y += .05;
    } else if (this.mode === "wide") {
      // Panoramic: further back, lower, and aimed above the roof so the sky
      // and the star field stay in frame.
      const distance = 9.4 + clamp(speed * 0.02, 0, 0.9);
      _desired.copy(pos).addScaledVector(_forward, -distance);
      _desired.y+=1.25;
      _look.copy(pos).addScaledVector(_forward, 5.5);
      _look.y += 3.4;
    } else {
      const distance = cameraSettings.distance + clamp(speed * 0.0025, 0, 0.18);
      const height = cameraSettings.height + clamp(speed * 0.002, 0, 0.10);
      _desired.copy(pos).addScaledVector(_forward, -distance);
      _desired.y+=height;
      // Show the sidewall that the rear bumper hides in a straight-on view.
      _desired.x += _forward.z * cameraSettings.lateralOffset;
      _desired.z -= _forward.x * cameraSettings.lateralOffset;
      _look.copy(pos).addScaledVector(_forward, cameraSettings.lookAhead + speed * 0.007);
      _look.y += 0.4;
      // Anticipate the road without pulling the close chase away from the car.
      // Ignore a route behind the driver while reversing or recovering.
      if (roadAhead && speed>8) {
        _curve.copy(roadAhead).sub(pos);_curve.y=0;_curve.normalize();
        if (_curve.dot(_forward)>.2) {
          const lateral=clamp(_curve.x*_forward.z-_curve.z*_forward.x,-.65,.65)*clamp(speed/35,0,1)*1.8;
          _look.x+=_forward.z*lateral;_look.z-=_forward.x*lateral;
        }
      }

      const shake = clamp((speed - 45) / 45, 0, 1) * 0.035;
      if (shake > 0) {
        _desired.x += Math.sin(time * 31 + this.shakeSeed) * shake;
        _desired.y += Math.sin(time * 43 + this.shakeSeed * 2) * shake * 0.6;
      }
    }

    _desired.y = Math.max(_desired.y, 0.8);

    if (!this.initialized) {
      this.position.copy(_desired);
      this.lookAt.copy(_look);
      this.initialized = true;
    } else {
      const posLag = this.mode === "hood" ? 26 : this.mode === "wide" ? 5.5 : 7.5;
      const lookLag = this.mode === "hood" ? 22 : this.mode === "wide" ? 9 : 11;
      this.position.x = damp(this.position.x, _desired.x, posLag, dt);
      this.position.y = damp(this.position.y, _desired.y, posLag, dt);
      this.position.z = damp(this.position.z, _desired.z, posLag, dt);
      this.lookAt.x = damp(this.lookAt.x, _look.x, lookLag, dt);
      this.lookAt.y = damp(this.lookAt.y, _look.y, lookLag, dt);
      this.lookAt.z = damp(this.lookAt.z, _look.z, lookLag, dt);
    }

    if (this.mode !== "hood") constrain?.(this.position);
    this.camera.position.copy(this.position);
    this.camera.lookAt(this.lookAt);

    const targetFov =
      cameraSettings.fov + clamp(speed / 95, 0, 1) * (cameraSettings.fovMax - cameraSettings.fov);
    const fov = this.mode === "hood" ? 68 : this.mode === "wide" ? 76 : targetFov;
    this.camera.fov = damp(this.camera.fov, fov, 4, dt);
    this.camera.updateProjectionMatrix();
  }

  menuOrbit(dt: number, center: THREE.Vector3, time: number): void {
    const radius = 6.2;
    const angle = time * 0.22;
    this.camera.position.set(
      center.x + Math.cos(angle) * radius,
      center.y + 3.1 + Math.sin(time * 0.35) * 0.4,
      center.z + Math.sin(angle) * radius
    );
    this.camera.lookAt(center.x, center.y + 0.55, center.z);
    this.camera.fov = damp(this.camera.fov, 45, 4, dt);
    this.camera.updateProjectionMatrix();
  }
}
