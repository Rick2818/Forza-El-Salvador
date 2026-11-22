import * as THREE from "three";
import { makeRng } from "../core/mathx";
import { createBannerTexture } from "./textures";
import type { Track } from "./track";
import type { TerrainField } from "./terrain";
import { batchStaticScenery } from "../render/staticBatch";
import { createMonzonOrganicTrees } from "./monzonTrees";

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
    // A thin road slab used to hover above the terrain and nearly overlap the
    // real straight's wall, appearing as a dark obstruction/road stain.
    // Keep this visual-only pit lane outside the collision barrier (z >= 21)
    // and anchor it at the local ground elevation instead of world y=0.
    const pitRoadY = ground.heightAt(290, 25);
    box("monzon-pitlane", 290, pitRoadY - 0.09, 25.5, 510, 0.28, 9, asphalt);
    box("monzon-pitlane-line", 290, pitRoadY + 0.065, 21.5, 510, 0.02, 0.24, stripe);
    // The complete pit road is connected to the main asphalt at two genuine
    // openings in the +Z barrier. Slabs end at the kerb, not across the raceway.
    for (const [name, x] of [["entry",104.5],["exit",196.5]] as const) {
      box(`monzon-pit-${name}-apron`, x, .005, 18.5, 22, .025, 22, asphalt);
      for (const side of [-1,1]) {
        box(`monzon-pit-${name}-edge`, x + side*10, .039, 20, .18, .02, 17, stripe);
      }
    }
    box("monzon-pit-forecourt", 153.7, -.013, 27.5, 118, .05, 6.8, asphalt);

    const addPitSign = (label: string, x: number): void => {
      const canvas = document.createElement("canvas"); canvas.width=512;canvas.height=256;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle="#f5cb31";ctx.fillRect(0,0,512,256);
      ctx.fillStyle="#1c252b";ctx.font="bold 100px Arial,sans-serif";
      ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(label,256,128);
      const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
      const sign=new THREE.Mesh(new THREE.PlaneGeometry(5.4,2.7),
        new THREE.MeshBasicMaterial({map,side:THREE.DoubleSide,toneMapped:false}));
      sign.name=`monzon-${label.toLowerCase().replace(" ","-")}-sign`;
      sign.position.set(x,4.2,20);sign.rotation.y=Math.PI/2;
      this.group.add(sign);
    };
    addPitSign("PIT IN",103);
    addPitSign("PIT OUT",198);

    // Four genuinely open service bays are built by MonzonGarages. The old
    // solid slab occupied their interiors and hid all workshop equipment.
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

    // Preserve the Monzón forest positions while upgrading crowns from faceted
    // icosahedra to detailed organic leaves and photographic-style bark.
    this.group.add(createMonzonOrganicTrees(track, ground));
    batchStaticScenery(this.group);
  }
}
