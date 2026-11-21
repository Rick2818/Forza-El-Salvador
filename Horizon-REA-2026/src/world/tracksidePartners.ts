import * as THREE from "three";
import type { Track } from "./track";
import type { TerrainField } from "./terrain";

/**
 * Conceptual trackside advertising. These are text treatments, NOT official
 * sponsor logos or evidence of a commercial partnership.
 */
export const TRACKSIDE_BRANDS = [
  { name: "Aramco", background: "#007e83", foreground: "#ffffff", accent: "#65cfab" },
  { name: "AWS", background: "#172b4b", foreground: "#ffffff", accent: "#ff9f32" },
  { name: "DHL", background: "#ffdf00", foreground: "#d40511", accent: "#d40511" },
  { name: "Heineken", background: "#075b33", foreground: "#ffffff", accent: "#e6383f" },
  { name: "Lenovo", background: "#e0242d", foreground: "#ffffff", accent: "#ffffff" },
  { name: "LVMH", background: "#111820", foreground: "#faf3e5", accent: "#bfa777" },
  { name: "MSC Cruises", background: "#102c48", foreground: "#ffffff", accent: "#c6d7ed" },
  { name: "Pirelli", background: "#f6d700", foreground: "#c40b1a", accent: "#c40b1a" },
  { name: "Qatar Airways", background: "#692443", foreground: "#ffffff", accent: "#e5c9d0" },
  { name: "Salesforce", background: "#0877bb", foreground: "#ffffff", accent: "#c5eeff" }
] as const;

export interface PartnerBoardPlacement {
  brandIndex: number;
  sampleIndex: number;
  side: -1 | 1;
  x: number;
  y: number;
  z: number;
  tangentX: number;
  tangentZ: number;
}

const BOARD_WIDTH = 8.4;
const BOARD_HEIGHT = 2.65;
const CLEARANCE_PADDING = 3.8;

/**
 * The signs must not enter the driving surface or any other nearby section
 * of the circuit (particularly Suzaka's grade-separated crossing).
 */
function clearOfRoad(track: Track, x: number, z: number, threshold: number): boolean {
  const minSquared = threshold * threshold;
  for (let i = 0; i < track.samples.length; i += 3) {
    const p = track.samples[i];
    if ((p.x - x) ** 2 + (p.z - z) ** 2 < minSquared) return false;
  }
  return true;
}

/** Two placements per brand, distributed around each active circuit. */
export function planTracksidePartners(track: Track, ground: TerrainField): PartnerBoardPlacement[] {
  if (track.circuit.id !== "monzon" && track.circuit.id !== "suzaka") return [];
  const N = track.samples.length;
  if (!N) return [];
  const total = TRACKSIDE_BRANDS.length * 2;
  const lateral = track.barrierLateralOffset + 9.5;
  const minRoadDistance = track.barrierLateralOffset + CLEARANCE_PADDING;
  const planned: PartnerBoardPlacement[] = [];
  const step = Math.max(3, Math.floor(N / 110));

  for (let k = 0; k < total; k++) {
    const ideal = Math.floor(((k + .35) / total) * N);
    let choice: PartnerBoardPlacement | null = null;
    for (let attempt = 0; attempt < 48 && !choice; attempt++) {
      const stride = attempt === 0 ? 0 : (attempt % 2 === 0 ? 1 : -1) * Math.ceil(attempt / 2);
      const index = (ideal + stride * step + N * 4) % N;
      const p = track.samples[index];
      const right = track.rights[index];
      const tangent = track.tangents[index];
      if (!p || !right || !tangent) continue;
      for (const side of (k % 2 ? [-1, 1] : [1, -1]) as (-1 | 1)[]) {
        const x = p.x + right.x * lateral * side;
        const z = p.z + right.z * lateral * side;
        // No panels in front of Monzon's open garages, tower or grandstand.
        if (track.circuit.id === "monzon" && x > 55 && x < 730 && z > -112 && z < 110) continue;
        const y = ground.heightAt(x, z);
        // The flyover is too high above the terrain for a roadside sign.
        if (Math.abs(p.y - y) > 3.2) continue;
        if (planned.some(board => Math.hypot(board.x - x, board.z - z) < 82)) continue;
        const ax = x - tangent.x * BOARD_WIDTH * .55;
        const az = z - tangent.z * BOARD_WIDTH * .55;
        const bx = x + tangent.x * BOARD_WIDTH * .55;
        const bz = z + tangent.z * BOARD_WIDTH * .55;
        if (!clearOfRoad(track, x, z, minRoadDistance) ||
            !clearOfRoad(track, ax, az, minRoadDistance) ||
            !clearOfRoad(track, bx, bz, minRoadDistance)) continue;
        // The front fascia follows the landscape without floating supports.
        if (Math.abs(ground.heightAt(ax, az) - y) > 1.4 ||
            Math.abs(ground.heightAt(bx, bz) - y) > 1.4) continue;
        choice = { brandIndex: k % TRACKSIDE_BRANDS.length, sampleIndex: index,
          side, x, y, z, tangentX: tangent.x, tangentZ: tangent.z };
        break;
      }
    }
    if (choice) planned.push(choice);
  }
  return planned;
}

