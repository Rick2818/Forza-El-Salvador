import * as THREE from "three";
import { Track } from "./track";
import { NightSky } from "./nightSky";
import { Sky } from "three/addons/objects/Sky.js";
import { MonzonScenery } from "./monzonScenery";
import { createSuzakaMountain, installSuzakaScenery } from "./suzakaScenery";
import { deg } from "../core/mathx";
import { TerrainField } from "./terrain";

/**
 * Night-time circuit surroundings: starry dome, analytic moon, layered ridge
 * silhouettes and trackside markers. Everything is procedural; no external
 * meshes or textures. The forest was removed so the circuit reads as an open
 * raceway rather than a forest.
 */
export class Environment {
  readonly moon: THREE.DirectionalLight;
  readonly moonDirection = new THREE.Vector3();
  readonly terrain: TerrainField;
  private readonly sky: NightSky | null;
  private readonly shadowSize = 34;
  private time = 0;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer, track: Track) {
    const isMonzon = track.circuit.id === "monzon";
    const isSuzaka = track.circuit.id === "suzaka";
    const isDaylight = isMonzon || isSuzaka;
    this.moonDirection.setFromSphericalCoords(1, deg(isDaylight ? 90 - 53 : 90 - 25), deg(208));

    if (isDaylight) {
      // Clear daytime skies for the two user-approved international circuits.
      this.sky = null;
      const daylight = new Sky();
      daylight.scale.setScalar(7000);
      daylight.material.uniforms["turbidity"].value = 3.5;
      daylight.material.uniforms["rayleigh"].value = 2.2;
      daylight.material.uniforms["mieCoefficient"].value = 0.005;
      daylight.material.uniforms["mieDirectionalG"].value = 0.85;
      daylight.material.uniforms["sunPosition"].value.copy(this.moonDirection);
      scene.add(daylight);
      // Bake one static daylight reflection map for realistic PBR car paint.
      const pmrem = new THREE.PMREMGenerator(renderer);
      const reflectionScene = new THREE.Scene();
      const reflectionSky = new Sky();
      reflectionSky.scale.setScalar(7000);
      for (const key of ["turbidity", "rayleigh", "mieCoefficient", "mieDirectionalG"]) {
        reflectionSky.material.uniforms[key].value = daylight.material.uniforms[key].value;
      }
      reflectionSky.material.uniforms["sunPosition"].value.copy(this.moonDirection);
      reflectionScene.add(reflectionSky);
      scene.environment = pmrem.fromScene(reflectionScene, 0, 1, 16000).texture;
      scene.environmentIntensity = 1.1;
      pmrem.dispose();
      scene.background = new THREE.Color(0x9cc7e8);
      scene.fog = new THREE.FogExp2(0xb7cddd, 0.00025);
    } else {
      this.sky = new NightSky(this.moonDirection);
      this.sky.setPixelRatio(renderer.getPixelRatio());
      this.sky.addTo(scene);
      scene.background = new THREE.Color(0x03060d);
      scene.environment = this.sky.bakeEnvironment(renderer);
      scene.environmentIntensity = 1.25;
      scene.fog = new THREE.FogExp2(0x0b1626, 0.00105);
    }

    this.moon = new THREE.DirectionalLight(isDaylight ? 0xfff3dc : 0xa8c2ff, isDaylight ? 2.9 : 3.15);
    this.moon.castShadow = true;
    this.moon.shadow.mapSize.set(2048, 2048);
    this.moon.shadow.camera.near = 1;
    this.moon.shadow.camera.far = 260;
    this.moon.shadow.camera.left = -this.shadowSize;
    this.moon.shadow.camera.right = this.shadowSize;
    this.moon.shadow.camera.top = this.shadowSize;
    this.moon.shadow.camera.bottom = -this.shadowSize;
    this.moon.shadow.bias = -0.0006;
    this.moon.shadow.normalBias = 0.04;
    this.moon.position.copy(this.moonDirection).multiplyScalar(140);
    scene.add(this.moon);
    scene.add(this.moon.target);
    if (isDaylight) {
      scene.add(new THREE.HemisphereLight(0xc4e2ff, 0x55694b, 2.0));
      scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    } else {
      scene.add(new THREE.HemisphereLight(0x2b4d82, 0x04060a, 1.05));
      scene.add(new THREE.AmbientLight(0x101d33, 0.45));
      const fill = new THREE.DirectionalLight(0x8fb6ff, 0.55);
      fill.position.set(-0.42, 0.55, -0.72);
      scene.add(fill);
    }

    // ---- Terrain. One shared height field feeds the mesh and the props.
    this.terrain = new TerrainField(track);
    scene.add(this.terrain.buildMesh());

    if (isMonzon) {
      scene.add(new MonzonScenery(track, this.terrain).group);
    } else if (isSuzaka) {
      scene.add(createSuzakaMountain());
      // Load only editable Blender landmarks. The driveable surface and all
      // physical guardrails are generated in Track so physics always matches.
      void installSuzakaScenery(scene).catch(error => {
        console.warn("[Horizon] Suzaka scenery could not load; track remains playable", error);
      });
    } else {
      this.buildRidges(scene);
    }
  }

  setPixelRatio(ratio: number): void {
    this.sky?.setPixelRatio(ratio);
  }

  /** Follow the player with the sky dome and the shadow frustum. */
  update(center: THREE.Vector3, dt: number): void {
    this.time += dt;
    this.sky?.update(center, this.time);
    this.moon.position.copy(center).addScaledVector(this.moonDirection, 140);
    this.moon.target.position.copy(center);
    this.moon.target.updateMatrixWorld();
  }

  private buildRidges(scene: THREE.Scene): void {
    const layers = [
      { radius: 900, maxH: 150, seed: 11, color: 0x162234 },
      { radius: 1300, maxH: 210, seed: 33, color: 0x111a29 },
      { radius: 620, maxH: 95, seed: 77, color: 0x1b2740 }
    ];

    for (const layer of layers) {
      const segments = 180;
      const baseY = -40;
      const positions: number[] = [];
      const indices: number[] = [];

      for (let i = 0; i <= segments; i++) {
        const idx = i % segments;
        const angle = (idx / segments) * Math.PI * 2;
        const x = Math.cos(angle) * layer.radius;
        const z = Math.sin(angle) * layer.radius;
        const h =
          layer.maxH *
          (0.45 +
            0.3 * Math.sin(angle * 3 + layer.seed) +
            0.15 * Math.sin(angle * 7 + layer.seed * 2) +
            0.1 * Math.sin(angle * 13 + layer.seed * 3));
        // bottom vertex then top vertex
        positions.push(x, baseY, z);
        positions.push(x, Math.max(2, h), z);
      }

      for (let i = 0; i < segments; i++) {
        const b0 = i * 2;
        const t0 = i * 2 + 1;
        const b1 = (i + 1) * 2;
        const t1 = (i + 1) * 2 + 1;
        indices.push(b0, b1, t1);
        indices.push(b0, t1, t0);
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();

      const material = new THREE.MeshLambertMaterial({
        color: layer.color,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(geo, material);
      mesh.name = `ridge-${layer.seed}`;
      mesh.frustumCulled = false;
      mesh.receiveShadow = false;
      scene.add(mesh);
    }
  }
}
