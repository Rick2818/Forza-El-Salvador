"""Retrieve original CC0 Poly Haven source files for review, never at runtime."""
import pathlib, urllib.request, urllib.parse, json, hashlib, sys, shutil
root=pathlib.Path(sys.argv[1]); out=pathlib.Path(sys.argv[2]); root.mkdir(parents=True,exist_ok=True); out.mkdir(parents=True,exist_ok=True)
def request(url):
    if urllib.parse.urlparse(url).scheme != 'https': raise ValueError('HTTPS required')
    return urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'HorizonElSalvador/1.0 (asset evaluation)'}),timeout=180)
def get_json(url):
    with request(url) as res: return json.load(res)
def download(entry,path):
    url=entry['url']; path.parent.mkdir(parents=True,exist_ok=True)
    with request(url) as res,path.open('wb') as f: shutil.copyfileobj(res,f)
    if entry.get('size') and path.stat().st_size!=entry['size']: raise ValueError(f'Incomplete asset {path}')
    expected=entry.get('md5')
    if expected and hashlib.md5(path.read_bytes()).hexdigest()!=expected: raise ValueError(f'Checksum mismatch {path}')
    return {'source':url,'bytes':path.stat().st_size,'sha256':hashlib.file_digest(path.open('rb'),'sha256').hexdigest()}
records=[]
for asset in ['island_tree_01','island_tree_02','island_tree_03']:
    api=get_json('https://api.polyhaven.com/files/'+asset)
    manifest=api['gltf']['1k']['gltf']
    folder=root/asset; folder.mkdir(exist_ok=True)
    model=folder/(asset+'.gltf')
    records.append(download(manifest,model))
    data=json.loads(model.read_text())
    for obj in data.get('buffers',[])+data.get('images',[]):
        name=obj.get('uri','')
        if not name or name.startswith('data:'):continue
        relative=pathlib.PurePosixPath(urllib.parse.unquote(name))
        if relative.is_absolute() or '..' in relative.parts: raise ValueError('Unsafe glTF path')
        entry=manifest.get('include',{}).get(name) or manifest.get('include',{}).get(str(relative))
        if not entry:raise ValueError('Missing source dependency '+name)
        records.append(download(entry,folder/relative))
# Resolve actual map keys rather than assuming the "diff" key.
for asset,label in [('mud_forest','mud_forest'),('forest_ground_04','dirt'),('forest_floor','forest_floor')]:
    api=get_json('https://api.polyhaven.com/files/'+asset)
    for kind,aliases in [('diff',('diff','diffuse','albedo','basecolor')),('nor_gl',('nor_gl','normal_gl')),('rough',('rough','roughness'))]:
        key=next((k for k in api if k.lower() in aliases),None)
        if key is None: key=next((k for k in api if any(k.lower().endswith('_'+a) for a in aliases)),None)
        if key is None: raise ValueError(f'{asset}: missing {kind}; API keys={list(api)}')
        tier=api[key].get('1k')
        if not tier:raise ValueError(f'{asset}: missing 1k {key}')
        if 'jpg' not in tier:raise ValueError(f'{asset}: missing JPEG {key}: {list(tier)}')
        records.append(download(tier['jpg'],out/(label+'_'+kind+'.jpg')))
(out/'source-manifest.json').write_text(json.dumps({'license':'CC0-1.0','sources':records,'assets':['island_tree_01','island_tree_02','island_tree_03','mud_forest','forest_ground_04','forest_floor'],'visualApproval':False},indent=2))
