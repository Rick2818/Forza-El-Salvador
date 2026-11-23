"""Download pinned MIT sources, verify Git hashes, prepare UV-preserving maps.
python tools/blender/prepare-realistic-crew.py /tmp/horizon-rocketbox
Requires Python Pillow. Does not purchase or call a generation service.
"""
import hashlib,json,sys,urllib.request
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parent
manifest=json.loads((ROOT/'rocketbox-sources.json').read_text())
cache=Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/horizon-rocketbox')
for item in manifest['files']:
    path=cache/'source'/item['path'];path.parent.mkdir(parents=True,exist_ok=True)
    if not path.exists():
        url='https://raw.githubusercontent.com/'+manifest['repository']+'/'+manifest['commit']+'/'+urllib.parse.quote(item['path'])
        with urllib.request.urlopen(url) as r:path.write_bytes(r.read())
    data=path.read_bytes()
    actual=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
    if actual!=item['gitBlobSha1']:raise RuntimeError('Source checksum mismatch: '+str(path))
for role,code in [('Construction_Male_02','m101'),('Construction_Male_05','m104')]:
    out=cache/'prepared'/role;out.mkdir(parents=True,exist_ok=True)
    source=cache/'source/Assets/Avatars/Professions'/role/'Textures'
    for part in ['body','head']:
        for channel,limit,ext in [('color',2048,'jpg'),('normal',1024,'png')]:
            image=Image.open(source/(code+'_'+part+'_'+channel+'.tga')).convert('RGB')
            image.thumbnail((limit,limit),Image.Resampling.LANCZOS)
            dest=out/(code+'_'+part+'_'+channel+'.'+ext)
            image.save(dest,**({'quality':94,'subsampling':0} if ext=='jpg' else {'optimize':True}))
print('Verified Rocketbox sources and prepared textures:',cache)
