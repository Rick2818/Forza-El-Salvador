import * as THREE from "three";
import type { Track } from "./track";
import { TRACKSIDE_BRANDS, makeBrandAtlas } from "./tracksidePartners";
import { createTunnelArchitecture, makeTunnelConcreteTexture } from "./tunnelArchitecture";

/**
 * Six 350 m architectural tunnels, attached to the EXISTING track centerline.
 * Visual-only structures: NO new Rapier bodies, road meshes, barriers or physics.
 * Instanced LED fixtures provide depth; three pooled shadow-free lights illuminate cars and road.
 */
export const TUNNEL_LENGTH_METERS = 350;
export const TUNNELS_PER_CIRCUIT = 3;

export interface TunnelPlan {
  readonly id: string;
  readonly circuit: "monzon" | "suzaka";
  readonly startMeters: number;
  readonly lengthMeters: number;
  readonly endMeters: number;
}

export function planRaceTunnels(track: Track): TunnelPlan[] {
  const circuit = track.circuit.id;
  if ((circuit !== "monzon" && circuit !== "suzaka") ||
      track.length < 4200 || track.samples.length < 100 || track.segmentLength <= 0) return [];
  // Monzón: exclude the pit/stand/main straight; Suzaka: avoid the bridge crossover.
  // Spacing exceeds the 350 m footprint, so tunnel envelopes never overlap.
  const anchors = circuit === "monzon" ? [0.24, 0.48, 0.78] : [0.12, 0.36, 0.70];
  return anchors.map((fraction, i) => {
    const startMeters = Math.round((track.length * fraction) / track.segmentLength) * track.segmentLength;
    return {
      id: `${circuit}-tunnel-${i + 1}`, circuit,
      startMeters, lengthMeters: TUNNEL_LENGTH_METERS,
      endMeters: startMeters + TUNNEL_LENGTH_METERS
    };
  });
}

interface Frame {
  point: THREE.Vector3;
  right: THREE.Vector3;
  tangent: THREE.Vector3;
}

function frameAt(track: Track, distance: number): Frame {
  const N = track.samples.length;
  const scaled = distance / track.segmentLength;
  const a = Math.floor(scaled) % N, b = (a + 1) % N, t = scaled - Math.floor(scaled);
  return {
    point: track.samples[a].clone().lerp(track.samples[b], t),
    right: track.rights[a].clone().lerp(track.rights[b], t).normalize(),
    tangent: track.tangents[a].clone().lerp(track.tangents[b], t).normalize()
  };
}

