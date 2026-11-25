"""Optimize scanned tree meshes, retain original material/UV data. Review candidates only."""
import bpy, pathlib, sys, json
args=sys.argv[sys.argv.index('--')+1:]; root=pathlib.Path(args[0]); out=pathlib.Path(args[1])
report=[]
for asset in ['island_tree_01','island_tree_02','island_tree_03']:
    for name,budget in [('near',18000),('far',2200)]:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=str(root/asset/(asset+'.gltf')))
        meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
        if not meshes: raise RuntimeError('Missing tree meshes')
        # Prefer a single authored LOD if the source explicitly labels several.
        lod0=[o for o in meshes if 'lod0' in o.name.lower() or 'lod_0' in o.name.lower()]
        if lod0 and len(lod0)<len(meshes):
            for o in meshes:
                if o not in lod0 and 'lod' in o.name.lower():bpy.data.objects.remove(o,do_unlink=True)
        meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
        def tris(o): return sum(max(0,len(p.vertices)-2) for p in o.data.polygons)
        before=sum(tris(o) for o in meshes)
        if before<=0:raise RuntimeError('Empty geometry')
        ratio=min(1,budget/before)
        for o in meshes:
            if ratio>=1 or tris(o)<100:continue
            bpy.context.view_layer.objects.active=o
            m=o.modifiers.new('Mobile geometry review','DECIMATE');m.ratio=ratio
            bpy.ops.object.modifier_apply(modifier=m.name)
        after=sum(tris(o) for o in meshes)
        if after<=0 or after>budget*1.3:raise RuntimeError(f'Triangle budget {asset} {name}: {after}')
        bpy.ops.export_scene.gltf(filepath=str(out/(asset+'-'+name+'.glb')),export_format='GLB',export_materials='EXPORT')
        report.append({'asset':asset,'tier':name,'sourceTriangles':before,'triangles':after,'materials':sum(len(o.data.materials) for o in meshes)})
(out/'geometry-audit.json').write_text(json.dumps(report,indent=2))
