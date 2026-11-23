import * as THREE from "three";

/** Material and trim for road tunnels. All geometry is static and decorative:
 * driving and collision remain controlled by the original Track/Rapier. */
export interface TunnelFrame {
  point: THREE.Vector3;
  right: THREE.Vector3;
  tangent: THREE.Vector3;
}

export interface TunnelArchitectureOptions {
  name: string;
  circuit: string;
  ordinal: number;
  concreteMap: THREE.Texture;
  halfWidth: number;
  startMeters: number;
  lengthMeters: number;
  profile: readonly (readonly [number, number])[];
  at: (distanceMeters: number) => TunnelFrame;
}

export function makeTunnelConcreteTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("Unable to build tunnel concrete surface");
  const data = ctx.createImageData(size, size);
  // Deterministic fine-grained weathered concrete, not flat polygonal blocks.
  let seed = 173821;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const coarse = Math.sin(x / 23) * 4 + Math.sin(y / 31) * 3;
      const grain = (random() - .5) * 22;
      const pores = random() < .012 ? -24 : 0;
      const joint = (y % 112 < 2) ? -43 : 0;
      const tone = Math.max(45, Math.min(210, 145 + coarse + grain + pores + joint));
      const index = (y * size + x) * 4;
      data.data[index] = tone;
      data.data[index + 1] = tone + 3;
      data.data[index + 2] = tone + 6;
      data.data[index + 3] = 255;
    }
  }
  ctx.putImageData(data, 0, 0);
  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  map.generateMipmaps = true;
  return map;
}

export function makeTunnelPortalSign(name: string, ordinal: number): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 160;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("Missing 2D context for tunnel portal sign");
  ctx.fillStyle = "#17212d";
  ctx.fillRect(0, 0, 1024, 160);
  ctx.fillStyle = "#e5b95b";
  ctx.fillRect(0, 0, 1024, 9);
  ctx.fillRect(0, 151, 1024, 9);
  ctx.fillStyle = "#f5f6f6";
  ctx.font = "bold 65px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${name.toUpperCase()}   ·   TÚNEL ${String(ordinal + 1).padStart(2, "0")}   ·   350 m`, 512, 82, 960);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/**
 * Measurable architectural detailing, independent of the 350 m vault:
 * - two substantial layered concrete portal frames
 * - recessed entrance identification panels
 * - vertical expansion joints along tiled walls
 * - centerline ventilation grilles
 * - low guide reflectors, all unshadowed and instanced
 *
 * Every detail is outside the car's normal envelope.
 */
