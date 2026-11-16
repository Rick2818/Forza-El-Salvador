import * as THREE from "three";
import { makeRng } from "../core/mathx";

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3 uZenith;
  uniform vec3 uMid;
  uniform vec3 uHorizon;
  uniform vec3 uGlow;
  uniform vec3 uMoonDir;
  uniform vec3 uMoonColor;
  varying vec3 vDir;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y, -1.0, 1.0);

    vec3 col = mix(uHorizon, uMid, smoothstep(-0.04, 0.22, h));
    col = mix(col, uZenith, smoothstep(0.18, 0.86, h));

    // Low city glow hugging the horizon.
    float band = pow(clamp(1.0 - abs(h) * 5.2, 0.0, 1.0), 3.0);
    col += uGlow * band * 0.40;

    // Faint Milky Way band, tilted across the sky.
    float mw = exp(-pow((d.y - 0.26 + 0.22 * d.x) * 5.5, 2.0));
    col += vec3(0.038, 0.046, 0.074) * mw * smoothstep(-0.04, 0.3, h);

    // Moon disc and halo, drawn analytically (crisp at any resolution).
    vec3 md = normalize(uMoonDir);
    float cosA = dot(d, md);
    float disc = smoothstep(0.99955, 0.99978, cosA);
    float halo = pow(max(cosA, 0.0), 220.0) * 0.55 + pow(max(cosA, 0.0), 18.0) * 0.07;
    col += uMoonColor * disc * 2.0;
    col += uMoonColor * halo;

    // Dither to keep the large gradient free of banding.
    float n = hash21(gl_FragCoord.xy) - 0.5;
    col += n * 0.006;

    gl_FragColor = vec4(col, 1.0);
  }
`;

const STAR_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute float aBright;
  attribute vec3 aTint;
  uniform float uTime;
  uniform float uScale;
  varying float vAlpha;
  varying vec3 vTint;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uScale;
    vAlpha = (0.62 + 0.38 * sin(uTime * 1.35 + aPhase)) * aBright;
    vTint = aTint;
  }
`;

const STAR_FRAGMENT = /* glsl */ `
  precision mediump float;
  varying float vAlpha;
  varying vec3 vTint;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float a = smoothstep(0.5, 0.02, d);
    gl_FragColor = vec4(vTint, a * vAlpha);
  }
`;

export class NightSky {
  readonly group = new THREE.Group();
  private readonly dome: THREE.Mesh;
  private readonly skyMaterial: THREE.ShaderMaterial;
  private readonly starMaterial: THREE.ShaderMaterial;
  private readonly stars: THREE.Points;

  constructor(readonly moonDirection: THREE.Vector3) {
    this.skyMaterial = new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      uniforms: {
        uZenith: { value: new THREE.Color(0x03050d) },
        uMid: { value: new THREE.Color(0x081128) },
        uHorizon: { value: new THREE.Color(0x16294a) },
        uGlow: { value: new THREE.Color(0x4a2330) },
        uMoonDir: { value: moonDirection.clone() },
        uMoonColor: { value: new THREE.Color(0xdfe8ff) }
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false
    });

    this.dome = new THREE.Mesh(new THREE.SphereGeometry(7000, 40, 24), this.skyMaterial);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);

    // ---- Star field: an even layer plus a denser Milky Way band.
    const rng = makeRng(20260114);
    const FIELD = 3600;
    const BAND = 2400;
    const count = FIELD + BAND;
    const radius = 5600;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const bright = new Float32Array(count);
    const tints = new Float32Array(count * 3);

    const place = (i: number, az: number, el: number, size: number, b: number, warm: boolean): void => {
      const ce = Math.cos(el);
      positions[i * 3] = Math.cos(az) * ce * radius;
      positions[i * 3 + 1] = Math.sin(el) * radius;
      positions[i * 3 + 2] = Math.sin(az) * ce * radius;
      sizes[i] = size;
      bright[i] = b;
      phases[i] = rng() * Math.PI * 2;
      const t = warm ? 1 : 0;
      tints[i * 3] = 0.82 + 0.16 * t;
      tints[i * 3 + 1] = 0.87 + 0.05 * t;
      tints[i * 3 + 2] = 1.0 - 0.18 * t;
    };

    let i = 0;
    for (; i < FIELD; i++) {
      const az = rng() * Math.PI * 2;
      // Bias towards the upper hemisphere but keep a few near the horizon.
      const el = Math.asin(rng() * 0.985 + 0.015);
      place(i, az, el, 0.9 + Math.pow(rng(), 3.0) * 3.0, 0.55 + rng() * 0.45, rng() < 0.14);
    }
    for (; i < count; i++) {
      let az = 0;
      let el = 0;
      // Rejection sample the same band the dome shader paints.
      for (let guard = 0; guard < 32; guard++) {
        az = rng() * Math.PI * 2;
        el = rng() * 1.45 - 0.3;
        const dx = Math.cos(az) * Math.cos(el);
        const dy = Math.sin(el);
        if (Math.abs(dy - (0.26 - 0.22 * dx)) < 0.2) break;
      }
      place(i, az, el, 0.55 + Math.pow(rng(), 3.0) * 1.3, 0.22 + rng() * 0.38, rng() < 0.1);
    }

    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    starGeo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    starGeo.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    starGeo.setAttribute("aBright", new THREE.BufferAttribute(bright, 1));
    starGeo.setAttribute("aTint", new THREE.BufferAttribute(tints, 3));
    this.starMaterial = new THREE.ShaderMaterial({
      vertexShader: STAR_VERTEX,
      fragmentShader: STAR_FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uScale: { value: 1 }
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false
    });
    this.stars = new THREE.Points(starGeo, this.starMaterial);
    this.stars.renderOrder = -9;
    this.stars.frustumCulled = false;
    this.group.add(this.stars);
  }

  addTo(scene: THREE.Scene): void {
    scene.add(this.group);
  }

  setPixelRatio(ratio: number): void {
    this.starMaterial.uniforms.uScale.value = Math.max(0.6, ratio) * 1.15;
  }

  update(center: THREE.Vector3, time: number): void {
    this.group.position.copy(center);
    this.starMaterial.uniforms.uTime.value = time;
  }

  /** Bake the dome into a PMREM environment map for the PBR car paint. */
  bakeEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const envScene = new THREE.Scene();
    const clone = new THREE.Mesh(this.dome.geometry, this.skyMaterial);
    clone.frustumCulled = false;
    envScene.add(clone);
    const target = pmrem.fromScene(envScene, 0, 1, 16000);
    pmrem.dispose();
    return target.texture;
  }
}
