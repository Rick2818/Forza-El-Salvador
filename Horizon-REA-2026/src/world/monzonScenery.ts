import * as THREE from "three";
import { makeRng } from "../core/mathx";
import { createBannerTexture } from "./textures";
import type { Track } from "./track";
import type { TerrainField } from "./terrain";

/**
 * Circuito Monzon: original, light-weight 3D scenery built with instancing.
 * The main straight is the first 1,050m, oriented on +X; scenery is placed
 * outside the physical safety barrier and does not affect vehicle collisions.
 */
export class MonzonScenery {
  readonly group = new THREE.Group();

  constructor(track: Track, ground: TerrainField) {
    this.group.name = "monzon-scenery";
    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const material = (color: number, metalness = 0): THREE.MeshStandardMaterial =>
      new THREE.MeshStandardMaterial({ color, metalness, roughness: metalness > 0 ? 0.45 : 0.82 });
    const concrete = material(0xb4bac0);
    const glass = new THREE.MeshStandardMaterial({
      color: 0x5685a4, metalness: 0.48, roughness: 0.22
    });
    const steel = material(0x27343e, 0.35);
    const roof = material(0xe8ebed, 0.2);
    const seating = [material(0x438ab9), material(0xe6e9ee), material(0xc3ae31)];
    const orange = material(0xe65d2d);
    const asphalt = material(0x292e33);
    const stripe = material(0xf6f7ed);

    const box = (
      name: string, x: number, y: number, z: number,
      w: number, h: number, d: number, mat: THREE.Material
    ): THREE.Mesh => {
      const mesh = new THREE.Mesh(unitBox, mat);
      mesh.name = name;
      mesh.position.set(x, y, z);
      mesh.scale.set(w, h, d);
      mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };

    // Pit lane, glass-fronted pit complex and a separate paddock control tower.
    // These objects sit alongside the straight, not on the racing line.
    const pitY = ground.heightAt(280, 46);
    box("monzon-pitlane", 290, 0.021, 22, 510, 0.045, 12, asphalt);
    box("monzon-pitlane-line", 290, 0.052, 17.5, 510, 0.02, 0.24, stripe);
    box("monzon-boxes", 288, pitY + 8.1, 47, 484, 16.2, 31, concrete);
    box("monzon-boxes-glass", 288, pitY + 13, 30.9, 478, 5.7, 0.6, glass);
    box("monzon-boxes-roof", 288, pitY + 16.3, 47, 497, 0.85, 36, roof);
    box("monzon-paddock-terrace", 288, pitY + 17.5, 32.5, 497, 0.22, 10, steel);
    for (let i = 0; i < 19; i++) {
      const x = 62 + i * 25;
      box("box-door-" + i, x, pitY + 4.8, 30.55, 19, 8.7, 0.55, i % 4 === 0 ? orange : steel);
      box("pit-window-" + i, x, pitY + 13.8, 30.45, 19, 3.5, 0.15, glass);
    }
    // Independent control tower with unobstructed glass panoramic band.
    box("monzon-tower", 575, pitY + 15, 57, 23, 30, 22, concrete);
    box("monzon-tower-glass", 575, pitY + 24.8, 57, 28, 8.5, 27, glass);
    box("monzon-tower-roof", 575, pitY + 29.9, 57, 32, 1.1, 31, roof);

    // Grandstand opposite the pit buildings with tiered seating and canopy.
    const standY = ground.heightAt(300, -62);
    box("monzon-grandstand-base", 309, standY + 4, -65, 430, 8, 39, concrete);
    for (let row = 0; row < 9; row++) {
      box("monzon-tier-" + row, 309, standY + 5.2 + row * 1.06,
        -48 - row * 3.1, 415, 0.53, 3.1, seating[row % seating.length]);
    }
    box("monzon-grandstand-canopy", 309, standY + 18, -65, 445, 1.05, 50, roof);
    for (const x of [90, 160, 230, 300, 370, 440, 520]) {
      box("monzon-canopy-column", x, standY + 10, -85, 0.75, 18.2, 0.75, steel);
    }

    // A low-poly instanced crowd gives the stand life while using one draw call.
    const rng = makeRng(28182027);
    const crowdCount = 420;
    const heads = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.46, 0),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }),
      crowdCount
    );
    heads.name = "monzon-spectators";
    heads.castShadow = false;
    const matrix = new THREE.Matrix4();
    const uniforms = [new THREE.Color(0xfff0cb), new THREE.Color(0xe8ad67),
      new THREE.Color(0x548fc8), new THREE.Color(0xe9e9e9), new THREE.Color(0xed6b46)];
    for (let i = 0; i < crowdCount; i++) {
      const row = Math.floor(rng() * 8);
      const x = 105 + rng() * 405;
      const z = -49 - row * 3.1;
      matrix.makeTranslation(x, standY + 6.1 + row * 1.06, z);
      heads.setMatrixAt(i, matrix);
      heads.setColorAt(i, uniforms[Math.floor(rng() * uniforms.length)]);
    }
    heads.instanceMatrix.needsUpdate = true;
    if (heads.instanceColor) heads.instanceColor.needsUpdate = true;
    this.group.add(heads);

    // Braking-distance boards before the first chicane: approach on +X.
    const markerMat = material(0xffffff);
    for (const [label, x] of [["300", 750], ["200", 850], ["100", 950]] as const) {
      box("monzon-marker-post-" + label, x, 1.6, -23, 0.24, 3.2, 0.24, steel);
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 160;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#f6f5ef"; ctx.fillRect(0, 0, 256, 160);
      ctx.fillStyle = "#171d22"; ctx.font = "900 94px Arial, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(label, 128, 84);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.7, 2.3),
        new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
      sign.name = "monzon-braking-" + label;
      sign.position.set(x, 3.3, -23);
      sign.rotation.y = -Math.PI / 2;
      this.group.add(sign);
    }
    void markerMat;

    // Original Horizon branding, without real autodrome or sponsor trademarks.
    box("monzon-bridge-leg-left", 640, 5.0, -19.0, 1.0, 10, 1.0, steel);
    box("monzon-bridge-leg-right", 640, 5.0, 19.0, 1.0, 10, 1.0, steel);
    const bannerMap = createBannerTexture("MONZON", "HORIZON EL SALVADOR");
    const bridge = new THREE.Mesh(new THREE.PlaneGeometry(34, 3.4),
      new THREE.MeshBasicMaterial({ map: bannerMap, side: THREE.DoubleSide }));
    bridge.name = "monzon-overhead-brand";
    bridge.position.set(640, 8.1, 0);
    bridge.rotation.y = -Math.PI / 2;
    this.group.add(bridge);

    // Instanced broadleaf park; no individual tree draw calls on Samsung/Chrome.
    const trees = 460;
    const trunk = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.18, 0.27, 1, 5),
      material(0x5b432c), trees
    );
    const crowns = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 1),
      // White base avoids multiplying every per-instance green into dull olive.
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94, metalness: 0 }), trees
    );
    trunk.name = "monzon-tree-trunks";
    crowns.name = "monzon-tree-canopies";
    const color = new THREE.Color();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    let count = 0;
    const points = track.samples.length;
    for (let i = 0; i < trees; i++) {
      const idx = Math.floor(rng() * points);
      const road = track.sampleAt(idx);
      const side = track.rightAt(idx);
      const lateral = 34 + rng() * 120;
      const direction = i % 2 === 0 ? -1 : 1;
      const x = road.x + side.x * lateral * direction;
      const z = road.z + side.z * lateral * direction;
      // Keep sightlines open around the start, pit buildings and grandstands.
      if (x > -60 && x < 700 && z > -155 && z < 102) continue;
      const y = ground.heightAt(x, z);
      const height = 11 + rng() * 10;
      position.set(x, y + height * 0.34, z);
      scale.set(0.7 + rng() * 0.42, height * 0.68, 0.7);
      matrix.compose(position, rotation, scale);
      trunk.setMatrixAt(count, matrix);
      position.set(x, y + height * 0.82, z);
      scale.set(4.2 + rng() * 2.9, height * 0.42, 4.0 + rng() * 2.6);
      matrix.compose(position, rotation, scale);
      crowns.setMatrixAt(count, matrix);
      color.setHSL(0.30 + rng() * 0.075, 0.55 + rng() * 0.18, 0.35 + rng() * 0.16);
      crowns.setColorAt(count, color);
      count++;
    }
    trunk.count = count;
    crowns.count = count;
    trunk.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
    this.group.add(trunk, crowns);
  }
}
