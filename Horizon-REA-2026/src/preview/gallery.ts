import * as THREE from "three";
import { GalleryCustomizer, type WheelSet } from "./customizer";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

interface GalleryCar {
  id: string; title: string; author: string; type: "sport" | "pickup";
  note: string; origin: string;
}
const MODELS: readonly GalleryCar[] = [
  { id:"ferrari-f430", title:"Ferrari F430", author:"Ddiaz Design", type:"sport", note:"Sustituto propuesto del California T", origin:"https://sketchfab.com/3d-models/ferrari-f430-red-ec1836899a0f493990ef8164cd909446" },
  { id:"lamborghini-aventador", title:"Lamborghini Aventador", author:"BlackCube", type:"sport", note:"Modelo con interior; versión Roadster no verificada", origin:"https://sketchfab.com/3d-models/lamborghini-aventador-with-interior-36eb1fa54a0d4be695d4cd90c30f4ff1" },
  { id:"porsche-911-c4s", title:"Porsche 911 C4S", author:"JK3Dstudios", type:"sport", note:"911 C4S Aerokit 2020, no Turbo S", origin:"https://sketchfab.com/3d-models/ee69c474a1cc4085944cde4cb7ae87db" },
  { id:"bugatti-chiron-profilee", title:"Bugatti Chiron Profilée", author:"DisneyCars", type:"sport", note:"Chiron Profilée 2023", origin:"https://sketchfab.com/3d-models/6da5092ee455446cb050e4c6b4a3ac05" },
  { id:"koenigsegg-jesko", title:"Koenigsegg Jesko", author:"Ddiaz Design", type:"sport", note:"Jesko 2020; no edición Odin confirmada", origin:"https://sketchfab.com/3d-models/c657f51fb0db43e38fea172dfa385287" },
  { id:"mercedes-amg-gt-alternative", title:"Mercedes-AMG GT", author:"Yan Carvalho", type:"sport", note:"Alternativa: no es Black Series", origin:"https://sketchfab.com/3d-models/661dcab94455463784651a3ebc63cfb9" },
  { id:"tesla-roadster-electric-alternative", title:"Tesla Roadster 2020", author:"metarex.4d", type:"sport", note:"Alternativa eléctrica al Yangwang U9", origin:"https://sketchfab.com/3d-models/1fbf29e297bd4a17ac39a00a378441d8" },
  { id:"ford-f150-raptor-police", title:"Ford F-150 Raptor", author:"Vehsource", type:"pickup", note:"Modelo con decoración policial, no estándar", origin:"https://sketchfab.com/3d-models/840ede58ed40499a9cf332e25129f0b2" },
  { id:"ram-3500-alternative", title:"RAM 3500", author:"David_Holiday", type:"pickup", note:"Alternativa a la RAM 1500 TRX; 4×4 no probado", origin:"https://sketchfab.com/3d-models/6cd63c21d1bc46dc84ab09bb67483b8e" },
  { id:"chevrolet-silverado-ev-alternative", title:"Chevrolet Silverado EV RST", author:"Ddiaz Design", type:"pickup", note:"Alternativa eléctrica a Silverado Z71", origin:"https://sketchfab.com/3d-models/73a1f1a86dc54b97b1f658daf070460c" }
];
const $ = (id: string): HTMLElement => {
  const element = document.getElementById(id);
  if (!element) throw new Error("Falta elemento HTML: " + id);
  return element;
};
const canvas = $("model-canvas") as HTMLCanvasElement;
const stage = $("stage");
const status = $("status");
const modelName = $("model-name");
const subtitle = $("model-subtitle");
const metrics = $("metrics");
const credits = $("credits");

const scene = new THREE.Scene();
scene.background = new THREE.Color("#1b2838");
scene.add(new THREE.HemisphereLight(0xdceaff, 0x2c3744, 3.2));
const sun = new THREE.DirectionalLight(0xffffff, 3.4);
sun.position.set(8, 13, 8); scene.add(sun);
const fill = new THREE.DirectionalLight(0xb8d2ff, 2.8);
fill.position.set(-6, 6, -10); scene.add(fill);
const frontLight = new THREE.DirectionalLight(0xffcb94, 1.6);
frontLight.position.set(-7, 5, 7); scene.add(frontLight);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(400,400),
  new THREE.MeshStandardMaterial({ color:0x283644, roughness:0.88, metalness:0.06 })
);
floor.rotation.x = -Math.PI / 2; floor.position.y = -0.05; scene.add(floor);
const grid = new THREE.GridHelper(80, 40, 0x627890, 0x405368);
grid.position.y = -0.042; scene.add(grid);

