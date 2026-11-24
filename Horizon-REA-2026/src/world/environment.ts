import { PineForest } from "./pineForest";
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { Track } from "./track";
import { NightSky } from "./nightSky";
import { Sky } from "three/addons/objects/Sky.js";
import { MonzonScenery } from "./monzonScenery";
import { createSuzakaMountain, installSuzakaScenery } from "./suzakaScenery";
import { createSuzakaPublicStands } from "./suzakaPublicStands";
import { createNaturalMountainRange } from "./naturalMountains";
import { installInternationalScenery } from "./internationalScenery";
import { deg } from "../core/mathx";
import { TerrainField } from "./terrain";
import { MonzonGarages } from "./monzonGarages";
import { SuzakaGarages } from "./suzakaGarages";
import { GoodyearBalloon } from "./goodyearBalloon";
import { advanceAudienceAnimation } from "./monzonSpectatorTerraces";
import { createTracksidePartners } from "./tracksidePartners";
import { createRaceTunnels } from "./raceTunnels";
import { TunnelLighting } from "./tunnelLighting";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

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
  private readonly terrainMesh: THREE.Mesh;
  private readonly elevatedTerrain: boolean;
  private readonly sky: NightSky | null;
  private readonly shadowSize = 34;
  private time = 0;
  private forest: PineForest | null = null;
  private garages: MonzonGarages | null = null;
  private suzakaGarages: SuzakaGarages | null = null;
  private balloon: GoodyearBalloon | null = null;
  private readonly trackLights: THREE.PointLight[] = [];
  private readonly tunnelLighting: TunnelLighting;
  private readonly lampPositions: readonly THREE.Vector3[];
  private lightRefresh = 1;
  private readonly pendingAssets: Promise<unknown>[] = [];

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer, track: Track) {
    // One shared neutral PMREM for coachwork. Keep the outdoor sky/lighting
    // unchanged; the almost-disabled blue sky map made approved paint flat.
    const paintEnvironment = new RoomEnvironment();
    const paintPMREM = new THREE.PMREMGenerator(renderer);
    scene.userData.vehicleReflectionEnvironment = paintPMREM.fromScene(paintEnvironment, .04).texture;
    paintEnvironment.dispose(); paintPMREM.dispose();
    this.lampPositions = track.lampPositions;
    const isMonzon = track.circuit.id === "monzon";
    const isSuzaka = track.circuit.id === "suzaka";
    const isSparda = track.circuit.id === "sparda";
    const isSakhir = track.circuit.id === "sakhir-horizon";
    this.elevatedTerrain = isSparda;
    const isDaylight = isSuzaka || isSparda || track.circuit.id === "el-imposible-4x4";
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
      scene.environmentIntensity = isSuzaka ? .008 : .55; // prevent overbright blue sky reflections on car finishes
      pmrem.dispose();
      scene.background = new THREE.Color(0x9cc7e8);
      scene.fog = new THREE.FogExp2(0xb7cddd, 0.00025);
    } else {
      this.sky = new NightSky(this.moonDirection);
      this.sky.setPixelRatio(renderer.getPixelRatio());
      this.sky.addTo(scene);
      scene.background = new THREE.Color(0x03060d);
      scene.environment = this.sky.bakeEnvironment(renderer);
      scene.environmentIntensity = isMonzon ? .5 : 1.25;
      scene.fog = new THREE.FogExp2(0x0b1626, isMonzon ? 0.00055 : 0.00105);
    }

    this.moon = new THREE.DirectionalLight(isDaylight ? 0xfff3dc : isMonzon ? 0xe0e7e9 : 0xa8c2ff, isDaylight ? 1.8 : isMonzon ? 2.2 : 3.15);
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
      scene.add(new THREE.HemisphereLight(0xd8e3f0, 0x55694b, isSuzaka ? .72 : 1.15));
      scene.add(new THREE.AmbientLight(0xffffff, isSuzaka ? .1 : .28));
    } else {
      scene.add(new THREE.HemisphereLight(isMonzon ? 0x9ba8b4 : 0x2b4d82, isMonzon ? 0x242a20 : 0x04060a, isMonzon ? .65 : 1.05));
      scene.add(new THREE.AmbientLight(isMonzon ? 0xc0b6a4 : 0x101d33, isMonzon ? .17 : .45));
      const fill = new THREE.DirectionalLight(isMonzon ? 0xd8e2e8 : 0x8fb6ff, .55);
      fill.position.set(-0.42, 0.55, -0.72);
      scene.add(fill);
    }

    // ---- Terrain. One shared height field feeds the mesh and the props.
    this.terrain = new TerrainField(track);
    this.terrainMesh = this.terrain.buildMesh();
    scene.add(this.terrainMesh);

    // Conceptual brand panels in both active tracks, outside all safety barriers.
    if (isMonzon || isSuzaka) scene.add(createTracksidePartners(track, this.terrain));
    // Architectural tunnels are purely visual: no change to asphalt, barriers or Rapier.
    if (isMonzon || isSuzaka) scene.add(createRaceTunnels(track));
    // Three adaptive light pools illuminate vehicles and tarmac under the roof,
    // without assigning real-time lights to every decorative LED fixture.
    this.tunnelLighting = new TunnelLighting(scene, track);

    if (isMonzon) {
      // Four unshadowed lights cover the player's vicinity; poles remain instanced.
      for (let i = 0; i < 4; i++) {
        const light = new THREE.PointLight(0xffefd6, 0, 70, 2);
        this.trackLights.push(light);
        scene.add(light);
      }
      scene.add(new MonzonScenery(track, this.terrain).group);
      const monzonMountains=createNaturalMountainRange(track);
      monzonMountains.name="monzon-natural-mountain-background";
      scene.add(monzonMountains);
      this.garages = new MonzonGarages(scene);
      this.balloon = new GoodyearBalloon(scene, track);
      this.pendingAssets.push(this.garages.ready.catch(error => console.warn("[Horizon] Garage equipment failed to load", error)));
    } else if (isSuzaka) {
      this.suzakaGarages = new SuzakaGarages(scene, track);
      this.balloon = new GoodyearBalloon(scene, track);
      scene.add(createSuzakaMountain(track));
      scene.add(createSuzakaPublicStands(track, this.terrain));
      this.forest=new PineForest(scene,track,this.terrain);
      this.pendingAssets.push(this.forest.ready.catch(error=>console.warn("[Horizon] Pine forest could not load",error)));
      // Load only editable Blender landmarks. The driveable surface and all
      // physical guardrails are generated in Track so physics always matches.
      this.pendingAssets.push(installSuzakaScenery(scene, track).catch(error => {
        console.warn("[Horizon] Suzaka scenery could not load; track remains playable", error);
      }));
    } else if (track.circuit.id === "el-imposible-4x4") {
      // Daylight terrain needs volumetric mountains, not the night ridge curtains.
      const mountains=createNaturalMountainRange(track);
      mountains.name="offroad-natural-mountain-background";
      scene.add(mountains);
    } else if (isSparda || isSakhir) {
      installInternationalScenery(scene, track, this.terrain);
      if (isSakhir) {
        scene.fog = new THREE.FogExp2(0x352a26, 0.0005);
        // Two local pools of warm light; unshadowed to preserve mobile FPS.
        for (const index of [22, 70]) {
          const anchor = track.sampleAt(index);
          const light = new THREE.PointLight(0xffdcb2, 115, 160, 1.5);
          light.position.set(anchor.x, anchor.y + 20, anchor.z);
          scene.add(light);
        }
      }
    } else {
      this.buildRidges(scene);
    }
  }

  /** Complete known asynchronous scenery downloads before preparing shaders. */
  async whenReady(scene: THREE.Scene): Promise<void> {
    await Promise.all(this.pendingAssets);
    const people: Promise<unknown>[] = [];
    scene.traverse(object => {
      const pending = object.userData.readyPromise;
      if (pending && typeof pending.then === "function") people.push(pending);
    });
    const results = await Promise.allSettled(people);
    for (const result of results) if(result.status === "rejected") console.warn("[Horizon] Scenery preparation failed", result.reason);
  }

  /** Add a static, lower-resolution terrain collision mesh only where the
   * mountain road leaves the flat world plane. This prevents off-track falls. */
  installTerrainPhysics(world: RAPIER.World): void {
    // Monzon service bays have their own Rapier solids, even on the flat circuit.
    this.garages?.installPhysics(world);
    this.suzakaGarages?.installPhysics(world);
    if (!this.elevatedTerrain) return;
    const geometry = this.terrainMesh.geometry;
    if (!geometry.index) throw new Error("Sparda terrain collider missing triangles");
    const position = geometry.getAttribute("position") as THREE.BufferAttribute;
    const vertices = new Float32Array(position.array as ArrayLike<number>);
    const indices = new Uint32Array(geometry.index.array as ArrayLike<number>);
    const fixed = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    world.createCollider(RAPIER.ColliderDesc.trimesh(vertices, indices).setFriction(0.92), fixed);
  }

  updateVegetationView(center:THREE.Vector3,dt:number):void {this.forest?.update(center,dt);}

  setPixelRatio(ratio: number): void {
    this.sky?.setPixelRatio(ratio);
  }

  /** Follow the player with the sky dome and the shadow frustum. */
  update(center: THREE.Vector3, dt: number): void {
    this.time += dt;
    this.garages?.update(center);
    this.balloon?.update(dt);
    advanceAudienceAnimation(dt);
    // Forest LOD is driven by the actual camera immediately before rendering.
    this.tunnelLighting.update(center, dt);
    this.lightRefresh += dt;
    if (this.trackLights.length && this.lightRefresh >= .25) {
      this.lightRefresh = 0;
      const nearest = this.lampPositions.map(position => ({
        position, distance: position.distanceToSquared(center)
      })).sort((a, b) => a.distance - b.distance).slice(0, this.trackLights.length);
      this.trackLights.forEach((light, index) => {
        const lamp = nearest[index];
        light.intensity = lamp ? 850 : 0;
        if (lamp) light.position.copy(lamp.position);
      });
    }
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
