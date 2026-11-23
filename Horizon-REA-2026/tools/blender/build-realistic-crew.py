"""Build textured, fully skinned workshop staff from Microsoft Rocketbox (MIT).
Input cache is populated by prepare-realistic-crew.py. No procedural human mesh.
blender -b --python tools/blender/build-realistic-crew.py -- /tmp/horizon-rocketbox
"""
import bpy,bmesh,os,sys,json,math,gzip,shutil
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
CACHE=Path(sys.argv[sys.argv.index('--')+1]) if '--' in sys.argv else Path('/tmp/horizon-rocketbox')
OUT=ROOT/'public/models/realistic-crew';OUT.mkdir(parents=True,exist_ok=True)
SOURCE=ROOT/'tools/blender/sources/realistic-crew';SOURCE.mkdir(parents=True,exist_ok=True)
REPORT={}
for label,role,code in [('senior','Construction_Male_02','m101'),('technician','Construction_Male_05','m104')]:
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    for a in list(bpy.data.actions):bpy.data.actions.remove(a)
    bpy.ops.import_scene.fbx(filepath=str(CACHE/'source/Assets/Avatars/Professions'/role/'Export'/(role+'.fbx')))
    rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');rig.name='CrewRig_'+label
    mesh=next(o for o in bpy.context.scene.objects if o.type=='MESH');mesh.name='CrewSkin_'+label
    # Remove the construction hardhat; preserve the textured anatomical head.
    helmet=[i for i,m in enumerate(mesh.data.materials) if 'helmet' in m.name.lower()]
    if helmet:
        bm=bmesh.new();bm.from_mesh(mesh.data)
        bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.material_index in helmet],context='FACES')
        unused=[v for v in bm.verts if not v.link_faces]
        if unused:bmesh.ops.delete(bm,geom=unused,context='VERTS')
        bm.to_mesh(mesh.data);bm.free();mesh.data.update()
    bpy.context.view_layer.objects.active=mesh;mesh.select_set(True)
    for i in sorted(helmet,reverse=True):
        mesh.active_material_index=i;bpy.ops.object.material_slot_remove()
    # Use the photographic albedo and real surface normals, never palette colors.
    for mat in mesh.data.materials:
        part='head' if 'head' in mat.name.lower() else 'body'
        mat.name='crew_'+label+'_'+part
        mat.use_nodes=True;nodes=mat.node_tree.nodes;nodes.clear();links=mat.node_tree.links
        out=nodes.new('ShaderNodeOutputMaterial');bsdf=nodes.new('ShaderNodeBsdfPrincipled')
        bsdf.inputs['Roughness'].default_value=.70 if part=='head' else .88
        bsdf.inputs['Metallic'].default_value=0
        bsdf.inputs['Specular IOR Level'].default_value=.3
        albedo=bpy.data.images.load(str(CACHE/'prepared'/role/(code+'_'+part+'_color.jpg')),check_existing=True)
        albedo.colorspace_settings.name='sRGB'
        normal=bpy.data.images.load(str(CACHE/'prepared'/role/(code+'_'+part+'_normal.png')),check_existing=True)
        normal.colorspace_settings.name='Non-Color'
        tex=nodes.new('ShaderNodeTexImage');tex.image=albedo
        normal_tex=nodes.new('ShaderNodeTexImage');normal_tex.image=normal
        normal_map=nodes.new('ShaderNodeNormalMap');normal_map.inputs['Strength'].default_value=.65
        links.new(tex.outputs['Color'],bsdf.inputs['Base Color']);links.new(normal_tex.outputs['Color'],normal_map.inputs['Color'])
        links.new(normal_map.outputs['Normal'],bsdf.inputs['Normal']);links.new(bsdf.outputs['BSDF'],out.inputs['Surface'])
    rig.animation_data_clear()
    for p in rig.pose.bones:p.rotation_mode='QUATERNION'
    # Work clips are transferred in armature space, including the bind-pose
    # difference. Merely assigning rotation curves would bend the A-pose wrong.
    tracks=[]
    for clip,filename,frames in [('idle','m_idle_breathe_01.max.fbx',120),('work','m_work_mid.max.fbx',350)]:
        before=set(bpy.data.objects)
        bpy.ops.import_scene.fbx(filepath=str(CACHE/'source/Assets/Animations/all_animations_max_motextr_static'/filename))
        imported=set(bpy.data.objects)-before
        motion=next(o for o in imported if o.type=='ARMATURE')
        max_frame=min(frames,int(motion.animation_data.action.frame_range[1]))
        action=bpy.data.actions.new('crew_'+clip);action.use_fake_user=True
        rig.animation_data_create();rig.animation_data.action=action
        # Parent-first global pose transfer, preserving facial bones absent from the clip.
        for frame in range(1,max_frame+1,2):
            bpy.context.scene.frame_set(frame)
            rig.matrix_world=motion.matrix_world.copy()
            for bone in rig.pose.bones:
                target=motion.pose.bones.get(bone.name)
                if target:bone.matrix=target.matrix.copy()
            bpy.context.view_layer.update()
            rig.keyframe_insert(data_path='location',frame=frame)
            rig.keyframe_insert(data_path='rotation_euler',frame=frame)
            rig.keyframe_insert(data_path='scale',frame=frame)
            for bone in rig.pose.bones:
                bone.keyframe_insert(data_path='location',frame=frame)
                bone.keyframe_insert(data_path='rotation_quaternion',frame=frame)
                bone.keyframe_insert(data_path='scale',frame=frame)
        rig.animation_data.action=None
        track=rig.animation_data.nla_tracks.new();track.name='crew_'+clip
        track.strips.new('crew_'+clip,1,action);track.mute=True;tracks.append(track)
        for obj in imported:bpy.data.objects.remove(obj,do_unlink=True)
    # A deterministic default pose also makes non-animation-aware viewers useful.
    for t in tracks:t.mute=True
    rig.animation_data.action=bpy.data.actions.get('crew_idle')
    bpy.context.scene.render.fps=30;bpy.context.scene.frame_set(30);bpy.context.view_layer.update()
    mesh['source']='Microsoft Rocketbox, MIT license, commit 0943055db6ec570bcef9f2c8b41c9e5467c808f9'
    bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);mesh.select_set(True);bpy.context.view_layer.objects.active=rig
    # Export one material-rich GLB, including two genuine skeletal clips.
    rig.animation_data.action=None
    for t in tracks:t.mute=False
    bpy.context.scene.frame_start=1;bpy.context.scene.frame_end=350
    bpy.ops.export_scene.gltf(filepath=str(OUT/(label+'.glb')),use_selection=True,export_format='GLB',export_yup=True,
      export_animations=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True,export_frame_step=2,
      export_nla_strips=True,export_optimize_animation_size=True,export_optimize_animation_keep_anim_armature=True)
    for t in tracks:t.mute=True
    rig.animation_data.action=bpy.data.actions.get('crew_idle');bpy.context.scene.frame_set(30)
    # Keep a self-contained editable source with packed optimized textures.
    for image in list(bpy.data.images):
        if image.users==0 or (image.source=='FILE' and not Path(bpy.path.abspath(image.filepath)).exists()):bpy.data.images.remove(image)
    bpy.ops.file.pack_all()
    blend=SOURCE/(label+'.blend');bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    with open(blend,'rb') as src,gzip.open(str(blend)+'.gz','wb',compresslevel=9) as dst:shutil.copyfileobj(src,dst)
    REPORT[label]={'triangles':sum(len(p.vertices)-2 for p in mesh.data.polygons),'bones':len(rig.data.bones),'materials':len(mesh.data.materials),'glbBytes':(OUT/(label+'.glb')).stat().st_size}
(OUT/'build-report.json').write_text(json.dumps(REPORT,indent=2))
print('REALISTIC_CREW',REPORT)
