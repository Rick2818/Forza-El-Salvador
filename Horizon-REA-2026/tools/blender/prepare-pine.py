"""Download CC0 build inputs and sample the real pine needle distribution.

python tools/blender/prepare-pine.py /tmp/horizon-pine
Requires numpy and Pillow; not a runtime dependency of the game.
Only ~52 MB of the 949 MB source geometry is needed: real bark/trunk data
and needle positions. The high-resolution needles are never shipped.
"""
import sys, json, pathlib, urllib.request, concurrent.futures, shutil
import numpy as np
from PIL import Image

root=pathlib.Path(sys.argv[1]); root.mkdir(parents=True,exist_ok=True)
(root/'textures').mkdir(exist_ok=True)
headers={'User-Agent':'HorizonElSalvador/1.0 (CC0 asset build)'}
def request(url, extra=None):
    return urllib.request.urlopen(urllib.request.Request(url,headers={**headers,**(extra or {})}),timeout=180)
api=json.load(request('https://api.polyhaven.com/files/pine_tree_01'))
manifest=api['gltf']['1k']['gltf']
model=json.load(request(manifest['url']))
primitives=model['meshes'][1]['primitives']
needle_accessor=model['accessors'][primitives[2]['attributes']['POSITION']]
needed={needle_accessor['bufferView']}
for primitive in primitives[:2]:
    for index in [primitive['indices'],*primitive['attributes'].values()]:
        needed.add(model['accessors'][index]['bufferView'])
start=min(model['bufferViews'][i].get('byteOffset',0) for i in needed)
end=max(model['bufferViews'][i].get('byteOffset',0)+model['bufferViews'][i]['byteLength'] for i in needed)
binary=root/'pine.bin'
url='https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/pine_tree_01/pine_tree_01.bin'
if not binary.exists() or binary.stat().st_size!=end-start:
    with request(url,{'Range':f'bytes={start}-{end-1}'}) as response:
        if response.status==206:
            if not response.headers.get('Content-Range','').startswith(f'bytes {start}-{end-1}/'):
                raise ValueError('Unexpected source byte range')
            with binary.open('wb') as file: shutil.copyfileobj(response,file)
        elif response.status==200:
            # Some caches ignore Range. Stream, discard the prefix and retain
            # exactly the needed bytes rather than loading 949 MB into memory.
            remaining=start
            while remaining:
                data=response.read(min(1048576,remaining))
                if not data: raise ValueError('Truncated source before range')
                remaining-=len(data)
            remaining=end-start
            with binary.open('wb') as file:
                while remaining:
                    data=response.read(min(1048576,remaining))
                    if not data: raise ValueError('Truncated source range')
                    file.write(data); remaining-=len(data)
        else: raise ValueError('Unexpected geometry response')
    if binary.stat().st_size!=end-start: raise ValueError('Incomplete source geometry')
needle_view=model['bufferViews'][needle_accessor['bufferView']]
points=np.memmap(binary,dtype='<f4',mode='r',offset=needle_view['byteOffset']-start,
    shape=(needle_accessor['count'],3))[::4]
def clusters(size):
    _,first=np.unique(np.floor(points/size).astype('i4'),axis=0,return_index=True)
    return points[first].tolist()
(root/'clusters.json').write_text(json.dumps({'near':clusters(.6),'medium':clusters(1.0)}))
for view in model['bufferViews']: view['byteOffset']=max(0,view.get('byteOffset',0)-start)
model['buffers']=[{'byteLength':end-start,'uri':'pine.bin'}]
model['meshes']=[model['meshes'][1]]; model['meshes'][0]['primitives']=primitives[:2]
model['nodes']=[{'mesh':0,'name':'pine_tree_01_b_source'}];model['scenes']=[{'nodes':[0]}]
(root/'wood.gltf').write_text(json.dumps(model))
def download_image(image):
    name=image['uri'];path=root/name
    if not path.exists(): path.write_bytes(request(manifest['include'][name]['url']).read())
with concurrent.futures.ThreadPoolExecutor(3) as pool: list(pool.map(download_image,model['images']))
alpha='textures/pine_tree_01_twig_alpha_1k.png'
if not (root/alpha).exists(): (root/alpha).write_bytes(request(api['blend']['1k']['blend']['include'][alpha]['url']).read())
image=Image.open(root/'textures/pine_tree_01_twig_diff_1k.jpg').convert('RGBA').crop((0,0,240,460))
image.putalpha(Image.open(root/alpha).convert('L').crop((0,0,240,460)))
rgba=np.array(image)
mask=(rgba[:,:,1].astype(float)>rgba[:,:,0]*1.04)&(rgba[:,:,1]>rgba[:,:,2])&(rgba[:,:,1]>19)
rgba[:,:,3]=np.where(mask,rgba[:,:,3],0)
Image.fromarray(rgba).resize((256,512)).save(root/'needles.png')
print('Pine source ready:',root,'geometry bytes:',end-start,flush=True)
