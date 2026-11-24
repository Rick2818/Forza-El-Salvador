import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import * as THREE from "three";
import {removeExternalStage} from "../src/vehicle/externalBackdrop";

const root=new URL("../",import.meta.url).pathname;
const files=(x)=>readFileSync(root+x);
const manifest=JSON.parse(files("public/vehicles/generated/manifest.json").toString("utf8"));
const roster=files("src/vehicle/externalRoster.ts").toString("utf8");
const gallery=files("src/preview/gallery.ts").toString("utf8");
const driving=files("src/vehicle/externalDriving.ts").toString("utf8");
const hash=b=>createHash("sha256").update(b).digest("hex");

describe("Showroom V20: fotografía = GLB de carrera",()=>{
  it("las 10 fotos tienen un GLB de carrera con el mismo identificador y SHA",()=>{
    expect(manifest.photos).toHaveLength(10);
    for(const photo of manifest.photos){
      expect(photo.source).toBe("Live Three.js GLB WebGL canvas");
      expect(photo.model).toBe("models/external-candidates/"+photo.id+".glb");
      expect(roster).toContain('id:"'+photo.id+'"');
      expect(roster).toContain('modelUrl:"'+photo.model+'"');
      expect(hash(files("public/"+photo.model))).toBe(photo.modelSha256);
      expect(hash(files("public/"+photo.thumbnail))).toBe(photo.thumbnailSha256);
      expect(photo.approved).toBe(false);
    }
    expect(gallery).toContain("removeExternalStage(car.id, group)");
    expect(driving).toContain("removeExternalStage(id, scene)");
  });
  it("no elimina la carrocería Mercedes, sólo la plataforma externa",()=>{
    const scene=new THREE.Group();
    const parent=new THREE.Group();parent.name="GLTF_SceneRootNode";scene.add(parent);
    const plane=new THREE.Group();plane.name="Plane_4";parent.add(plane);
    const car=new THREE.Group();car.name="Mercedes_5";parent.add(car);
    car.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial()));
    removeExternalStage("mercedes-amg-gt-alternative",scene);
    expect(scene.getObjectByName("Plane_4")).toBeUndefined();
    expect(scene.getObjectByName("Mercedes_5")).toBe(car);
    expect(car.children).toHaveLength(1);
  });
  it("no altera otros vehículos ni acepta cambios no auditados de Mercedes",()=>{
    const scene=new THREE.Group();
    const plane=new THREE.Group();plane.name="Plane_4";scene.add(plane);
    removeExternalStage("ferrari-f430",scene);
    expect(scene.getObjectByName("Plane_4")).toBe(plane);
    expect(()=>removeExternalStage("mercedes-amg-gt-alternative",scene)).toThrow(/se cambió la estructura/);
  });
});
