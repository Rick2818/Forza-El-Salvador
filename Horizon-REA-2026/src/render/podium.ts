/**
 * Podium ceremony.
 *
 * A small, self-contained scene shown after a race: the three finishers on the
 * steps, a presenter with the trophy and a slow camera move. It is a
 * simulation — no money, no purchased assets — and it owns its own scene so the
 * race world can stay untouched underneath.
 */

import * as THREE from "three";

export interface PodiumEntry {
  name: string;
  position: number;
  paint: number;
  isPlayer: boolean;
}

const GOLD = 0xf3c14a;
const GOLD_DARK = 0xb8891f;
const SKIN = 0xd9a37c;
const HAIR = 0xe8c56a;
const DRESS = 0xf2f3f6;
const SHOE = 0x14161b;

function capsule(radius: number, length: number, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 6, 12), material);
  mesh.castShadow = true;
  return mesh;
}

/** Simple humanoid: enough silhouette to read as a person at ceremony distance. */
function buildFigure(opts: {
  suit: number;
  hair: number;
  height?: number;
  dress?: boolean;
}): THREE.Group {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.72 });
  const cloth = new THREE.MeshStandardMaterial({ color: opts.suit, roughness: opts.dress ? 0.66 : 0.8 });
  const hairMat = new THREE.MeshStandardMaterial({ color: opts.hair, roughness: 0.55 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: SHOE, roughness: 0.6 });
  const scale = opts.height ?? 1;

  const legs = new THREE.Group();
  for (const side of [-1, 1]) {
    const leg = capsule(0.085 * scale, 0.62 * scale, opts.dress ? skin : cloth);
    leg.position.set(side * 0.1 * scale, 0.42 * scale, 0);
    legs.add(leg);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.12 * scale, 0.07 * scale, 0.24 * scale), shoeMat);
    shoe.position.set(side * 0.1 * scale, 0.035 * scale, 0.03 * scale);
    shoe.castShadow = true;
    legs.add(shoe);
  }
  group.add(legs);

  if (opts.dress) {
    const skirt = new THREE.Mesh(
      new THREE.ConeGeometry(0.26 * scale, 0.55 * scale, 16, 1, true),
      new THREE.MeshStandardMaterial({ color: DRESS, roughness: 0.7, side: THREE.DoubleSide })
    );
    skirt.position.y = 0.78 * scale;
    skirt.castShadow = true;
    group.add(skirt);
  }

  const torso = capsule(0.16 * scale, 0.42 * scale, cloth);
  torso.position.y = 1.06 * scale;
  group.add(torso);

  for (const side of [-1, 1]) {
    const arm = capsule(0.055 * scale, 0.46 * scale, opts.dress ? skin : cloth);
    arm.position.set(side * 0.23 * scale, 1.1 * scale, 0);
    arm.rotation.z = side * 0.14;
    group.add(arm);
  }

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115 * scale, 20, 16), skin);
  head.position.y = 1.45 * scale;
  head.castShadow = true;
  group.add(head);

  // Hair: a slightly larger cap at the back of the head.
  const hairMesh = new THREE.Mesh(new THREE.SphereGeometry(0.128 * scale, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), hairMat);
  hairMesh.position.set(0, 1.47 * scale, -0.012 * scale);
  hairMesh.rotation.x = -0.28;
  hairMesh.castShadow = true;
  group.add(hairMesh);

  // Long hair down the back, only for the presenter.
  if (opts.dress) {
    const fall = new THREE.Mesh(new THREE.CapsuleGeometry(0.085 * scale, 0.3 * scale, 6, 10), hairMat);
    fall.position.set(0, 1.28 * scale, -0.12 * scale);
    fall.castShadow = true;
    group.add(fall);
  }

  return group;
}

/** Trophy: bowl, stem and base in one lathe, plus two handles. */
function buildTrophy(scale = 1): THREE.Group {
  const group = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({
    color: GOLD,
    metalness: 1,
    roughness: 0.22,
    emissive: GOLD_DARK,
    emissiveIntensity: 0.18
  });

  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0.14, 0),
    new THREE.Vector2(0.145, 0.03),
    new THREE.Vector2(0.05, 0.05),
    new THREE.Vector2(0.032, 0.16),
    new THREE.Vector2(0.05, 0.2),
    new THREE.Vector2(0.14, 0.28),
    new THREE.Vector2(0.17, 0.42),
    new THREE.Vector2(0.155, 0.5),
    new THREE.Vector2(0.1, 0.5)
  ];
  const bowl = new THREE.Mesh(new THREE.LatheGeometry(profile, 32), gold);
  bowl.castShadow = true;
  group.add(bowl);

  for (const side of [-1, 1]) {
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.016, 8, 16, Math.PI * 1.15), gold);
    handle.position.set(side * 0.16, 0.37, 0);
    handle.rotation.set(0, 0, side * -0.9);
    handle.castShadow = true;
    group.add(handle);
  }

  group.scale.setScalar(scale);
  return group;
}

export class PodiumCeremony {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;

