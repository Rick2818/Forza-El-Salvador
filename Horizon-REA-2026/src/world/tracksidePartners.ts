import * as THREE from "three";
import type { Track } from "./track";
import type { TerrainField } from "./terrain";

/**
 * Conceptual trackside advertising. These are text treatments, NOT official
 * sponsor logos or evidence of a commercial partnership.
 * Background / foreground / accent are the user-approved V7 exact sRGB hex
 * values. These are design references, not verified brand-guide assets.
 */
export const TRACKSIDE_BRANDS = [
  { name: "Aramco", background: "#00A19B", foreground: "#FFFFFF", accent: "#7CE0C3" },
  { name: "AWS", background: "#1A2A44", foreground: "#FFFFFF", accent: "#FF9900" },
  { name: "DHL", background: "#FFCC00", foreground: "#D40511", accent: "#D40511" },
  { name: "Heineken", background: "#006B3F", foreground: "#FFFFFF", accent: "#E1251B" },
  { name: "Lenovo", background: "#E2231A", foreground: "#FFFFFF", accent: "#B51E17" },
  { name: "LVMH", background: "#111111", foreground: "#F4F1EA", accent: "#C7A86D" },
  { name: "MSC Cruises", background: "#003B70", foreground: "#FFFFFF", accent: "#D9E4F2" },
  { name: "Pirelli", background: "#FFD100", foreground: "#C8102E", accent: "#C8102E" },
  { name: "Qatar Airways", background: "#5C1635", foreground: "#FFFFFF", accent: "#D8C3CB" },
  { name: "Salesforce", background: "#00A1E0", foreground: "#FFFFFF", accent: "#BFEFFF" }
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

// Eight distributed rotations of all ten brands, never only at the start.
// These are targets, not a requirement to put an unsafe panel on the road.
export const PARTNER_LAP_ROTATIONS = 8;
export const TARGET_TRACKSIDE_SIGNS = TRACKSIDE_BRANDS.length * PARTNER_LAP_ROTATIONS;

/**
 * Place signs in uniformly spaced slots along the FULL lap. Search only near
 * each slot; the old algorithm could move panels >1 km after a failed slot,
 * clustering many signs in a safe section near the start/finish.
 * Invalid/unsafe slots are skipped instead of relocating to another sector.
 */
export function planTracksidePartners(track: Track, ground: TerrainField): PartnerBoardPlacement[] {
  if (track.circuit.id !== "monzon" && track.circuit.id !== "suzaka") return [];
  const N = track.samples.length;
  if (!N) return [];
  const total = TARGET_TRACKSIDE_SIGNS;
  const lateral = track.barrierLateralOffset + 9.5;
  const minRoadDistance = track.barrierLateralOffset + CLEARANCE_PADDING;
  const planned: PartnerBoardPlacement[] = [];
  const separation = Math.max(42, Math.min(70, (track.length / total) * .72));
  // Never displace a sign more than ~110 m from its assigned lap slot.
  const step = Math.max(1, Math.round(13 / track.segmentLength));
  const attempts = Math.min(32, 1 + 2 * Math.ceil(110 / (step * track.segmentLength)));

  for (let k = 0; k < total; k++) {
    const ideal = Math.floor(((k + .47) / total) * N);
    let choice: PartnerBoardPlacement | null = null;
    for (let attempt = 0; attempt < attempts && !choice; attempt++) {
      const stride = attempt === 0 ? 0
        : (attempt % 2 === 0 ? -1 : 1) * Math.ceil(attempt / 2);
      const index = (ideal + stride * step + N * 4) % N;
      const p = track.samples[index];
      const right = track.rights[index];
      const tangent = track.tangents[index];
      if (!p || !right || !tangent) continue;
      for (const side of (k % 2 ? [-1, 1] : [1, -1]) as (-1 | 1)[]) {
        const x = p.x + right.x * lateral * side;
        const z = p.z + right.z * lateral * side;
        // Keep the Monzon garages/tribune/pits unobstructed.
        if (track.circuit.id === "monzon" && x > 55 && x < 730 && z > -112 && z < 110) continue;
        const groundY = ground.heightAt(x, z);
        // Suzaka's flyover is up to 12 m above the lower road. The previous
        // 3.2m limit emptied entire mid-lap sectors. Position the sign above
        // its road deck, while extending both posts to actual terrain.
        // No sign may be placed over an unexpectedly deep excavation.
        if (p.y < groundY - 3.2 || p.y > groundY + 14.5) continue;
        const y = Math.max(groundY, p.y);
        if (planned.some(board => Math.hypot(board.x - x, board.z - z) < separation)) continue;
        const ax = x - tangent.x * BOARD_WIDTH * .55;
        const az = z - tangent.z * BOARD_WIDTH * .55;
        const bx = x + tangent.x * BOARD_WIDTH * .55;
        const bz = z + tangent.z * BOARD_WIDTH * .55;
        if (!clearOfRoad(track, x, z, minRoadDistance) ||
            !clearOfRoad(track, ax, az, minRoadDistance) ||
            !clearOfRoad(track, bx, bz, minRoadDistance)) continue;
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

export function makeBrandAtlas(): THREE.CanvasTexture {
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
    // Text colors stay exact. A narrow dark outline makes low-contrast
    // approved palettes (Salesforce, Aramco, DHL) readable without dimming
    // the background or changing its brand hue.
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = brand.name.length > 12
      ? "900 94px Arial, sans-serif"
      : "900 120px Arial, sans-serif";
    ctx.lineJoin = "round";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(4, 13, 20, 0.65)";
    ctx.strokeText(brand.name, width / 2 + 10, y + 75, 920);
    ctx.fillStyle = brand.foreground;
    ctx.fillText(brand.name, width / 2 + 10, y + 75, 920);
  });
  const atlas = new THREE.CanvasTexture(canvas);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;
  // Signs are unlit (MeshBasicMaterial + toneMapped:false), so a night race
  // does not mute colors while daylight does not wash them out.
  atlas.generateMipmaps = true;
  atlas.needsUpdate = true;
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
    // Print faces INTO the circuit. Reading the back of a DoubleSide
    // billboard mirrors the lettering, so orient both winding and U to road.
    if (board.side === -1) {
      uv.push(0, v0, 1, v0, 0, v1, 1, v1);
    } else {
      uv.push(1, v0, 0, v0, 1, v1, 0, v1);
    }
    const start = i * 4;
    if (board.side === -1) {
      indices.push(start, start + 1, start + 2, start + 1, start + 3, start + 2);
    } else {
      indices.push(start, start + 2, start + 1, start + 1, start + 2, start + 3);
    }

    rotation.setFromAxisAngle(up, -Math.atan2(board.tangentZ, board.tangentX));
    translation.set(board.x, board.y + 2 + BOARD_HEIGHT / 2, board.z);
    matrix.compose(translation, rotation, scale);
    backing.setMatrixAt(i, matrix);

    for (const side of [-1, 1]) {
      const x = board.x + board.tangentX * (halfW - .45) * side;
      const z = board.z + board.tangentZ * (halfW - .45) * side;
      const foot = ground.heightAt(x, z);
      // Grounded posts are extended to support banners at bridge altitude,
      // unlike suspended signage that has no plausible physical supports.
      const postHeight = Math.max(.2, board.y + 4.25 - foot);
      translation.set(x, foot + postHeight / 2, z);
      scale.set(1, postHeight / 4.25, 1);
      matrix.compose(translation, new THREE.Quaternion(), scale);
      posts.setMatrixAt(i * 2 + (side + 1) / 2, matrix);
      scale.set(1, 1, 1);
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
    map: atlas, side: THREE.FrontSide, toneMapped: false
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
      // Second, correctly oriented face for spectators on the other side.
      const back = panel.clone();
      back.name = "partner-gantry-banner-reverse";
      back.rotation.y += Math.PI;
      back.position.addScaledVector(t, .27);
      group.add(back);
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
