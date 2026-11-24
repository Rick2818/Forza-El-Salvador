from pathlib import Path
from PIL import Image
import json,hashlib
source=Path("quality-evidence/cc0-pbr")
dest=Path("public/scenery/offroad-pbr")
dest.mkdir(parents=True,exist_ok=True)
manifest=json.loads((source/"manifest.json").read_text())
assert len(manifest)==6
for item in manifest:
    path=source/item["file"]
    assert hashlib.sha256(path.read_bytes()).hexdigest()==item["sha256"]
    with Image.open(path) as im:
        assert im.size==(2048,2048)
        im=im.convert("RGB")
        target=dest/(item["id"]+"-"+item["kind"]+".webp")
        im.save(target,"WEBP",quality=87 if item["kind"]=="diff" else 95,method=6)
        item["runtimeFile"]=target.name
        item["runtimeBytes"]=target.stat().st_size
        item["runtimeSha256"]=hashlib.sha256(target.read_bytes()).hexdigest()
(dest/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
print("Optimized",sum(x["runtimeBytes"] for x in manifest),"bytes")
