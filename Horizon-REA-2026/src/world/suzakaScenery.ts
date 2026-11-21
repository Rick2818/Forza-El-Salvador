import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { batchStaticScenery } from "../render/staticBatch";
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
    if (/arbol|sakura|pino|tree|vegetaci/.test(name)) { object.visible=false; return; }
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
  batchStaticScenery(group);
  scene.add(group);
}

/** Layered, asymmetric mountain ridges, kept outside the entire figure-eight. */
export function createSuzakaMountain(): THREE.Group {
  const group=new THREE.Group();group.name="suzaka-mountain-range";
  for(let layer=0;layer<3;layer++) {
    const positions:number[]=[],colors:number[]=[],indices:number[]=[];
    const sides=192,rows=12,radius=1850+layer*600;
    const forest=new THREE.Color([0x4b665b,0x667c7d,0x82949c][layer]);
    const rock=new THREE.Color([0x7b8078,0x87908d,0xa3afaf][layer]);
    const color=new THREE.Color();
    for(let row=0;row<=rows;row++)for(let side=0;side<=sides;side++) {
      const angle=side/sides*Math.PI*2,f=row/rows;
      const crest=190+layer*100+150*(.5+.5*Math.sin(angle*7+layer*3))+90*Math.sin(angle*13+1.2)**2;
      const r=radius+(f-.5)*750;
      const ridge=Math.pow(Math.sin(f*Math.PI),1.4);
      const height=-20+crest*ridge*(.86+.14*Math.sin(angle*43+f*6));
      positions.push(Math.cos(angle)*r,height,Math.sin(angle)*r);
      color.copy(forest).lerp(rock,Math.max(0,(height-180)/450));
      const shade=.78+.22*Math.sin(angle*27+f*8)**2;color.multiplyScalar(shade);
      colors.push(color.r,color.g,color.b);
      if(row<rows && side<sides) {
        const a=row*(sides+1)+side,b=a+1,c=a+sides+1;
        indices.push(a,c,b,b,c,c+1);
      }
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute("color",new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide}));
    mesh.name="suzaka-mountain-layer-"+layer;group.add(mesh);
  }
  return group;
}
