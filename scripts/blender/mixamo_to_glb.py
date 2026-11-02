"""
Convert one Mixamo FBX to GLB with Blender (run headless; scripts/build-models.mjs calls this).

  blender -b --factory-startup --python scripts/blender/mixamo_to_glb.py -- IN.fbx OUT.glb [--anim NAME] [--in-place]

Without --anim: export the skinned character, no animation (drops the embedded T-pose action).
With --anim:    export only the skeleton + one animation clip named NAME.
--in-place:     remove horizontal root motion (Hips X/Z travel) so the clip plays on the spot.

Bone names lose their "mixamorig:" / "mixamorig1:" prefix, so clips from any Mixamo
download bind to any Mixamo character.
"""
import re
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1 :]
src, dst = argv[0], argv[1]
anim = argv[argv.index("--anim") + 1] if "--anim" in argv else None
in_place = "--in-place" in argv

bpy.ops.wm.read_factory_settings(use_empty=True)
# Keep bone orientations exactly as authored: character and clips must be imported identically.
bpy.ops.import_scene.fbx(filepath=src, automatic_bone_orientation=False)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")

# Renaming via RNA also renames vertex groups and animation data paths.
for bone in arm.data.bones:
    bone.name = re.sub(r"^mixamorig\d*:", "", bone.name)


def fcurves(action):
    """All F-curves of an action (Blender 4.4+ stores them in layered channelbags)."""
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                yield from bag.fcurves


if anim:
    for obj in [o for o in bpy.data.objects if o.type != "ARMATURE"]:
        bpy.data.objects.remove(obj)
    action = arm.animation_data.action
    action.name = anim
    if in_place:
        # Hips bone: local Y is up (along the bone), X/Z are horizontal. Pin X/Z to frame 1.
        for fc in fcurves(action):
            if fc.data_path == 'pose.bones["Hips"].location' and fc.array_index in (0, 2):
                first = fc.keyframe_points[0].co[1]
                for kp in fc.keyframe_points:
                    kp.co[1] = kp.handle_left[1] = kp.handle_right[1] = first
else:
    # Eyelash cards are invisible at game distance but cost a blended draw call.
    for obj in [o for o in bpy.data.objects if o.type == "MESH" and "eyelash" in o.name.lower()]:
        bpy.data.objects.remove(obj)
    if arm.animation_data:
        arm.animation_data.action = None
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)

bpy.ops.export_scene.gltf(
    filepath=dst,
    export_format="GLB",
    export_yup=True,
    export_skins=True,
    export_morph=False,
    export_animations=bool(anim),
    export_animation_mode="ACTIONS",
    export_optimize_animation_size=True,
)
print(f"[mixamo_to_glb] wrote {dst}")
