"""
Put a rigged character (a Mixamo-named rig with its own rest pose / extra twist bones, or a 3ds Max
Biped rig) on the hero's Mixamo skeleton, so every hero clip plays on it unchanged (run headless;
scripts/build-models.mjs calls this).

  blender -b --factory-startup --python scripts/blender/fit_to_hero_rig.py -- REF.fbx IN.fbx TEXDIR OUT.glb [--drop REGEX]

--drop: meshes whose name matches are removed (eyelashes, teeth, corneas: unseen at game distance).

1. Pose the Rocketbox body into the Mixamo T-pose: each mapped bone is turned (no twist) so the
   line to its child joint points the way the Mixamo bone's does.
2. Bake that pose into the mesh and scale it so the hips are at the Mixamo hips' height (the
   clips carry the Mixamo hips height).
3. Copy the Mixamo armature and move its joints onto the Rocketbox joints, keeping every Mixamo
   bone's orientation and roll: the clips' local rotations then mean the same thing.
4. Rename the vertex groups to Mixamo names; face / nub bones fold into their nearest mapped
   ancestor. Textures are relinked from TEXDIR (colour maps only).
"""
import os
import re
import sys

import bpy
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1 :]
ref_path, src_path, tex_dir, dst = argv[:4]
drop = re.compile(argv[argv.index("--drop") + 1], re.I) if "--drop" in argv else None

bpy.ops.wm.read_factory_settings(use_empty=True)

# --- Reference: the hero's Mixamo skeleton (rest pose only).
bpy.ops.import_scene.fbx(filepath=ref_path, automatic_bone_orientation=False)
ref = next(o for o in bpy.data.objects if o.type == "ARMATURE")
for o in [o for o in bpy.data.objects if o is not ref]:
    bpy.data.objects.remove(o)
for b in ref.data.bones:
    b.name = re.sub(r"^mixamorig\d*:", "", b.name)
if ref.animation_data:
    ref.animation_data.action = None
ref.name = "MixamoRef"

# --- The Rocketbox avatar.
before = set(bpy.data.objects)
bpy.ops.import_scene.fbx(filepath=src_path, automatic_bone_orientation=False)
new = [o for o in bpy.data.objects if o not in before]
rb = next(o for o in new if o.type == "ARMATURE")
for o in [o for o in new if o.type == "MESH" and drop and drop.search(o.name)]:
    new.remove(o)
    bpy.data.objects.remove(o)
meshes = [o for o in new if o.type == "MESH"]
if rb.animation_data:
    rb.animation_data.action = None
bpy.context.view_layer.update()

MAP = {"Pelvis": "Hips", "Spine": "Spine", "Spine1": "Spine1", "Spine2": "Spine2", "Neck": "Neck", "Head": "Head"}
for s, side in (("L", "Left"), ("R", "Right")):
    MAP.update({
        f"{s} Clavicle": f"{side}Shoulder", f"{s} UpperArm": f"{side}Arm", f"{s} Forearm": f"{side}ForeArm", f"{s} Hand": f"{side}Hand",
        f"{s} Thigh": f"{side}UpLeg", f"{s} Calf": f"{side}Leg", f"{s} Foot": f"{side}Foot", f"{s} Toe0": f"{side}ToeBase",
    })
    for i, f in enumerate(["Thumb", "Index", "Middle", "Ring", "Pinky"]):
        for k, suffix in enumerate(["", "1", "2"]):
            MAP[f"{s} Finger{i}{suffix}"] = f"{side}Hand{f}{k + 1}"
MAP = {f"Bip01 {k}": v for k, v in MAP.items() if v in ref.data.bones}
for b in rb.data.bones:  # a Mixamo-named rig: same names map straight across
    n = re.sub(r"^mixamorigd*:", "", b.name)
    if n in ref.data.bones and b.name not in MAP:
        MAP[b.name] = n
MAP = {k: v for k, v in MAP.items() if k in rb.data.bones}
INV = {v: k for k, v in MAP.items()}

# Which joint each bone points at (Mixamo names): the T-pose is matched on these lines.
AIM = {"Spine": "Spine1", "Spine1": "Spine2", "Spine2": "Neck", "Neck": "Head"}
for side in ("Left", "Right"):
    AIM.update({f"{side}Shoulder": f"{side}Arm", f"{side}Arm": f"{side}ForeArm", f"{side}ForeArm": f"{side}Hand", f"{side}Hand": f"{side}HandMiddle1",
                f"{side}UpLeg": f"{side}Leg", f"{side}Leg": f"{side}Foot", f"{side}Foot": f"{side}ToeBase"})
    for f in ["Thumb", "Index", "Middle", "Ring", "Pinky"]:
        AIM.update({f"{side}Hand{f}1": f"{side}Hand{f}2", f"{side}Hand{f}2": f"{side}Hand{f}3"})
AIM = {k: v for k, v in AIM.items() if k in INV and v in INV}

def ref_head(name):
    return ref.matrix_world @ ref.data.bones[name].head_local

