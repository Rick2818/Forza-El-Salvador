import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { circuitAssetUrl } from "./circuitAssets";

/**
 * Reuses the approved, Blender-exported Suzaka GLB without rendering a second
 * overlapping road or barriers: those must come from the live Rapier track.
 */
export async function installSuzakaScenery(scene: THREE.Scene): Promise<void> {
  const source = await new GLTFLoader().loadAsync(circuitAssetUrl("suzaka"));
  const group = source.scene;
  group.name = "suzaka-blender-scenery";
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const name = object.name.toLowerCase();
    // The GLB's road/kerbs/walls are an editable modelling reference only.
    // Displaying them over the physics road would introduce z-fighting.
    if (/^(asfalto|linea|piano|proteccion|terreno)-/.test(name)) {
      object.visible = false;
      return;
    }
    object.castShadow = false;
    object.receiveShadow = true;
    object.frustumCulled = true;
  });
  scene.add(group);
}

/** Distant original snow-capped backdrop, one lightweight indexed mesh. */
export function createSuzakaMountain(): THREE.Mesh {
  const rings = 16, sides = 72;
  const vertices: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const earth = new THREE.Color(0x607b6b);
  const rock = new THREE.Color(0x74858b);
  const snow = new THREE.Color(0xe9eef0);
  const color = new THREE.Color();
  for (let r = 0; r <= rings; r++) {
    const f = r / rings;
    const h = f * 620;
    const radius = 820 * Math.pow(1 - f, 1.42);
    for (let i = 0; i < sides; i++) {
      const theta = 2 * Math.PI * i / sides;
      const variation = 1 + 0.055 * Math.sin(theta * 7 + f * 17) +
        0.028 * Math.cos(theta * 19 - f * 12);
      vertices.push(Math.cos(theta) * radius * variation, h, Math.sin(theta) * radius * variation);
      const snowLine = .77 + 0.025 * Math.sin(theta * 5);
      color.copy(earth).lerp(rock, f * .8);
      if (f > snowLine) color.lerp(snow, Math.min(1, (f - snowLine) * 40));
      colors.push(color.r, color.g, color.b);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let i = 0; i < sides; i++) {
      const a = r * sides + i, b = r * sides + (i + 1) % sides;
      const c = (r + 1) * sides + i, d = (r + 1) * sides + (i + 1) % sides;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({
    vertexColors: true, side: THREE.DoubleSide, fog: true
  }));
  mesh.name = "suzaka-distant-mountain";
  mesh.position.set(1100, -4, 1450);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}
