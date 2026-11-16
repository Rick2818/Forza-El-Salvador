import * as THREE from "three";
import { createGlowTexture } from "./textures";
import { Track } from "./track";
import { NightSky } from "./nightSky";
import { clamp, deg, makeRng, smoothstep } from "../core/mathx";
import {
  distanceToTrack,
  fbm,
  TERRAIN_CENTER_X,
  TERRAIN_CENTER_Z,
  TerrainField
} from "./terrain";
import { Forest } from "./vegetation";

/**
 * Night-time circuit surroundings: starry dome, analytic moon, layered ridge
 * silhouettes, a real branching forest with alpha-cut foliage and trackside
 * lighting. Everything is procedural; no external meshes or textures.
 */
export class Environment {
  readonly moon: THREE.DirectionalLight;
  readonly moonDirection = new THREE.Vector3();
  readonly terrain: TerrainField;
  readonly forest: Forest;
  private readonly sky: NightSky;
  private readonly shadowSize = 34;
  private time = 0;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer, track: Track) {
    // Moon a little higher than before: the car body and the tree crowns need
    // a readable top light, not only a rim from behind the ridge.
    this.moonDirection.setFromSphericalCoords(1, deg(90 - 25), deg(208));

    this.sky = new NightSky(this.moonDirection);
    this.sky.setPixelRatio(renderer.getPixelRatio());
    this.sky.addTo(scene);

    scene.background = new THREE.Color(0x03060d);
    scene.environment = this.sky.bakeEnvironment(renderer);
    scene.environmentIntensity = 1.25;

    scene.fog = new THREE.FogExp2(0x0b1626, 0.00105);

    // ---- Lighting: cool moonlight + deep blue sky bounce.
    this.moon = new THREE.DirectionalLight(0xa8c2ff, 3.15);
    this.moon.castShadow = true;
    this.moon.shadow.mapSize.set(2048, 2048);
    this.moon.shadow.camera.near = 1;
    this.moon.shadow.camera.far = 240;
    this.moon.shadow.camera.left = -this.shadowSize;
    this.moon.shadow.camera.right = this.shadowSize;
    this.moon.shadow.camera.top = this.shadowSize;
    this.moon.shadow.camera.bottom = -this.shadowSize;
    this.moon.shadow.bias = -0.0006;
    this.moon.shadow.normalBias = 0.04;
    scene.add(this.moon);
    scene.add(this.moon.target);

    scene.add(new THREE.HemisphereLight(0x2b4d82, 0x04060a, 1.05));
    scene.add(new THREE.AmbientLight(0x101d33, 0.45));

    // A dim counter-light from the opposite side keeps silhouettes from
    // collapsing into pure black without adding a second shadow map.
    const fill = new THREE.DirectionalLight(0x8fb6ff, 0.55);
    fill.position.set(-0.42, 0.55, -0.72);
    scene.add(fill);

    // ---- Terrain. One shared height field feeds the mesh, the forest and the
    // rocks, so nothing floats above or sinks into the ground.
    this.terrain = new TerrainField(track);
    scene.add(this.terrain.buildMesh());

    // ---- Layered mountain ridges, centred on the circuit.
    this.buildRidges(scene);

    // ---- Forest: 700 trees with near/far LOD. Commented out for urban circuit.
    // this.forest = new Forest(track, this.terrain);
    // scene.add(this.forest.group);

    // ---- Rocks. They sit on the sampled ground instead of a fixed y.
    // const rockGeo = new THREE.DodecahedronGeometry(1.5, 0);
    // const rockCount = 90;
    // const rocks = new THREE.InstancedMesh(
    //   rockGeo,
    //   new THREE.MeshLambertMaterial({ color: 0x252c36, flatShading: true }),
    //   rockCount
    // );
    // const rockRng = makeRng(909);
    // const rm = new THREE.Matrix4();
    // const rq = new THREE.Quaternion();
    // const rs = new THREE.Vector3();
    // for (let i = 0; i < rockCount; i++) {
    //   const f = rockRng() * track.samples.length;
    //   const si = Math.floor(f);
    //   const s = track.samples[si];
    //   const r = track.rights[si];
    //   const side = rockRng() < 0.5 ? -1 : 1;
    //   const lateral = 30 + rockRng() * 260;
    //   const x = s.x + r.x * lateral * side;
    //   const z = s.z + r.z * lateral * side;
    //   if (distanceToTrack(x, z, track, 8) < 26) {
    //     rm.makeScale(0, 0, 0);
    //   } else {
    //     const sc = 0.5 + rockRng() * 2.2;
    //     const y = this.terrain.heightAt(x, z) + sc * 0.22;
    //     rq.setFromEuler(new THREE.Euler(rockRng(), rockRng() * 6.28, rockRng()));
    //     rs.set(sc, sc * 0.62, sc);
    //     rm.compose(new THREE.Vector3(x, y, z), rq, rs);
    //   }
    // }
    // rocks.receiveShadow = false;
    // scene.add(rocks);

    this.buildTracksideDetails(scene, track);
  }

  private buildRidges(scene: THREE.Scene): void {
    const layers = [
      { radius: 900, maxH: 150, seed: 11, tint: 0.55 },
      { radius: 1500, maxH: 200, seed: 33, tint: 0.45 },
      { radius: 600, maxH: 100, seed: 77, tint: 0.35 },
    ];

    for (const layer of layers) {
      const points = [];
      for (let i = 0; i < 100; i++) {
        const angle = (i / 100) * Math.PI * 2;
        const r = layer.radius + layer.tint * Math.random() * 200;
        const h = layer.maxH * Math.random();
        const x = Math.cos(angle) * r;
        const z = Math.sin(angle) * r;
        points.push(new THREE.Vector3(x, h, z));
      }
      const curve = new THREE.CatmullRomCurve3(points, true);
      const material = new THREE.MeshLambertMaterial({ color: layer.tint * 0xffffff });
      const mesh = new THREE.Mesh(curve, material);
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
  }

  private buildTracksideDetails(scene: THREE.Scene, track: Track): void {
    // Trackside props and details can be added here
  }
}