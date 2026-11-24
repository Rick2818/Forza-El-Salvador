#!/usr/bin/env python3
"""Lossless-texture preflight for the supplied Forest Mud Puddle FBX 7400.

Requires numpy and Pillow. Run with a private staging directory:
python tools/convert-offroad-mud-8k.py /private/mud/fbx /private/mud-8k.glb
No originals or generated GLB may be published before license approval.
Material translation and runtime appearance require separate visual review.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import struct
import zlib

import numpy as np
from PIL import Image

def parse_fbx(path):
    with path.open("rb") as f:
        if f.read(23) != b"Kaydara FBX Binary  \x00\x1a\x00":
            raise ValueError("Expected binary FBX")
        if struct.unpack("<I", f.read(4))[0] != 7400:
            raise ValueError("Expected FBX 7400")
        def node():
            h = f.read(13)
            if len(h) < 13:
                return None
            end, n, _, k = struct.unpack("<IIIB", h)
            if not end:
                return None
            name = f.read(k).decode()
            props = []
            scalar = {b"Y":"h", b"C":"?", b"I":"i", b"F":"f", b"D":"d", b"L":"q"}
            arrays = {b"f":"<f4", b"d":"<f8", b"l":"<i8", b"i":"<i4", b"b":"u1", b"c":"u1"}
            for _ in range(n):
                t = f.read(1)
                if t in scalar:
                    fmt = "<" + scalar[t]
                    props.append(struct.unpack(fmt, f.read(struct.calcsize(fmt)))[0])
                elif t in (b"S", b"R"):
                    length = struct.unpack("<I", f.read(4))[0]
                    raw = f.read(length)
                    props.append(raw.decode(errors="replace") if t == b"S" else raw)
                elif t in arrays:
                    count, enc, size = struct.unpack("<III", f.read(12))
                    raw = f.read(size)
                    props.append(np.frombuffer(zlib.decompress(raw) if enc else raw,
                                               dtype=arrays[t], count=count))
                else:
                    raise ValueError(f"Unexpected FBX property {t!r}")
            children = []
            while f.tell() < end:
                x = node()
                if x is None:
                    break
                children.append(x)
            f.seek(end)
            return name, props, children
        nodes = []
        while (n := node()) is not None:
            nodes.append(n)
        return nodes

def child(n, name):
    return next(x for x in n[2] if x[0] == name)

def val(n, name):
    return child(n, name)[1][0]

def convert(root, output):
    if output.exists() or any((p / ".git").exists() for p in output.resolve().parents):
        raise ValueError("Choose a new output outside the Git worktree")
    objects = next(x for x in parse_fbx(root / "forest-puddle.fbx") if x[0] == "Objects")
    g = child(objects, "Geometry")
    v = val(g, "Vertices").reshape(-1, 3)
    poly = val(g, "PolygonVertexIndex")
    if len(poly) != 318183 * 3 or not np.all(poly[2::3] < 0) or not np.all(poly.reshape(-1,3)[:,:2] >= 0):
        raise ValueError("Unexpected triangulation")
    idx = np.where(poly < 0, -poly-1, poly)
    normal = val(child(g, "LayerElementNormal"), "Normals").reshape(-1,3)
    uv_layer = child(g, "LayerElementUV")
    uv = val(uv_layer, "UV").reshape(-1,2)[val(uv_layer, "UVIndex")]
    mat = val(child(g, "LayerElementMaterial"), "Materials")
    if len(mat)*3 != len(idx) or len(normal) != len(idx) or not np.all(np.isin(mat,[0,1,2])):
        raise ValueError("Unexpected source material or normal layout")
    # Verified source model: -90 degree X rotation, 100 cm scale.
    def rotate(a):
        return a[:,[0,2,1]] * np.array([1,1,-1])
    v, normal = rotate(v), rotate(normal)
    uv[:,1] = 1-uv[:,1]
    center = (v.min(0)+v.max(0))/2
    center[1] = v.min(0)[1]
    v -= center

    buf = bytearray()
    views, access, images, textures, materials, primitives, hashes = [], [], [], [], [], [], []
    def view(data, target=None):
        while len(buf)%4:
            buf.append(0)
        d = {"buffer":0,"byteOffset":len(buf),"byteLength":len(data)}
        if target:
            d["target"] = target
        views.append(d)
        buf.extend(data)
        return len(views)-1
    def accessor(a, ctype, typ, target):
        d = {"bufferView":view(a.tobytes(),target),"componentType":ctype,"count":len(a),"type":typ}
        if typ == "VEC3" and target == 34962:
            d.update(min=a.min(0).tolist(),max=a.max(0).tolist())
        access.append(d)
        return len(access)-1
    def texture(path):
        raw = path.read_bytes()
        with Image.open(io.BytesIO(raw)) as im:
            if im.size != (8192,8192) or im.format != "JPEG":
                raise ValueError("Expected unchanged 8K JPEG")
        vi = view(raw)
        d = views[vi]
        if bytes(buf[d["byteOffset"]:d["byteOffset"]+d["byteLength"]]) != raw:
            raise ValueError("Embedded texture changed")
        hashes.append({"name":path.name,"sha256":hashlib.sha256(raw).hexdigest()})
        images.append({"bufferView":vi,"mimeType":"image/jpeg"})
        textures.append({"source":len(images)-1,"sampler":0})
        return len(textures)-1
    for i in range(3):
        suffix = "" if i == 0 else str(i)
        base = texture(root / f"forest-puddle{suffix}.jpg")
        nm = texture(root / f"forest-puddle_normal{suffix}.jpg")
        # Provisional FBX Phong to glTF PBR translation, NOT a visual approval.
        materials.append({"name":f"Mud {i}","pbrMetallicRoughness":{
            "baseColorTexture":{"index":base},"metallicFactor":0,"roughnessFactor":0.88},
            "normalTexture":{"index":nm},"doubleSided":True})
        mask = np.repeat(mat == i,3)
        a = np.concatenate([v[idx[mask]],normal[mask],uv[mask]],axis=1).astype("<f4")
        unique, inv = np.unique(a,axis=0,return_inverse=True)
        ix = inv.astype("<u4").reshape(-1)
        if not np.array_equal(a, unique[ix]):
            raise ValueError("Corner attributes changed")
        primitives.append({"attributes":{
            "POSITION":accessor(np.ascontiguousarray(unique[:,:3]),5126,"VEC3",34962),
            "NORMAL":accessor(np.ascontiguousarray(unique[:,3:6]),5126,"VEC3",34962),
            "TEXCOORD_0":accessor(np.ascontiguousarray(unique[:,6:]),5126,"VEC2",34962)},
            "indices":accessor(ix,5125,"SCALAR",34963),"material":i})
    d = {"asset":{"version":"2.0","generator":"Horizon local 8K preflight"},
         "scene":0,"scenes":[{"nodes":[0]}],"nodes":[{"mesh":0,"name":"Forest mud puddle"}],
         "meshes":[{"primitives":primitives}],"materials":materials,"textures":textures,
         "images":images,"samplers":[{"magFilter":9729,"minFilter":9987,"wrapS":10497,"wrapT":10497}],
         "accessors":access,"bufferViews":views,"buffers":[{"byteLength":len(buf)}]}
    js = json.dumps(d,separators=(",",":")).encode()
    js += b" "*((-len(js))%4)
    buf += b"\0"*((-len(buf))%4)
    with output.open("xb") as f:
        f.write(struct.pack("<4sII",b"glTF",2,12+8+len(js)+8+len(buf)))
        f.write(struct.pack("<I4s",len(js),b"JSON")+js)
        f.write(struct.pack("<I4s",len(buf),b"BIN\0"))
        f.write(buf)
    print(json.dumps({"triangles":318183,"textures":hashes,"bytes":output.stat().st_size,
                      "visual_approval":False,"publication_approval":False},indent=2))

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("source",type=Path)
    p.add_argument("output",type=Path)
    a = p.parse_args()
    convert(a.source,a.output)
