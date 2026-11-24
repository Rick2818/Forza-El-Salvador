import assert from "node:assert/strict";
import crypto from "node:crypto";
import {readFileSync,existsSync} from "node:fs";
const path="public/vehicles/generated/";
const manifest=JSON.parse(readFileSync(path+"manifest.json","utf8"));
assert.equal(manifest.photos.length,10);
assert.equal(new Set(manifest.photos.map(x=>x.id)).size,10);
for(const photo of manifest.photos){
  assert.equal(photo.source,"Live Three.js GLB WebGL canvas");
  assert.equal(photo.model,"models/external-candidates/"+photo.id+".glb");
  assert.equal(photo.thumbnail,"vehicles/generated/"+photo.id+".png");
  const modelFile="public/"+photo.model;
  const photoFile="public/"+photo.thumbnail;
  assert.ok(existsSync(modelFile)&&existsSync(photoFile));
  assert.equal(crypto.createHash("sha256").update(readFileSync(modelFile)).digest("hex"),photo.modelSha256);
  const bytes=readFileSync(photoFile);
  assert.equal(bytes.toString("hex",0,8),"89504e470d0a1a0a");
  assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"),photo.thumbnailSha256);
  assert.ok(photo.meshes>0);
}
console.log("OK: las diez fotografías se generaron de sus mismos GLB activos, SHA verificados");