def rb_head(name):  # posed, world
    return rb.matrix_world @ rb.pose.bones[name].head

# 1. Pose into the T-pose, parents first.
def depth(b):
    return 0 if b.parent is None else 1 + depth(b.parent)

for b in sorted(rb.data.bones, key=depth):
    m = MAP.get(b.name)
    if m not in AIM:
        continue
    target = (ref_head(AIM[m]) - ref_head(m)).normalized()
    h = rb_head(b.name)
    cur = (rb_head(INV[AIM[m]]) - h).normalized()
    q = cur.rotation_difference(target)
    pb = rb.pose.bones[b.name]
    world = rb.matrix_world @ pb.matrix
    world = Matrix.Translation(h) @ q.to_matrix().to_4x4() @ Matrix.Translation(-h) @ world
    pb.matrix = rb.matrix_world.inverted() @ world
    bpy.context.view_layer.update()

# 2. Bake the pose into the meshes, unparent, scale to the Mixamo hips height.
joints = {m: rb_head(k).copy() for k, m in MAP.items()}
scale = ref_head("Hips").z / joints["Hips"].z
for o in meshes:
    bpy.context.view_layer.objects.active = o
    if o.data.shape_keys:  # facial blend shapes: not animated in the game, and they block the bake
        o.shape_key_clear()
    for mod in [md for md in o.modifiers if md.type == "ARMATURE"]:
        bpy.ops.object.modifier_apply(modifier=mod.name)
    mw = o.matrix_world.copy()
    o.parent = None
    o.matrix_world = Matrix.Scale(scale, 4) @ mw
for m in joints:
    joints[m] = joints[m] * scale

# 3. A copy of the Mixamo armature, joints moved onto the avatar's.
arm = ref.copy()
arm.data = ref.data.copy()
arm.name = "Armature"
bpy.context.scene.collection.objects.link(arm)
bpy.context.view_layer.update()
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="EDIT")
inv = arm.matrix_world.inverted()
ebs = arm.data.edit_bones
old = {e.name: (e.head.copy(), e.tail.copy(), e.roll) for e in ebs}
for e in ebs:
    e.use_connect = False
moved = {}

def shift(e):
    """How far this bone's head moves: its own joint if mapped, else its parent's shift."""
    if e.name in moved:
        return moved[e.name]
    if e.name in joints:
        d = (inv @ joints[e.name]) - old[e.name][0]
    elif e.parent:
        d = shift(e.parent)
    else:
        d = Vector()
    moved[e.name] = d
    return d

for e in ebs:
    shift(e)
for e in ebs:
    h, t, r = old[e.name]
    e.head = h + moved[e.name]
    e.tail = t + moved[e.name]
    e.roll = r
bpy.ops.object.mode_set(mode="OBJECT")

# 4. Vertex groups -> Mixamo names; unmapped (face, nubs) fold into the nearest mapped ancestor.
def mapped_ancestor(name):
    b = rb.data.bones.get(name)
    while b and b.name not in MAP:
        b = b.parent
    return MAP[b.name] if b else "Hips"

for o in meshes:
    groups = {g.index: g.name for g in o.vertex_groups}
    weights = {}
    for v in o.data.vertices:
        acc = {}
        for g in v.groups:
            n = groups[g.group]
            t = MAP.get(n) or mapped_ancestor(n)
            acc[t] = acc.get(t, 0) + g.weight
        weights[v.index] = acc
    o.vertex_groups.clear()
    vg = {}
    for i, acc in weights.items():
        for t, w in acc.items():
            if t not in vg:
                vg[t] = o.vertex_groups.new(name=t)
            vg[t].add([i], w, "REPLACE")
    o.modifiers.clear()
    mod = o.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    mw = o.matrix_world.copy()
    o.parent = arm
    o.matrix_world = mw

# Clean up: the reference and the Biped rig (and its footsteps helper).
for o in [ref, rb] + [o for o in new if o.type == "EMPTY"]:
    bpy.data.objects.remove(o)
for a in list(bpy.data.actions):
    bpy.data.actions.remove(a)

# Textures: colour maps from TEXDIR; normal / specular maps are dropped (not shipped).
for mat in bpy.data.materials:
    if not mat.use_nodes:
        continue
    nt = mat.node_tree
    for n in list(nt.nodes):
        if n.type != "TEX_IMAGE" or not n.image:
            continue
        base = os.path.basename(n.image.filepath.replace("\\", "/"))
        if "_color" not in base.lower():
            nt.nodes.remove(n)
            continue
        stem = os.path.splitext(base)[0]
        found = [f for f in os.listdir(tex_dir) if os.path.splitext(f)[0] == stem]
        if found:
            n.image.filepath = os.path.join(tex_dir, found[0])
            n.image.reload()

bpy.ops.export_scene.gltf(
    filepath=dst,
    export_format="GLB",
    export_yup=True,
    export_skins=True,
    export_morph=False,
    export_animations=False,
)
print(f"[fit_to_hero_rig] wrote {dst} (scale {scale:.3f}, {len(MAP)} bones mapped)")