const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, preserveDrawingBuffer:true, powerPreference:"high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.4;
const camera = new THREE.PerspectiveCamera(37, 1, 0.02, 200);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.98;
controls.minDistance = 1.5;
controls.maxDistance = 14;

const loader = new GLTFLoader();
const draco = new DRACOLoader();
draco.setDecoderPath(import.meta.env.BASE_URL + "model-draco/");
loader.setDRACOLoader(draco);
loader.setMeshoptDecoder(MeshoptDecoder);
const customizer = new GalleryCustomizer(scene, loader);

let currentModel: THREE.Group | null = null;
let currentCar = MODELS[0];
try {
  const saved = localStorage.getItem("horizon.selected-vehicle");
  currentCar = MODELS.find(car => car.id === saved) ?? MODELS[0];
} catch { /* persistencia opcional */ }
let activeView = "front";
let height = 1.8;
let modelExtent = 6;
let generation = 0;

function resize(): void {
  const w = Math.max(100, stage.clientWidth);
  const h = Math.max(100, stage.clientHeight);
  renderer.setSize(w,h,false);
  camera.aspect = w/h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
new ResizeObserver(resize).observe(stage);
resize();

function chooseAngle(angle: string): void {
  activeView = angle;
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-view]")) {
    button.classList.toggle("active", button.dataset.view === angle);
  }
  // Acercar la cámara de las vistas 3D un 28.6% para que el auto aparente
  // aproximadamente un 40% más grande que en la versión anterior del garaje.
  // No modificamos escala del GLB, pivotes ni física.
  const distance = Math.max(modelExtent * 0.95, 4.5) / 1.4;
  let target = new THREE.Vector3(0, height*0.47, 0);
  if (angle === "front") camera.position.set(distance*0.86, height*0.94, distance*1.15);
  else if (angle === "rear") camera.position.set(-distance*0.87, height*0.89, -distance*1.13);
  else if (angle === "cabin") {
    target = new THREE.Vector3(0,height*0.67,-distance*0.55);
    camera.position.set(0,height*0.75,distance*0.05);
  } else if (angle === "under") {
    target = new THREE.Vector3(0,height*0.28,0);
    camera.position.set(distance*.78,-height*1.8,distance*.86);
  } else camera.position.set(distance,height,distance);
  floor.visible = angle !== "under";
  grid.visible = angle !== "under";
  controls.target.copy(target);
  controls.update();
  camera.lookAt(target);
}

function releaseOld(): void {
  customizer.dispose();
  if (!currentModel) return;
  scene.remove(currentModel);
  currentModel.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of mats) {
      if (mat instanceof THREE.MeshStandardMaterial) {
        mat.map?.dispose(); mat.normalMap?.dispose(); mat.metalnessMap?.dispose();
        mat.roughnessMap?.dispose(); mat.emissiveMap?.dispose(); mat.aoMap?.dispose();
      }
      mat.dispose();
    }
  });
  currentModel = null;
}