  private readonly steps: { height: number; position: number }[] = [
    { height: 0.55, position: -1.5 },
    { height: 0.38, position: 0 },
    { height: 0.24, position: 1.5 }
  ];
  private readonly figures: THREE.Group[] = [];
  private trophy: THREE.Group | null = null;
  private presenter: THREE.Group | null = null;
  private time = 0;
  private hero = new THREE.Vector3(0, 1.1, 0);

  constructor() {
    this.scene.background = new THREE.Color(0x05070c);
    this.scene.fog = new THREE.FogExp2(0x05070c, 0.035);

    this.camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 120);
    this.camera.position.set(6.2, 2.6, 6.2);

    // ---- Light: two warm stage lamps and a cool back light.
    const key = new THREE.SpotLight(0xffe6b8, 42, 22, Math.PI / 5, 0.45, 1.4);
    key.position.set(3.4, 6.2, 4.2);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    this.scene.add(key);
    this.scene.add(key.target);

    const fill = new THREE.SpotLight(0x9fc4ff, 20, 26, Math.PI / 4, 0.6, 1.2);
    fill.position.set(-4.6, 4.4, 3.2);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0x7fa8ff, 1.6);
    rim.position.set(-2, 3.6, -6);
    this.scene.add(rim);
    this.scene.add(new THREE.AmbientLight(0x2a3448, 0.6));
  }

  setEntries(entries: PodiumEntry[]): void {
    this.clear();
    this.time = 0;

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(9, 64),
      new THREE.MeshStandardMaterial({ color: 0x11151d, roughness: 0.55, metalness: 0.25 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const stepMat = new THREE.MeshStandardMaterial({ color: 0x1c2431, roughness: 0.5, metalness: 0.35 });
    const topMat = new THREE.MeshStandardMaterial({ color: 0x27313f, roughness: 0.45, metalness: 0.4 });

    for (const step of this.steps) {
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, step.height, 1.5), stepMat);
      body.position.set(0, step.height / 2, step.position);
      body.castShadow = true;
      body.receiveShadow = true;
      this.scene.add(body);
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.06, 1.56), topMat);
      top.position.set(0, step.height + 0.03, step.position);
      top.receiveShadow = true;
      this.scene.add(top);
    }

    const ordered = [...entries].sort((a, b) => a.position - b.position).slice(0, 3);
    ordered.forEach((entry, index) => {
      const step = this.steps[index];
      const figure = buildFigure({ suit: index === 0 ? 0x1f2836 : 0x2b3648, hair: 0x2a2018 });
      figure.position.set(0, step.height + 0.06, step.position);
      figure.rotation.y = Math.PI * 0.02;
      this.scene.add(figure);
      this.figures.push(figure);

      // A small name plate colour bar for the finisher.
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.06, 0.02),
        new THREE.MeshStandardMaterial({ color: entry.paint, roughness: 0.5 })
      );
      plate.position.set(0, 0.02, step.position + 0.78);
      this.scene.add(plate);
    });

    // Presenter: stands to the winner's left, holding the trophy.
    this.presenter = buildFigure({ suit: DRESS, hair: HAIR, dress: true });
    this.presenter.position.set(1.05, 0, -1.1);
    this.presenter.rotation.y = -0.55;
    this.scene.add(this.presenter);

    this.trophy = buildTrophy(1.15);
    this.trophy.position.set(0.62, 1.12, -0.72);
    this.scene.add(this.trophy);

    this.hero.set(0, this.steps[0].height + 1.1, -1.5);
    this.aimCamera(0);
  }

  private aimCamera(progress: number): void {
    const wide = new THREE.Vector3(6.4, 2.9, 6.4);
    const close = new THREE.Vector3(3.1, 2.0, 3.6);
    const position = wide.clone().lerp(close, Math.min(1, progress));
    const orbit = 0.12 * Math.sin(progress * Math.PI * 0.8);
    position.applyAxisAngle(new THREE.Vector3(0, 1, 0), orbit);
    this.camera.position.copy(position);
    this.camera.lookAt(this.hero);
  }

  update(dt: number): void {
    this.time += dt;
    this.aimCamera(this.time / 3.2);
    if (this.trophy) {
      // The cup is lifted and turned toward the winner over the first seconds.
      const t = Math.min(1, this.time / 2.4);
      const eased = t * t * (3 - 2 * t);
      this.trophy.position.set(
        0.62 - 0.34 * eased,
        1.12 + 0.34 * eased,
        -0.72 + 0.4 * eased
      );
      this.trophy.rotation.y = eased * 0.5;
    }
    if (this.presenter) {
      this.presenter.rotation.y = -0.55 + Math.sin(this.time * 0.7) * 0.05;
    }
  }

  private clear(): void {
    for (const child of [...this.scene.children]) {
      if (child instanceof THREE.Light) continue;
      this.scene.remove(child);
      child.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry?.dispose();
        const material = mesh.material;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material?.dispose();
      });
    }
    this.figures.length = 0;
    this.trophy = null;
    this.presenter = null;
  }

  /** Frame the ceremony for the current window size. */
  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
