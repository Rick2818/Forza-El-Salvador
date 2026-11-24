#!/usr/bin/env python3
"""Stage the original off-road assets outside Git; no asset publication.

Usage: python tools/prepare-offroad-assets.py --dirt /path/dirt_track_blend.zip
       --mud /path/forest-mud-puddle.zip --out /private/offroad-staging
The output directory must not exist and must be outside a Git worktree.
No Blender or game runtime is required for this preflight.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import shutil
import zipfile

EXPECTED = {
    "dirt": "30f6a490323a3fae8dea9110962b3d78d3dae51e50805ede1b19eb9a3dce6832",
    "mud": "88eebdf307515b9a1272ad0c5542a9c449605d744fd95435e5fcfec9613b077c",
}
SOURCES = {
    "dirt": "https://www.fab.com/listings/44a2cfed-774c-4ff7-9148-390cdd393dab",
    "mud": "https://www.fab.com/listings/7ce127e5-8eed-4455-a47b-99814c820ff9",
}

def digest(path):
    with path.open("rb") as f:
        return hashlib.file_digest(f, "sha256").hexdigest()

def unpack(z, target):
    if z.testzip() is not None:
        raise ValueError("Archive CRC failure")
    seen = set()
    for item in z.infolist():
        rel = PurePosixPath(item.filename)
        if (rel.is_absolute() or ".." in rel.parts or "\\" in item.filename
                or ":" in item.filename or not rel.parts):
            raise ValueError("Unsafe archive member")
        if item.is_dir():
            continue
        dest = target.joinpath(*rel.parts)
        if str(dest).casefold() in seen:
            raise ValueError("Duplicate archive member")
        seen.add(str(dest).casefold())
        dest.parent.mkdir(parents=True, exist_ok=True)
        with z.open(item) as src, dest.open("xb") as dst:
            shutil.copyfileobj(src, dst)
    return sorted(str(p.relative_to(target)) for p in target.rglob("*") if p.is_file())

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dirt", type=Path, required=True)
    parser.add_argument("--mud", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    out = args.out.resolve()
    if any((p / ".git").exists() for p in [out, *out.parents]):
        raise SystemExit("Refusing to stage third-party source assets inside Git.")
    if out.exists():
        raise SystemExit("Choose a new staging directory.")
    paths = {"dirt": args.dirt, "mud": args.mud}
    hashes = {k: digest(p) for k, p in paths.items()}
    if hashes != EXPECTED:
        raise SystemExit("Unexpected archive version; review the asset license and update the manifest explicitly.")
    out.mkdir(parents=True)
    report = {"status": "staged_not_runtime_ready", "license": "unverified",
              "assets": {}, "publication": "blocked_pending_license_and_runtime_validation"}
    try:
        for key, path in paths.items():
            with zipfile.ZipFile(path) as z:
                files = unpack(z, out / key)
                if key == "mud":
                    with zipfile.ZipFile(io.BytesIO(z.read("source/forest-puddle.zip"))) as inner:
                        files += ["fbx/" + f for f in unpack(inner, out / key / "fbx")]
            report["assets"][key] = {"sha256": hashes[key], "source": SOURCES[key],
                                     "archive_bytes": path.stat().st_size, "files": files}
        if not (out / "dirt/dirt_track.blend").is_file() or not (out / "mud/fbx/forest-puddle.fbx").is_file():
            raise ValueError("Expected terrain models missing")
        (out / "manifest.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    except Exception:
        shutil.rmtree(out)
        raise
    print(json.dumps(report, indent=2))

if __name__ == "__main__":
    main()
