import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { preloadRealPorsche911, createRealPorsche911Visual, hasRealPorsche911 } from "./vehicle/porscheRealAsset";

const canvas = document.getElementById("preview-canvas") as HTMLCanvasElement | null;
if (!canvas) throw new Error("Falta #preview-canvas");

const renderer = new THREE.WebGLRenderer({
  canvas, antialias: true, powerPreference: "high-performance",
  alpha: false, stencil: false
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.6;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x22252a);
scene.fog = new THREE.Fog(0x22252a, 14, 28);
scene.add(new THREE.HemisphereLight(0xf5f6ff, 0x41434a, 3.5));
const key = new THREE.DirectionalLight(0xffffff, 6);
key.position.set(4, 9, 6);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.left = -8;
key.shadow.camera.right = 8;
key.shadow.camera.top = 8;
key.shadow.camera.bottom = -8;
key.shadow.bias = -0.0003;
scene.add(key);
const fill = new THREE.DirectionalLight(0xaec8f2, 2.8);
fill.position.set(-6, 4, -3);
scene.add(fill);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(160, 160),
  new THREE.MeshStandardMaterial({ color: 0x34373b, metalness: 0.16, roughness: 0.64 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const grid = new THREE.GridHelper(16, 16, 0x58595c, 0x373a3e);
grid.position.y = 0.002;
grid.material.transparent = true;
grid.material.opacity = 0.18;
scene.add(grid);

await preloadRealPorsche911();
const car = createRealPorsche911Visual({
  paintColor: 0x333438, accentColor: 0xffc900, number: 11, isPlayer: false
});
car.root.position.y = 0.62;
scene.add(car.root);

const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 150);
camera.position.set(6.3, 3.1, 7.6);
const orbit = new OrbitControls(camera, canvas);
orbit.target.set(0, 0.87, 0);
orbit.enableDamping = true;
orbit.dampingFactor = 0.055;
orbit.minDistance = 3.4;
orbit.maxDistance = 13;
orbit.minPolarAngle = 0.18;
orbit.maxPolarAngle = Math.PI * 0.47;
orbit.enablePan = false;
orbit.update();

const fpsEl = document.getElementById("fps");
const geoEl = document.getElementById("geometry");
let objects = 0, tris = 0;
car.root.traverse(obj => {
  if (!(obj instanceof THREE.Mesh)) return;
  objects++;
  const geo = obj.geometry;
  tris += geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
});
if (geoEl) geoEl.textContent = `Modelo: ${hasRealPorsche911() ? "Blender 911" : "procedural"} · ` + `${objects} mallas · ${Math.round(tris).toLocaleString("es-SV")} triángulos`;

function resize(): void {
  const w = window.innerWidth, h = window.innerHeight;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

let frames = 0, last = performance.now();
renderer.setAnimationLoop(() => {
  orbit.update();
  renderer.render(scene, camera);
  frames++;
  const now = performance.now();
  if (now - last >= 1000) {
    if (fpsEl) fpsEl.textContent = `${Math.round(1000 * frames / (now-last))} FPS (visor)`;
    frames = 0;
    last = now;
  }
});