function makeBrandAtlas(): THREE.CanvasTexture {
  const width = 1024;
  const cellHeight = 160;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = cellHeight * TRACKSIDE_BRANDS.length;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo crear la textura de los patrocinadores");
  TRACKSIDE_BRANDS.forEach((brand, index) => {
    const y = index * cellHeight;
    ctx.fillStyle = brand.background;
    ctx.fillRect(0, y, width, cellHeight);
    ctx.fillStyle = brand.accent;
    ctx.fillRect(0, y, 22, cellHeight);
    ctx.fillRect(0, y + cellHeight - 10, width, 10);
    ctx.fillStyle = brand.foreground;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = brand.name.length > 12
      ? "bold 82px Arial, sans-serif"
      : "bold 107px Arial, sans-serif";
    ctx.fillText(brand.name, width / 2 + 10, y + 75, 925);
  });
  const atlas = new THREE.CanvasTexture(canvas);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;
  return atlas;
}

/** One atlas draw call, one instanced metal frame, one instanced set of posts. */
export function createTracksidePartners(track: Track, ground: TerrainField): THREE.Group {
  const group = new THREE.Group();
  group.name = `trackside-partners-${track.circuit.id}`;
  const placements = planTracksidePartners(track, ground);
  if (!placements.length) return group;

  const atlas = makeBrandAtlas();
  const vertices: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  const count = TRACKSIDE_BRANDS.length;

  const metal = new THREE.MeshStandardMaterial({
    color: 0x273139, metalness: .35, roughness: .68
  });
  const backing = new THREE.InstancedMesh(
    new THREE.BoxGeometry(BOARD_WIDTH + .3, BOARD_HEIGHT + .28, .16),
    metal, placements.length
  );
  const posts = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(.13, .15, 4.25, 6),
    metal, placements.length * 2
  );
  backing.name = "partner-board-frames";
  posts.name = "partner-board-posts";
  const matrix = new THREE.Matrix4();
  const translation = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  placements.forEach((board, i) => {
    const halfW = BOARD_WIDTH / 2;
    // Move the printed surface in front of the metal backing; without this
    // offset it intersects the frame and becomes invisible/z-fights.
    const right = track.rights[board.sampleIndex];
    const faceX = board.x - right.x * board.side * .12;
    const faceZ = board.z - right.z * board.side * .12;
    const x1 = faceX - board.tangentX * halfW;
    const x2 = faceX + board.tangentX * halfW;
    const z1 = faceZ - board.tangentZ * halfW;
    const z2 = faceZ + board.tangentZ * halfW;
    const bottom = board.y + 2.0;
    const top = bottom + BOARD_HEIGHT;
    vertices.push(x1, bottom, z1, x2, bottom, z2,
      x1, top, z1, x2, top, z2);
    const v0 = 1 - (board.brandIndex + 1) / count + .002;
    const v1 = 1 - board.brandIndex / count - .002;
    uv.push(0, v0, 1, v0, 0, v1, 1, v1);
    const start = i * 4;
    indices.push(start, start + 1, start + 2, start + 1, start + 3, start + 2);

    rotation.setFromAxisAngle(up, -Math.atan2(board.tangentZ, board.tangentX));
    translation.set(board.x, board.y + 2 + BOARD_HEIGHT / 2, board.z);
    matrix.compose(translation, rotation, scale);
    backing.setMatrixAt(i, matrix);

    for (const side of [-1, 1]) {
      const x = board.x + board.tangentX * (halfW - .45) * side;
      const z = board.z + board.tangentZ * (halfW - .45) * side;
      const foot = ground.heightAt(x, z);
      translation.set(x, foot + 2.125, z);
      matrix.compose(translation, new THREE.Quaternion(), scale);
      posts.setMatrixAt(i * 2 + (side + 1) / 2, matrix);
    }
  });
  backing.instanceMatrix.needsUpdate = true;
  posts.instanceMatrix.needsUpdate = true;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const panelMaterial = new THREE.MeshBasicMaterial({
    map: atlas, side: THREE.DoubleSide, toneMapped: false
  });
  const banners = new THREE.Mesh(geometry, panelMaterial);
  banners.name = "partner-brand-billboards";
  banners.userData.placements = placements.map(({ brandIndex, sampleIndex, side }) => ({
    brand: TRACKSIDE_BRANDS[brandIndex].name, sampleIndex, side
  }));
  group.add(backing, posts, banners);

  /** A UV-sliced panel shares the atlas with the trackside signs. */
  const makePanel = (brandIndex: number, width: number, height: number, name: string): THREE.Mesh => {
    const geo = new THREE.PlaneGeometry(width, height);
    const coords = geo.getAttribute("uv") as THREE.BufferAttribute;
    const low = 1 - (brandIndex + 1) / TRACKSIDE_BRANDS.length + .002;
    const high = 1 - brandIndex / TRACKSIDE_BRANDS.length - .002;
    for (let i = 0; i < coords.count; i++) {
      coords.setY(i, low + coords.getY(i) * (high - low));
    }
    coords.needsUpdate = true;
    const mesh = new THREE.Mesh(geo, panelMaterial);
    mesh.name = name;
    mesh.castShadow = false;
    return mesh;
  };

  // Two wide sponsor panels on a fully elevated gantry. The existing
  // start-light gantry remains unobstructed and is not replaced.
  const offset = track.barrierLateralOffset + 3.7;
  for (let attempt = 0; attempt < 12; attempt++) {
    const distance = (track.circuit.id === "monzon" ? 750 : 150) + attempt * 28;
    const index = (track.startIndex + Math.round(distance / track.segmentLength)) % track.samples.length;
    const p = track.samples[index], r = track.rights[index];
    if (!p || !r) continue;
    const leftX = p.x - r.x * offset, leftZ = p.z - r.z * offset;
    const rightX = p.x + r.x * offset, rightZ = p.z + r.z * offset;
    const leftY = ground.heightAt(leftX, leftZ);
    const rightY = ground.heightAt(rightX, rightZ);
    if (Math.abs(p.y - leftY) > 2.0 || Math.abs(p.y - rightY) > 2.0) continue;
    if (!clearOfRoad(track, leftX, leftZ, track.barrierLateralOffset + 2) ||
        !clearOfRoad(track, rightX, rightZ, track.barrierLateralOffset + 2)) continue;
    if (track.circuit.id === "monzon" && p.x > 90 && p.x < 720 && Math.abs(p.z) < 75) {
      // The 640m Horizon bridge and pit complex should remain unobstructed.
      continue;
    }
    const headHeight = p.y + 8.2, panelHeight = 2.1;
    const poleGeo = new THREE.CylinderGeometry(.21, .24, 1, 8);
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x303a46, metalness: .48, roughness: .6 });
    for (const side of [-1, 1]) {
      const x = side < 0 ? leftX : rightX;
      const z = side < 0 ? leftZ : rightZ;
      const foot = side < 0 ? leftY : rightY;
      const postHeight = headHeight - foot;
      const pole = new THREE.Mesh(poleGeo, steelMat);
      pole.scale.y = postHeight;
      pole.position.set(x, foot + postHeight / 2, z);
      pole.name = "partner-gantry-post";
      group.add(pole);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(offset * 2, panelHeight + .3, .22), steelMat);
    beam.position.set(p.x, headHeight - panelHeight / 2, p.z);
    beam.rotation.y = -Math.atan2(r.z, r.x);
    beam.name = "partner-gantry-beam";
    group.add(beam);
    // Panel width across the road, perpendicular to the driving direction.
    for (const [indexInPair, brandIndex] of [6, 8].entries()) {
      const halfWidth = offset - .3;
      const panel = makePanel(brandIndex, halfWidth, panelHeight, "partner-gantry-banner");
      const lateral = (indexInPair === 0 ? -.5 : .5) * halfWidth;
      panel.position.set(p.x + r.x * lateral, headHeight - panelHeight / 2, p.z + r.z * lateral);
      panel.rotation.y = -Math.atan2(r.z, r.x);
      // Move toward approaching vehicles to avoid co-planar depth flicker.
      const t = track.tangents[index];
      panel.position.addScaledVector(t, -.135);
      group.add(panel);
    }
    break;
  }

  // Monzon garages retain the Ferrari/Porsche/Bugatti/Mercedes brand fascia.
  // The partner adverts form a separate thin band ABOVE those existing signs.
  if (track.circuit.id === "monzon") {
    const garagePanels = [
      { x: 118, brand: 7 }, { x: 134.5, brand: 4 },
      { x: 151, brand: 5 }, { x: 167.5, brand: 9 }
    ];
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x263038, roughness: .8 });
    for (const {x, brand} of garagePanels) {
      const plaque = new THREE.Mesh(new THREE.BoxGeometry(14.65, .86, .12), roofMat);
      plaque.name = "garage-partner-band";
      plaque.position.set(x, 6.33, 29.9);
      group.add(plaque);
      const panel = makePanel(brand, 14.4, .72, "garage-partner-advert");
      panel.position.set(x, 6.33, 29.82);
      panel.rotation.y = Math.PI;
      group.add(panel);
    }
  }

  return group;
}
