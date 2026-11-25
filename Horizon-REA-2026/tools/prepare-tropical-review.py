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
for asset in ['island_tree_01','island_tree_02']:
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
for asset in ['mud_forest','dirt']:
    api=get_json('https://api.polyhaven.com/files/'+asset)
    for key in ['diff','nor_gl','rough']:
        entry=api[key]['1k']['jpg']
        records.append(download(entry,out/(asset+'_'+key+'.jpg')))
(out/'source-manifest.json').write_text(json.dumps({'license':'CC0-1.0','sources':records,'assets':['island_tree_01','island_tree_02','mud_forest','dirt'],'visualApproval':False},indent=2))