async function showModel(car: GalleryCar): Promise<void> {
  const token = ++generation;
  currentCar = car;
  ($("drive-current") as HTMLButtonElement).disabled = true;
  // Remove the previous car immediately: a failed selection must never leave
  // another vehicle visible under the requested model's name.
  releaseOld();
  modelName.textContent = car.title;
  subtitle.textContent = car.note;
  status.textContent = "Cargando archivo GLB real…";
  metrics.textContent = "Geometría: verificando archivo";
  credits.replaceChildren();
  const link = document.createElement("a");
  link.href = car.origin;
  link.textContent = car.author + " · fuente y atribución";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  credits.append(link);
  for (const element of document.querySelectorAll<HTMLButtonElement>(".choice")) {
    element.setAttribute("aria-pressed", String(element.dataset.car === car.id));
  }
  try {
    await MeshoptDecoder.ready;
    const file = import.meta.env.BASE_URL + "models/external-candidates/" + car.id + ".glb";
    const gltf = await loader.loadAsync(file, event => {
      if (token !== generation) return;
      if (event.total) status.textContent = "Descargando GLB: " + Math.round(100*event.loaded/event.total) + "%";
    });
    if (token !== generation) {
      gltf.scene.traverse(child => {
        if (child instanceof THREE.Mesh) child.geometry.dispose();
      });
      return;
    }
    const group = gltf.scene;
    scene.add(group);
    group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(group);
    const size = bounds.getSize(new THREE.Vector3());
    if (!Number.isFinite(size.length()) || size.length() < 0.001)
      throw new Error("El archivo no contiene una carrocería renderizable.");
    const factor = 5.6 / Math.max(size.x, size.z, size.y);
    group.scale.multiplyScalar(factor);
    group.updateMatrixWorld(true);
    const scaled = new THREE.Box3().setFromObject(group);
    const mid = scaled.getCenter(new THREE.Vector3());
    group.position.sub(new THREE.Vector3(mid.x, scaled.min.y, mid.z));
    group.updateMatrixWorld(true);
    const finalBox = new THREE.Box3().setFromObject(group);
    const d = finalBox.getSize(new THREE.Vector3());
    height = d.y;
    modelExtent = Math.max(d.x,d.z);
    let meshes=0, triangles=0, wheelNames=0, cabinNames=0, underNames=0;
    group.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      meshes++;
      const g = node.geometry;
      triangles += (g.index?.count ?? g.getAttribute("position")?.count ?? 0)/3;
      const label = (node.name + " " + (Array.isArray(node.material)
          ? node.material.map(m => m.name).join(" ")
          : node.material.name)).toLowerCase();
      if (/wheel|tire|tyre|rim|llanta|rueda/.test(label)) wheelNames++;
      if (/interior|seat|cockpit|dashboard|steer|asiento|tablero/.test(label)) cabinNames++;
      if (/underbody|chassis|suspension|axle|diffuser|exhaust|floorpan/.test(label)) underNames++;
    });
    currentModel = group;
    ($("drive-current") as HTMLButtonElement).disabled = false;
    customizer.attach(group,car.id,car.type);
    chooseAngle(activeView);
    status.textContent = "✓ GLB candidato cargado. Falta validar fidelidad, licencia y comportamiento en carrera.";
    metrics.textContent = "Mallas: " + meshes + " · Triángulos: " + Math.round(triangles).toLocaleString("es") +
      " · Piezas de ruedas identificadas: " + wheelNames +
      " · Cabina: " + cabinNames + " · Bajos: " + underNames;
    (window as unknown as { __HORIZON_GALLERY__?: object }).__HORIZON_GALLERY__ = {
      selected:car.id,loaded:true,meshes,triangles:Math.round(triangles)
    };
  } catch (error) {
    if (token !== generation) return;
    status.textContent = "No se pudo cargar el GLB. " + (error instanceof Error ? error.message : String(error));
    console.error("[Horizon gallery] Fallo al cargar", car.id, error);
    (window as unknown as { __HORIZON_GALLERY__?: object }).__HORIZON_GALLERY__ = {
      selected:car.id,loaded:false,error:String(error)
    };
  }
}

for (const car of MODELS) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "choice";
  button.dataset.car = car.id;
  button.setAttribute("aria-pressed", "false");
  const title = document.createElement("strong");
  title.textContent = car.title;
  const description = document.createElement("small");
  description.textContent = car.note;
  button.append(title,description);
  button.addEventListener("click", () => { void showModel(car); });
  (car.type === "sport" ? $("sports") : $("pickups")).append(button);
}

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-view]")) {
  button.addEventListener("click", () => chooseAngle(button.dataset.view ?? "front"));
}
for (const swatch of document.querySelectorAll<HTMLButtonElement>("[data-paint]")) {
  swatch.addEventListener("click", () => customizer.setPaint(swatch.dataset.paint ?? "original"));
}
const customPaint = $("custom-paint") as HTMLInputElement;
customPaint.addEventListener("input", () => customizer.setPaint(customPaint.value));
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-wheelset]")) {
  button.addEventListener("click", () => { void customizer.setWheels((button.dataset.wheelset ?? "original") as WheelSet); });
}
$("drive-current").addEventListener("click", () => {
  if (!currentModel) return;
  // Include the exact asset ID in the navigation as well as localStorage.
  // This works when mobile/private browsers block localStorage.
  try { localStorage.setItem("horizon.selected-vehicle", currentCar.id); } catch { /* URL is authoritative */ }
  const destination = new URL("race.html", window.location.href);
  destination.searchParams.set("vehicle", currentCar.id);
  window.location.assign(destination.toString());
});
const rotateButton = $("rotate") as HTMLButtonElement;
rotateButton.addEventListener("click", () => {
  controls.autoRotate = !controls.autoRotate;
  // Girar al doble de la velocidad anterior: vuelta de 360° aprox. cada 5 segundos a 60 FPS.
  controls.autoRotateSpeed = 12;
  rotateButton.setAttribute("aria-pressed", String(controls.autoRotate));
});
$("capture").addEventListener("click", () => {
  if (!currentModel) return;
  renderer.render(scene,camera);
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = "horizon-real-" + currentCar.id + "-" + activeView + ".png";
  a.click();
});

renderer.setAnimationLoop(() => {
  if (!document.hidden) {
    controls.update();
    renderer.render(scene,camera);
  }
});
void showModel(currentCar);