function geometryOf(positions: number[], uvs: number[], indices: number[]): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function createTunnel(track: Track, plan: TunnelPlan, ordinal: number, atlas: THREE.Texture, concreteMap: THREE.Texture): THREE.Group {
  const group = new THREE.Group();
  group.name = plan.id;
  const half = Math.max(track.barrierLateralOffset + 3.0, track.halfWidth + 4.5);
  const N = Math.ceil(TUNNEL_LENGTH_METERS / 4);
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  // Wall to 7.4 m, vaulted roof to 10.6 m, second wall; clear width > road + guardrails.
  const profile: Array<[number, number]> = [[-half, 0.10], [-half, 7.4]];
  for (let k = 1; k <= 7; k++) {
    const theta = (k / 8) * Math.PI;
    profile.push([-half * Math.cos(theta), 7.4 + 3.2 * Math.sin(theta)]);
  }
  profile.push([half, 7.4], [half, 0.10]);
  const columns = profile.length;
  for (let i = 0; i <= N; i++) {
    const d = (TUNNEL_LENGTH_METERS * i) / N;
    const frame = frameAt(track, plan.startMeters + d);
    for (let j = 0; j < columns; j++) {
      const [lateral, height] = profile[j];
      positions.push(frame.point.x + frame.right.x * lateral,
        frame.point.y + height, frame.point.z + frame.right.z * lateral);
      uv.push(j / (columns - 1), d / 12);
      if (i && j) {
        const a = (i - 1) * columns + j - 1, b = i * columns + j - 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const shell = new THREE.Mesh(geometryOf(positions, uv, indices),
    new THREE.MeshStandardMaterial({
      color: plan.circuit === "monzon" ? 0xdde1e3 : 0xe4e9ec,
      map: concreteMap, metalness: .07, roughness: .89,
      side: THREE.DoubleSide,
      emissive: 0x8b9ba6, emissiveIntensity: .8
    }));
  shell.name = `${plan.id}-vault-and-walls`;
  shell.castShadow = false;
  shell.receiveShadow = false;
  group.add(shell);

  // These bold, 3D entrance/exit arches are visible from the chase camera.
  // The previous thin, gray tunnel walls had no prominent portals; players
  // could pass the entire structure without recognizing it as a tunnel.
  // The complete arch follows the road height and leaves the driving surface
  // and all original Rapier guardrails completely untouched.
  const portalMaterial = new THREE.MeshBasicMaterial({ color: 0x192a38, toneMapped: false });
  const ledMaterial = new THREE.MeshBasicMaterial({
    color: plan.circuit === "monzon" ? 0xffe8aa : 0xd7faff,
    toneMapped: false
  });
  for (const [end, offset] of [["entry", 0], ["exit", TUNNEL_LENGTH_METERS]] as const) {
    const frame = frameAt(track, plan.startMeters + offset);
    const makeOutline = (inset: number): THREE.Vector3[] =>
      profile.map(([lateral, height]) =>
        frame.point.clone().addScaledVector(frame.right, lateral)
          .add(new THREE.Vector3(0, height + inset, 0)));
    const fascia = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(makeOutline(.06), false), 80, .48, 7, false),
      portalMaterial
    );
    fascia.name = `${plan.id}-${end}-solid-portal`;
    const leds = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(makeOutline(.12), false), 80, .19, 6, false),
      ledMaterial
    );
    leds.name = `${plan.id}-${end}-luminous-portal`;
    fascia.frustumCulled = false;
    leds.frustumCulled = false;
    group.add(fascia, leds);
  }

  group.add(createTunnelArchitecture({
    name: plan.id,
    circuit: plan.circuit,
    ordinal,
    concreteMap,
    halfWidth: half,
    startMeters: plan.startMeters,
    lengthMeters: TUNNEL_LENGTH_METERS,
    profile,
    at: distance => frameAt(track, distance)
  }));

  // Continuous LED lighting at shoulder, eye and upper-wall height on both
  // sides. Six strips per tunnel in a single static draw call.
  const stripPositions: number[] = [], stripUv: number[] = [], stripIndices: number[] = [];
  for (const side of [-1, 1]) {
    for (const [bottom, top] of [[.95, 1.17], [3.75, 3.99], [6.18, 6.42]] as const) {
      const startVertex = stripPositions.length / 3;
      for (let i = 0; i <= N; i++) {
        const d = (TUNNEL_LENGTH_METERS * i) / N;
        const frame = frameAt(track, plan.startMeters + d);
        const lateral = side * (half - .13);
        for (const y of [bottom, top]) {
          stripPositions.push(frame.point.x + frame.right.x * lateral, frame.point.y + y,
            frame.point.z + frame.right.z * lateral);
          stripUv.push(d / 10, y);
        }
        if (i) {
          const prev = startVertex + (i - 1) * 2, next = startVertex + i * 2;
          stripIndices.push(prev, next, prev + 1, next, next + 1, prev + 1);
        }
      }
    }
  }
  const rails = new THREE.Mesh(geometryOf(stripPositions, stripUv, stripIndices),
    new THREE.MeshBasicMaterial({ color: 0xf2f8ff, side: THREE.DoubleSide, toneMapped: false }));
  rails.name = `${plan.id}-continuous-led-rails`;
  rails.userData.stripCount = 6;
  group.add(rails);

  // Industrial-grade lighting every seven metres across all 350 m. Only
  // ONE instanced draw call regardless of the number of fixture meshes.
  const lampCount = 49;
  const lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(half * 1.55, .08, .76),
    new THREE.MeshBasicMaterial({ color: 0xfffdf1, toneMapped: false }), lampCount);
  const matrix = new THREE.Matrix4();
  const rot = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < lampCount; i++) {
    const frame = frameAt(track, plan.startMeters + 7 + i * 7);
    rot.setFromAxisAngle(up, -Math.atan2(frame.right.z, frame.right.x));
    matrix.compose(frame.point.clone().addScaledVector(up, 9.63), rot, new THREE.Vector3(1, 1, 1));
    lamps.setMatrixAt(i, matrix);
  }
  lamps.instanceMatrix.needsUpdate = true;
  lamps.computeBoundingSphere();
  lamps.name = `${plan.id}-overhead-luminaires`;
  group.add(lamps);

  // Glowing transverse ribs make the depth of each tunnel legible without shadows.
  const ribs: number[] = [];
  for (let d = 0; d <= TUNNEL_LENGTH_METERS; d += 25) {
    const frame = frameAt(track, plan.startMeters + d);
    for (let i = 1; i < profile.length - 2; i++) {
      const a = profile[i], b = profile[i + 1];
      for (const [lat, height] of [a, b]) {
        ribs.push(frame.point.x + frame.right.x * lat, frame.point.y + height - .09,
          frame.point.z + frame.right.z * lat);
      }
    }
  }
  const ribGeo = new THREE.BufferGeometry();
  ribGeo.setAttribute("position", new THREE.Float32BufferAttribute(ribs, 3));
  const ribMesh = new THREE.LineSegments(ribGeo,
    new THREE.LineBasicMaterial({ color: 0x9ebfc9, toneMapped: false }));
  ribMesh.name = `${plan.id}-architectural-ribs`;
  group.add(ribMesh);

  // Partner artwork reuses the approved, locally generated V7 atlas.
  // 6 positions on both sides = 12 panels per tunnel, in a single draw call.
  const signs: number[] = [], signUv: number[] = [], signIndices: number[] = [];
  const brandNames: string[] = [];
  for (let j = 0; j < 6; j++) {
    const d = 39 + j * 53;
    const frame = frameAt(track, plan.startMeters + d);
    for (const side of [-1, 1]) {
      const brandIndex = (ordinal * 3 + j * 2 + (side + 1) / 2) % TRACKSIDE_BRANDS.length;
      brandNames.push(TRACKSIDE_BRANDS[brandIndex].name);
      const lateral = side * (half - .20), halfWidth = 4.8;
      const center = frame.point.clone().addScaledVector(frame.right, lateral);
      const x1 = center.x - frame.tangent.x * halfWidth;
      const x2 = center.x + frame.tangent.x * halfWidth;
      const z1 = center.z - frame.tangent.z * halfWidth;
      const z2 = center.z + frame.tangent.z * halfWidth;
      const bottom = center.y + 4.45, top = bottom + 2.75;
      const base = signs.length / 3;
      signs.push(x1, bottom, z1, x2, bottom, z2, x1, top, z1, x2, top, z2);
      const low = 1 - (brandIndex + 1) / TRACKSIDE_BRANDS.length + .002;
      const high = 1 - brandIndex / TRACKSIDE_BRANDS.length - .002;
      if (side < 0) {
        signUv.push(0, low, 1, low, 0, high, 1, high);
        signIndices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      } else {
        signUv.push(1, low, 0, low, 1, high, 0, high);
        signIndices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      }
    }
  }
  const adverts = new THREE.Mesh(geometryOf(signs, signUv, signIndices),
    new THREE.MeshBasicMaterial({
      map: atlas, side: THREE.DoubleSide, toneMapped: false,
      depthTest: true, depthWrite: true
    }));
  adverts.name = `${plan.id}-interior-partners`;
  adverts.userData.brandNames = brandNames;
  group.add(adverts);

  group.userData.tunnel = {
    ...plan, visiblePortals: 2, widthMeters: half * 2, ceilingClearanceMeters: 10.6,
    overheadLights: lampCount, continuousLedStrips: 6, partnerPanels: brandNames.length, physicsCollidersAdded: 0
  };
  return group;
}

export function createRaceTunnels(track: Track): THREE.Group {
  const group = new THREE.Group();
  group.name = `illuminated-race-tunnels-${track.circuit.id}`;
  const plans = planRaceTunnels(track);
  if (!plans.length) return group;
  const atlas = makeBrandAtlas(); // shared throughout the whole circuit
  const concreteMap = makeTunnelConcreteTexture();
  plans.forEach((plan, i) => group.add(createTunnel(track, plan, i, atlas, concreteMap)));
  group.userData.tunnelCount = plans.length;
  group.userData.entriesMeters = plans.map(plan => Math.round(plan.startMeters));
  group.userData.portals = plans.length * 2;
  group.userData.lengthMetersEach = TUNNEL_LENGTH_METERS;
  group.userData.visualOnly = true;
  return group;
}