export function createTunnelArchitecture(options: TunnelArchitectureOptions): THREE.Group {
  const { name, circuit, ordinal, concreteMap, halfWidth: half, startMeters, lengthMeters, profile, at } = options;
  const group = new THREE.Group();
  group.name = `${name}-architectural-finishings`;
  const up = new THREE.Vector3(0, 1, 0);
  const concrete = new THREE.MeshStandardMaterial({
    color: 0xc4cbd0, metalness: .08, roughness: .91,
    map: concreteMap, side: THREE.DoubleSide
  });
  const steel = new THREE.MeshStandardMaterial({
    color: 0x283d4a, roughness: .41, metalness: .65
  });
  const safety = new THREE.MeshBasicMaterial({
    color: circuit === "monzon" ? 0xf7d59d : 0xd5efff, toneMapped: false
  });

  const portalProfile = profile.slice(1, -1);
  for (const [label, offset] of [["entrance", 0], ["departure", lengthMeters]] as const) {
    const frame = at(startMeters + offset);
    // Concrete fascia is a genuinely thick 3D arch following the vault profile.
    // This is not a giant BoxGeometry placed across the driving line.
    const vertices: number[] = [], indices: number[] = [];
    const point = (lateral: number, height: number, forward: number) =>
      frame.point.clone().addScaledVector(frame.right, lateral).addScaledVector(frame.tangent, forward)
        .addScaledVector(up, height);
    for (const cross of portalProfile) {
      const [lateral, height] = cross;
      const outside = lateral + Math.sign(lateral) * .95;
      for (const [l, h] of [[lateral, height - .45], [outside, height + .85]] as const) {
        for (const depth of [-.8, .8]) {
          const p = point(l, h, depth);
          vertices.push(p.x, p.y, p.z);
        }
      }
    }
    const sectionStride = 4;
    for (let i = 0; i < portalProfile.length - 1; i++) {
      const a = i * sectionStride, b = (i + 1) * sectionStride;
      for (const k of [0, 2]) {
        indices.push(a + k, b + k, a + k + 1, b + k, b + k + 1, a + k + 1);
      }
      for (const depth of [0, 1]) {
        indices.push(a + depth, a + 2 + depth, b + depth, b + depth, a + 2 + depth, b + 2 + depth);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const arch = new THREE.Mesh(geo, concrete);
    arch.name = `${name}-${label}-cast-concrete-portal`;
    arch.castShadow = false;
    arch.receiveShadow = false;
    group.add(arch);

    // Proper gantry signage (at 8 m) above vehicles, inside tunnel envelope.
    // Facing orientation depends on the actual travel tangent.
    const signMap = makeTunnelPortalSign(circuit, ordinal);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.5),
      new THREE.MeshBasicMaterial({ map: signMap, toneMapped: false, side: THREE.DoubleSide }));
    sign.name = `${name}-${label}-identification`;
    sign.position.copy(frame.point).addScaledVector(up, 7.9);
    sign.position.addScaledVector(frame.tangent, label === "entrance" ? -.95 : .95);
    sign.rotation.y = Math.atan2(frame.tangent.x, frame.tangent.z);
    group.add(sign);
  }

  // Flat wall panels with vertical reveals; visually reads as actual precast
  // concrete rather than one uninterrupted CGI tube.
  const segmentCount = Math.floor(lengthMeters / 12);
  const joints = new THREE.InstancedMesh(new THREE.BoxGeometry(.045, 6.6, .045),
    steel, segmentCount * 2);
  joints.name = `${name}-precast-expansion-joints`;
  const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < segmentCount; i++) {
    const frame = at(startMeters + 6 + i * 12);
    for (const side of [-1, 1]) {
      const p = frame.point.clone().addScaledVector(frame.right, side * (half - .16))
        .addScaledVector(up, 3.35);
      rotation.setFromAxisAngle(up, -Math.atan2(frame.right.z, frame.right.x));
      matrix.compose(p, rotation, scale);
      joints.setMatrixAt(i * 2 + (side + 1) / 2, matrix);
    }
  }
  joints.instanceMatrix.needsUpdate = true;
  joints.computeBoundingSphere();
  group.add(joints);

  // At intervals, slim dark roof ventilation grilles, unmistakable functional
  // tunnel hardware (not hanging lamps across the road).
  const vents = new THREE.InstancedMesh(new THREE.BoxGeometry(4.0, .085, 1.8),
    steel, 12);
  vents.name = `${name}-ceiling-ventilation`;
  for (let i = 0; i < 12; i++) {
    const frame = at(startMeters + 19 + i * 28);
    const p = frame.point.clone().addScaledVector(up, 10.34);
    rotation.setFromAxisAngle(up, -Math.atan2(frame.right.z, frame.right.x));
    matrix.compose(p, rotation, scale);
    vents.setMatrixAt(i, matrix);
  }
  vents.instanceMatrix.needsUpdate = true;
  vents.computeBoundingSphere();
  group.add(vents);

  // Side reflectors in the safety shoulder, far outside the 14–18 m road.
  const reflectorCount = 28;
  const reflectors = new THREE.InstancedMesh(new THREE.BoxGeometry(.13, .18, .42),
    safety, reflectorCount * 2);
  reflectors.name = `${name}-low-visibility-reflectors`;
  for (let i = 0; i < reflectorCount; i++) {
    const frame = at(startMeters + 9 + i * 12);
    rotation.setFromAxisAngle(up, -Math.atan2(frame.right.z, frame.right.x));
    for (const side of [-1, 1]) {
      const p = frame.point.clone().addScaledVector(frame.right, side * (half - .24))
        .addScaledVector(up, 1.05);
      matrix.compose(p, rotation, scale);
      reflectors.setMatrixAt(i * 2 + (side + 1) / 2, matrix);
    }
  }
  reflectors.instanceMatrix.needsUpdate = true;
  reflectors.computeBoundingSphere();
  group.add(reflectors);

  group.userData = {
    staticArchitecture: true,
    physicalColliders: 0,
    castShadowLights: 0,
    concretePortals: 2,
    expansionJoints: segmentCount * 2,
    ventilationGrilles: 12,
    safetyReflectors: reflectorCount * 2
  };
  return group;
}
