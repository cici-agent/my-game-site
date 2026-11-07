"""Build an original high-detail British steam train for the magic station.

The model takes inspiration from preserved British express locomotives and the
story's crimson school train, but does not use scanned film assets.
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = ROOT / "art" / "blender" / "magic_train.blend"
RENDER_PATH = ROOT / "art" / "renders" / "magic_train_preview.png"
GLB_PATH = ROOT / "assets" / "3d" / "magic" / "train" / "hogwarts_express.glb"

for output_dir in (BLEND_PATH.parent, RENDER_PATH.parent, GLB_PATH.parent):
    output_dir.mkdir(parents=True, exist_ok=True)


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.materials, bpy.data.curves, bpy.data.meshes, bpy.data.cameras, bpy.data.lights):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


reset_scene()
bpy.context.preferences.filepaths.save_version = 0
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"
scene.unit_settings.scale_length = 1.0
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1600
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.view_settings.exposure = 0.8
try:
    scene.view_settings.look = "AgX - Medium High Contrast"
except TypeError:
    pass

world = bpy.data.worlds.new("Train Preview World") if not scene.world else scene.world
scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.012, 0.018, 0.03, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.32


def set_input(node, names, value):
    for name in names:
        socket = node.inputs.get(name)
        if socket is not None:
            socket.default_value = value
            return


def material(name, color, *, metallic=0.0, roughness=0.55, emission=None, alpha=1.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    set_input(bsdf, ("Base Color",), (*color, 1.0))
    set_input(bsdf, ("Metallic",), metallic)
    set_input(bsdf, ("Roughness",), roughness)
    set_input(bsdf, ("Alpha",), alpha)
    if emission:
        set_input(bsdf, ("Emission Color", "Emission"), (*emission[0], 1.0))
        set_input(bsdf, ("Emission Strength",), emission[1])
    mat.diffuse_color = (*color, alpha)
    if alpha < 1.0:
        try:
            mat.surface_render_method = "DITHERED"
        except AttributeError:
            pass
        mat.use_transparency_overlap = False
    return mat


MAT_CRIMSON = material("MAT_Express_Crimson", (0.36, 0.012, 0.022), metallic=0.18, roughness=0.25)
MAT_RED_DARK = material("MAT_Express_Shadow_Red", (0.12, 0.008, 0.012), metallic=0.24, roughness=0.3)
MAT_BLACK = material("MAT_Smokebox_Black", (0.008, 0.011, 0.012), metallic=0.7, roughness=0.2)
MAT_IRON = material("MAT_Undercarriage_Iron", (0.025, 0.032, 0.035), metallic=0.82, roughness=0.28)
MAT_STEEL = material("MAT_Polished_Steel", (0.25, 0.27, 0.28), metallic=0.95, roughness=0.16)
MAT_BRASS = material("MAT_Aged_Brass", (0.52, 0.31, 0.055), metallic=0.88, roughness=0.22)
MAT_GOLD = material("MAT_Carriage_Gold_Line", (0.77, 0.48, 0.08), metallic=0.7, roughness=0.25)
MAT_GLASS = material("MAT_Window_Glass", (0.035, 0.12, 0.16), metallic=0.08, roughness=0.08, alpha=0.48)
MAT_WARM_GLASS = material(
    "MAT_Warm_Interior",
    (0.7, 0.29, 0.07),
    roughness=0.25,
    emission=((1.0, 0.28, 0.045), 1.7),
)
MAT_HEADLAMP = material(
    "MAT_Headlamp_Glow",
    (0.95, 0.75, 0.31),
    roughness=0.18,
    emission=((1.0, 0.45, 0.08), 5.0),
)
MAT_WOOD = material("MAT_Carriage_Wood", (0.16, 0.045, 0.02), roughness=0.5)
MAT_COAL = material("MAT_Coal", (0.008, 0.01, 0.012), metallic=0.15, roughness=0.78)
MAT_WHITE = material("MAT_Headboard_Letters", (0.9, 0.73, 0.39), roughness=0.3)
MAT_PREVIEW_STONE = material("PREVIEW_Platform", (0.25, 0.27, 0.3), roughness=0.9)
MAT_PREVIEW_WOOD = material("PREVIEW_Sleepers", (0.12, 0.055, 0.028), roughness=0.85)


def apply_bevel(obj, width=0.04, segments=2):
    if width <= 0:
        return obj
    bpy.context.view_layer.objects.active = obj
    modifier = obj.modifiers.new("Edge Softening", "BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj


def smooth(obj):
    if obj.type == "MESH":
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    return obj


def box(name, location, dimensions, mat, *, bevel=0.04, rotation=(0, 0, 0), parent=None):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    apply_bevel(obj, bevel, 2)
    obj.data.materials.append(mat)
    if parent:
        obj.parent = parent
        obj.matrix_parent_inverse = parent.matrix_world.inverted()
    return obj


def cylinder(
    name,
    location,
    radius,
    depth,
    mat,
    *,
    vertices=32,
    rotation=(0, 0, 0),
    scale=(1, 1, 1),
    bevel=0.025,
    parent=None,
    apply_rotation=False,
):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=apply_rotation, scale=True)
    apply_bevel(obj, bevel, 2)
    obj.data.materials.append(mat)
    smooth(obj)
    if parent:
        obj.parent = parent
        obj.matrix_parent_inverse = parent.matrix_world.inverted()
    return obj


def cone(name, location, radius1, radius2, depth, mat, *, vertices=32, bevel=0.02):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius1, radius2=radius2, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    apply_bevel(obj, bevel, 2)
    obj.data.materials.append(mat)
    smooth(obj)
    return obj


def sphere(name, location, radius, mat, *, scale=(1, 1, 1), segments=24, rings=12, parent=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=radius, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    smooth(obj)
    if parent:
        obj.parent = parent
        obj.matrix_parent_inverse = parent.matrix_world.inverted()
    return obj


def torus(name, location, major_radius, minor_radius, mat, *, rotation=(0, 0, 0), parent=None):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=40,
        minor_segments=10,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.data.materials.append(mat)
    smooth(obj)
    if parent:
        obj.parent = parent
        obj.matrix_parent_inverse = parent.matrix_world.inverted()
    return obj


def tube(name, points, radius, mat, *, parent=None):
    curve = bpy.data.curves.new(name + "_Curve", "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    curve.resolution_u = 2
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, co in zip(spline.points, points):
        point.co = (*co, 1.0)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    curve.materials.append(mat)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.object
    obj.name = name
    if parent:
        obj.parent = parent
        obj.matrix_parent_inverse = parent.matrix_world.inverted()
    return obj


def text_mesh(name, body, location, size, depth, mat, *, rotation=(math.radians(90), 0, 0)):
    curve = bpy.data.curves.new(name + "_Font", "FONT")
    curve.body = body
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.size = size
    curve.extrude = depth
    curve.bevel_depth = min(0.012, depth * 0.3)
    curve.bevel_resolution = 2
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = rotation
    curve.materials.append(mat)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    return bpy.context.object


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


RAIL_CENTER_OFFSET = (1.435 + 0.15) / 2
TREAD_DATUM = 0.12


def group_new_parts(name, center_y, previous_objects):
    """Group unparented components around a railway pivot without moving the stock."""
    parts = [obj for obj in scene.objects if obj not in previous_objects and obj.parent is None]
    root = bpy.data.objects.new(name, None)
    root.location.y = center_y
    bpy.context.collection.objects.link(root)
    bpy.context.view_layer.update()
    inverse = root.matrix_world.inverted()
    for part in parts:
        part.parent = root
        part.matrix_parent_inverse = inverse


def wheel_set(prefix, y, radius):
    z = radius + TREAD_DATUM
    roots = []
    cylinder(f"AXL_{prefix}", (0, y, z), 0.09, RAIL_CENTER_OFFSET * 2, MAT_IRON,
             vertices=12, rotation=(0, math.pi / 2, 0), apply_rotation=True, bevel=0.008)
    for side, wheel_x in (("L", -RAIL_CENTER_OFFSET), ("R", RAIL_CENTER_OFFSET)):
        root = bpy.data.objects.new(f"WHL_Rotor_{prefix}_{side}", None)
        root.empty_display_type = "PLAIN_AXES"
        root.location = (wheel_x, y, z)
        bpy.context.collection.objects.link(root)
        cylinder(
            f"WHL_{prefix}_{side}_Tyre",
            (wheel_x, y, z),
            radius,
            0.24,
            MAT_IRON,
            vertices=36,
            rotation=(0, math.radians(90), 0),
            apply_rotation=True,
            bevel=0.035,
            parent=root,
        )
        torus(
            f"WHL_{prefix}_{side}_Rim",
            (wheel_x + (-0.13 if side == "L" else 0.13), y, z),
            radius * 0.78,
            0.065,
            MAT_STEEL,
            rotation=(0, math.radians(90), 0),
            parent=root,
        )
        cylinder(
            f"WHL_{prefix}_{side}_Hub",
            (wheel_x + (-0.15 if side == "L" else 0.15), y, z),
            radius * 0.22,
            0.32,
            MAT_BRASS,
            vertices=24,
            rotation=(0, math.radians(90), 0),
            apply_rotation=True,
            bevel=0.02,
            parent=root,
        )
        roots.append(root)
    return roots


def build_locomotive():
    box("ENG_Chassis", (0, -0.2, 0.92), (1.27, 10.1, 0.34), MAT_IRON, bevel=0.06)
    for y in (-3.6, 0, 2.6):
        box("ENG_Frame_Stretcher", (0, y, 1.45), (1.27, 0.48, 0.86), MAT_IRON, bevel=0.035)
    box("ENG_Running_Board", (0, -0.35, 1.91), (3.5, 10.4, 0.16), MAT_RED_DARK, bevel=0.035)
    box("ENG_Buffer_Beam", (0, -5.48, 1.0), (3.35, 0.22, 0.48), MAT_CRIMSON, bevel=0.035)

    # Boiler, smokebox and firebox.
    cylinder(
        "ENG_Boiler",
        (0, -1.15, 2.48),
        1.18,
        6.4,
        MAT_CRIMSON,
        vertices=48,
        rotation=(math.radians(90), 0, 0),
        apply_rotation=True,
        bevel=0.035,
    )
    cylinder(
        "ENG_Smokebox",
        (0, -4.25, 2.48),
        1.22,
        1.45,
        MAT_BLACK,
        vertices=48,
        rotation=(math.radians(90), 0, 0),
        apply_rotation=True,
        bevel=0.035,
    )
    cylinder(
        "ENG_Smokebox_Door",
        (0, -5.01, 2.48),
        1.02,
        0.18,
        MAT_BLACK,
        vertices=48,
        rotation=(math.radians(90), 0, 0),
        apply_rotation=True,
        bevel=0.04,
    )
    torus("ENG_Door_Rim", (0, -5.12, 2.48), 0.86, 0.055, MAT_BRASS, rotation=(math.radians(90), 0, 0))
    cylinder("ENG_Door_Dart", (0, -5.22, 2.48), 0.11, 0.12, MAT_BRASS, vertices=18, rotation=(math.radians(90), 0, 0), apply_rotation=True)

    # Chimney, dome and safety valves.
    cone("ENG_Chimney", (0, -3.5, 4.12), 0.54, 0.34, 1.65, MAT_BLACK, vertices=40, bevel=0.03)
    cylinder("ENG_Chimney_Lip", (0, -3.5, 4.99), 0.59, 0.16, MAT_BLACK, vertices=40, bevel=0.035)
    sphere("ENG_Steam_Dome", (0, -0.9, 3.72), 0.58, MAT_BRASS, scale=(1, 1, 0.9), segments=32, rings=16)
    cylinder("ENG_Dome_Base", (0, -0.9, 3.42), 0.68, 0.18, MAT_BRASS, vertices=36)
    for x in (-0.22, 0.22):
        cylinder(f"ENG_Safety_Valve_{x:+.2f}", (x, 0.55, 3.75), 0.11, 0.48, MAT_BRASS, vertices=20)
        sphere(f"ENG_Safety_Valve_Cap_{x:+.2f}", (x, 0.55, 4.0), 0.14, MAT_BRASS, segments=16, rings=8)

    # Cab with inset windows and rolled roof.
    box("ENG_Cab", (0, 2.55, 3.16), (3.2, 2.45, 2.49), MAT_CRIMSON, bevel=0.11)
    box("ENG_Cab_Roof", (0, 2.55, 4.52), (3.65, 2.85, 0.24), MAT_BLACK, bevel=0.12)
    for side, x in (("L", -1.63), ("R", 1.63)):
        for y in (2.08, 2.9):
            box(f"ENG_Cab_Window_Frame_{side}_{y:.1f}", (x, y, 3.15), (0.08, 0.68, 1.18), MAT_GOLD, bevel=0.05)
            box(f"ENG_Cab_Window_{side}_{y:.1f}", (x + (-0.015 if x < 0 else 0.015), y, 3.15), (0.07, 0.55, 1.02), MAT_GLASS, bevel=0.035)
    box("ENG_Cab_Back", (0, 3.82, 3.16), (3.22, 0.14, 2.49), MAT_RED_DARK, bevel=0.05)

    # Driving wheels and motion gear.
    for index, y in enumerate((-2.15, 0.0, 2.05), start=1):
        wheel_set(f"Driver_{index}", y, 0.84)
    wheel_set("Leading", -4.25, 0.52)
    rod_offset = RAIL_CENTER_OFFSET + 0.22
    for side, x in (("L", -rod_offset), ("R", rod_offset)):
        box(f"ROD_Coupling_{side}", (x, -0.05, 1.0), (0.12, 5.4, 0.16), MAT_BRASS, bevel=0.045)
        tube(f"ROD_Piston_{side}", [(x, -4.35, 1.35), (x, -1.95, 0.98)], 0.065, MAT_STEEL)
        box(f"ENG_Cylinder_Block_{side}", (x, -3.55, 1.55), (0.52, 1.2, 0.85), MAT_CRIMSON, bevel=0.1)

    # Boiler bands, handrails and pipework.
    for y in (-3.25, -1.85, -0.4, 1.0):
        torus(f"ENG_Boiler_Band_{y:+.2f}", (0, y, 2.48), 1.19, 0.035, MAT_BRASS, rotation=(math.radians(90), 0, 0))
    for side, x in (("L", -1.19), ("R", 1.19)):
        tube(f"ENG_Handrail_{side}", [(x, -4.45, 2.92), (x, 1.05, 2.92)], 0.025, MAT_BRASS)
        tube(f"ENG_Steam_Pipe_{side}", [(x, -3.8, 1.45), (x, 1.15, 1.45)], 0.045, MAT_STEEL)

    # Front buffers, lamp and story headboard.
    for x in (-1.14, 1.14):
        cylinder(f"ENG_Buffer_{x:+.1f}", (x, -5.7, 1.03), 0.25, 0.42, MAT_BLACK, vertices=28, rotation=(math.radians(90), 0, 0), apply_rotation=True)
        cylinder(f"ENG_Buffer_Face_{x:+.1f}", (x, -5.94, 1.03), 0.34, 0.08, MAT_STEEL, vertices=28, rotation=(math.radians(90), 0, 0), apply_rotation=True)
    cylinder("ENG_Headlamp_Case", (0, -5.08, 3.4), 0.39, 0.34, MAT_BLACK, vertices=28, rotation=(math.radians(90), 0, 0), apply_rotation=True)
    sphere("ENG_Headlamp_Glow", (0, -5.28, 3.4), 0.25, MAT_HEADLAMP, scale=(1, 0.4, 1), segments=20, rings=10)
    cylinder("ENG_Headboard", (0, -5.22, 2.48), 0.7, 0.09, MAT_CRIMSON, vertices=40, rotation=(math.radians(90), 0, 0), apply_rotation=True, bevel=0.04)
    torus("ENG_Headboard_Rim", (0, -5.29, 2.48), 0.58, 0.035, MAT_GOLD, rotation=(math.radians(90), 0, 0))
    text_mesh("ENG_Headboard_Text", "HOGWARTS", (0, -5.36, 2.48), 0.19, 0.025, MAT_WHITE)


def build_tender():
    box("TND_Chassis", (0, 6.65, 1.0), (1.27, 4.9, 0.59), MAT_IRON, bevel=0.055)
    box("TND_Body", (0, 6.65, 2.20), (3.2, 4.45, 1.85), MAT_CRIMSON, bevel=0.12)
    box("TND_Top_Rim", (0, 6.65, 3.1), (3.4, 4.6, 0.18), MAT_GOLD, bevel=0.05)
    box("TND_Coal_Bed", (0, 6.3, 3.18), (2.85, 3.5, 0.2), MAT_COAL, bevel=0.04)
    for index, (x, y, z, scale) in enumerate((
        (-0.9, 5.5, 3.38, 0.55), (-0.2, 5.8, 3.45, 0.62), (0.7, 5.55, 3.38, 0.58),
        (-0.6, 6.5, 3.4, 0.66), (0.25, 6.4, 3.48, 0.52), (0.95, 6.7, 3.35, 0.5),
        (-0.95, 7.25, 3.35, 0.48), (-0.15, 7.2, 3.45, 0.6), (0.65, 7.5, 3.38, 0.56),
    )):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=scale, location=(x, y, z))
        coal = bpy.context.object
        coal.name = f"TND_Coal_{index:02d}"
        coal.scale = (1.2, 0.9, 0.6)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        coal.data.materials.append(MAT_COAL)
    for y in (5.25, 7.95):
        wheel_set(f"Tender_{y:.1f}", y, 0.56)
    for side, x in (("L", -1.63), ("R", 1.63)):
        box(f"TND_Gold_Line_{side}", (x, 6.65, 2.12), (0.05, 4.0, 0.07), MAT_GOLD, bevel=0.02)
        box(f"TND_Nameplate_{side}", (x, 6.4, 2.25), (0.06, 2.35, 0.52), MAT_RED_DARK, bevel=0.07)
    box("TND_Coupler", (0, 9.25, 0.92), (0.18, 0.75, 0.18), MAT_STEEL, bevel=0.04)


def carriage_roof(name, center_y, length):
    # A shallow elliptical vault, extruded along the coach rather than across it.
    profile = [(1.68 * math.cos(i * math.pi / 24), 4.055 + 0.49 * math.sin(i * math.pi / 24))
               for i in range(24, -1, -1)]
    count = len(profile)
    vertices = [(x, y, z) for y in (center_y - length / 2, center_y + length / 2) for x, z in profile]
    faces = [(i, (i + 1) % count, count + (i + 1) % count, count + i) for i in range(count)]
    faces.extend((tuple(reversed(range(count))), tuple(range(count, 2 * count))))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    for face in list(mesh.polygons)[:count - 1]:
        face.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(MAT_BLACK)


def build_carriage(index, center_y):
    prefix = f"CAR_{index:02d}"
    length = 10.2
    box(prefix + "_Chassis", (0, center_y, 0.91), (1.27, length + 0.15, 0.48), MAT_IRON, bevel=0.055)
    box(prefix + "_Body", (0, center_y, 2.625), (3.12, length, 2.97), MAT_CRIMSON, bevel=0.12)
    carriage_roof(prefix + "_Roof", center_y, length + 0.25)
    box(prefix + "_Lower_Gold_Line", (0, center_y, 1.2), (3.22, length - 0.2, 0.075), MAT_GOLD, bevel=0.02)
    box(prefix + "_Upper_Gold_Line", (0, center_y, 3.95), (3.22, length - 0.2, 0.065), MAT_GOLD, bevel=0.02)

    window_positions = [center_y - 3.85, center_y - 2.3, center_y - 0.75, center_y + 0.8, center_y + 2.35, center_y + 3.9]
    for side, x in (("L", -1.59), ("R", 1.59)):
        for window_index, y in enumerate(window_positions):
            box(f"{prefix}_Window_Frame_{side}_{window_index}", (x, y, 2.95), (0.07, 1.14, 1.2), MAT_GOLD, bevel=0.045)
            box(
                f"{prefix}_Window_Glow_{side}_{window_index}",
                (x + (-0.015 if x < 0 else 0.015), y, 2.95),
                (0.065, 0.98, 1.03),
                MAT_WARM_GLASS,
                bevel=0.025,
            )
            box(
                f"{prefix}_Window_Glass_{side}_{window_index}",
                (x + (-0.03 if x < 0 else 0.03), y, 2.95),
                (0.045, 0.92, 0.96),
                MAT_GLASS,
                bevel=0.02,
            )
        for door_side, y in (("Front", center_y - 4.7), ("Rear", center_y + 4.7)):
            box(f"{prefix}_Door_{side}_{door_side}", (x, y, 2.55), (0.08, 0.54, 2.9), MAT_RED_DARK, bevel=0.045)
            cylinder(f"{prefix}_Handle_{side}_{door_side}", (x + (-0.09 if x < 0 else 0.09), y, 2.55), 0.055, 0.16, MAT_BRASS, vertices=16, rotation=(0, math.radians(90), 0), apply_rotation=True, bevel=0.01)

    for bogie_index, y in enumerate((center_y - 3.25, center_y + 3.25), start=1):
        previous_objects = set(scene.objects)
        box(f"{prefix}_Bogie_{bogie_index}", (0, y, 0.72), (1.27, 1.75, 0.35), MAT_IRON, bevel=0.07)
        wheel_set(f"Car_{index}_{bogie_index}A", y - 0.5, 0.49)
        wheel_set(f"Car_{index}_{bogie_index}B", y + 0.5, 0.49)
        group_new_parts(f"BOG_Coach_{index}_{bogie_index}", y, previous_objects)

    for end, y in (("Front", center_y - length / 2 - 0.25), ("Rear", center_y + length / 2 + 0.25)):
        box(f"{prefix}_End_Bellows_{end}", (0, y, 2.45), (2.25, 0.35, 2.5), MAT_BLACK, bevel=0.08)
        box(f"{prefix}_Coupler_{end}", (0, y + (-0.35 if end == "Front" else 0.35), 0.92), (0.16, 0.62, 0.16), MAT_STEEL, bevel=0.035)


def build_train():
    previous_objects = set(scene.objects)
    build_locomotive()
    group_new_parts("VEH_Engine", 0, previous_objects)
    previous_objects = set(scene.objects)
    build_tender()
    group_new_parts("VEH_Tender", 6.65, previous_objects)
    for index, center_y in enumerate((14.7, 25.7, 36.7), start=1):
        previous_objects = set(scene.objects)
        build_carriage(index, center_y)
        group_new_parts(f"VEH_Coach_{index}", center_y, previous_objects)


def build_preview_track():
    box("PREVIEW_Ground", (0, 16, -0.63), (18, 58, 0.5), MAT_PREVIEW_STONE, bevel=0.06)
    for y in [value * 0.82 - 7 for value in range(69)]:
        box(f"PREVIEW_Sleeper_{y:+05.1f}", (0, y, -0.30), (2.6, 0.22, 0.18), MAT_PREVIEW_WOOD, bevel=0.025)
    for x in (-RAIL_CENTER_OFFSET, RAIL_CENTER_OFFSET):
        box(f"PREVIEW_Rail_Base_{x:+.3f}", (x, 16, -0.175), (0.2, 58, 0.07), MAT_STEEL, bevel=0.015)
        box(f"PREVIEW_Rail_Web_{x:+.3f}", (x, 16, -0.06), (0.07, 58, 0.18), MAT_STEEL, bevel=0.01)
        box(f"PREVIEW_Rail_Head_{x:+.3f}", (x, 16, TREAD_DATUM - 0.05), (0.15, 58, 0.1), MAT_STEEL, bevel=0.02)


def add_preview_lighting():
    bpy.ops.object.light_add(type="AREA", location=(10, -8, 15))
    key = bpy.context.object
    key.name = "PREVIEW_Key"
    key.data.energy = 5200
    key.data.shape = "RECTANGLE"
    key.data.size = 18
    key.data.size_y = 9
    key.data.color = (1.0, 0.42, 0.17)
    look_at(key, (0, 8, 2.3))

    bpy.ops.object.light_add(type="AREA", location=(-12, 20, 10))
    fill = bpy.context.object
    fill.name = "PREVIEW_Fill"
    fill.data.energy = 4200
    fill.data.size = 18
    fill.data.color = (0.18, 0.38, 1.0)
    look_at(fill, (0, 15, 2.0))

    bpy.ops.object.light_add(type="AREA", location=(4, 45, 8))
    rim = bpy.context.object
    rim.name = "PREVIEW_Rim"
    rim.data.energy = 3500
    rim.data.size = 10
    rim.data.color = (1.0, 0.18, 0.05)
    look_at(rim, (0, 30, 2.2))

    bpy.ops.object.camera_add(location=(20.0, -28.0, 9.5))
    camera = bpy.context.object
    camera.name = "PREVIEW_Camera"
    camera.data.lens = 45
    look_at(camera, (0, 14.0, 2.35))
    scene.camera = camera


def belongs_to_wheel(obj):
    current = obj
    while current is not None:
        if current.name.startswith("WHL_Rotor_"):
            return True
        current = current.parent
    return False


def join_runtime_meshes_by_material():
    groups = {}
    for obj in list(scene.objects):
        if obj.type != "MESH" or obj.name.startswith("PREVIEW_") or belongs_to_wheel(obj):
            continue
        key = (obj.parent, tuple(slot.material.name if slot.material else "" for slot in obj.material_slots))
        groups.setdefault(key, []).append(obj)
    for index, objects in enumerate(groups.values()):
        if len(objects) < 2:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
        material_name = objects[0].active_material.name if objects[0].active_material else "Mesh"
        objects[0].name = f"WEB_Train_Batched_{index:02d}_{material_name}"


build_train()
build_preview_track()
add_preview_lighting()

# Preserve an editable model before web batching.
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
join_runtime_meshes_by_material()

bpy.ops.object.select_all(action="DESELECT")
for obj in scene.objects:
    if obj.name.startswith("PREVIEW_"):
        continue
    if obj.type == "MESH" or obj.name.startswith(("WHL_Rotor_", "VEH_", "BOG_")):
        obj.select_set(True)

export_args = dict(
    filepath=str(GLB_PATH),
    export_format="GLB",
    use_selection=True,
    export_yup=True,
    export_materials="EXPORT",
    export_cameras=False,
    export_lights=False,
)
try:
    bpy.ops.export_scene.gltf(**export_args, export_apply=True)
except TypeError:
    bpy.ops.export_scene.gltf(**export_args)

scene.render.filepath = str(RENDER_PATH)
bpy.ops.render.render(write_still=True)

triangles = 0
depsgraph = bpy.context.evaluated_depsgraph_get()
for obj in scene.objects:
    if obj.type == "MESH" and not obj.name.startswith("PREVIEW_"):
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        triangles += len(mesh.loop_triangles)
        evaluated.to_mesh_clear()

print("MAGIC_TRAIN_BUILD_OK")
print(f"BLEND={BLEND_PATH}")
print(f"GLB={GLB_PATH}")
print(f"RENDER={RENDER_PATH}")
print(f"TRIANGLES={triangles}")
