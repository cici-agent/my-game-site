"""Build the editable station source, review render and web GLB.

Run from the repository root:
    blender --background --python tools/blender/build_magic_station.py
"""

from __future__ import annotations

import math
import os
import random
import struct
import zlib
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = ROOT / "art" / "blender" / "magic_station.blend"
RENDER_PATH = ROOT / "art" / "renders" / "magic_station_preview.png"
PLATFORM_RENDER_PATH = ROOT / "art" / "renders" / "magic_station_platform_preview.png"
TEXTURE_DIR = ROOT / "art" / "textures"
GLB_PATH = ROOT / "assets" / "3d" / "magic" / "station" / "platform_9_34.glb"

for output_dir in (BLEND_PATH.parent, RENDER_PATH.parent, TEXTURE_DIR, GLB_PATH.parent):
    output_dir.mkdir(parents=True, exist_ok=True)


def reset_scene() -> None:
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
scene.render.filepath = str(RENDER_PATH)
scene.render.film_transparent = False
scene.render.image_settings.color_mode = "RGBA"
try:
    scene.view_settings.look = "AgX - Medium High Contrast"
except TypeError:
    pass

world = bpy.data.worlds.new("Station Night World") if not scene.world else scene.world
scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.018, 0.026, 0.045, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.5
scene.view_settings.exposure = 1.15


def set_input(node, names, value) -> None:
    for name in names:
        socket = node.inputs.get(name)
        if socket is not None:
            socket.default_value = value
            return


def material(name, color, *, metallic=0.0, roughness=0.6, emission=None, alpha=1.0):
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


def save_image(name: str, pixels: np.ndarray, path: Path, colorspace: str):
    height, width, channels = pixels.shape
    # Write a standards-compliant RGB PNG directly. Blender 5.2's generated-image
    # writer can output black frames in background mode on macOS.
    rgb = np.clip(pixels[..., :3] * 255.0, 0, 255).astype(np.uint8)

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    scanlines = b"".join(b"\x00" + np.ascontiguousarray(row).tobytes() for row in rgb)
    payload = b"\x89PNG\r\n\x1a\n"
    payload += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
    payload += chunk(b"IDAT", zlib.compress(scanlines, 7))
    payload += chunk(b"IEND", b"")
    path.write_bytes(payload)

    image = bpy.data.images.load(str(path), check_existing=False)
    image.name = name
    image.colorspace_settings.name = colorspace
    image.pack()
    return image


def build_brick_textures(size=512):
    rng = np.random.default_rng(934)
    y, x = np.mgrid[0:size, 0:size]
    rows = 10
    brick_h = size / rows
    brick_w = size / 5
    row = np.floor(y / brick_h).astype(int)
    local_y = np.mod(y, brick_h)
    offset = (row % 2) * (brick_w * 0.5)
    local_x = np.mod(x + offset, brick_w)
    mortar = (local_x < 5) | (local_x > brick_w - 5) | (local_y < 5) | (local_y > brick_h - 5)
    edge = np.minimum.reduce((local_x, brick_w - local_x, local_y, brick_h - local_y))
    bevel = np.clip(edge / 14.0, 0.0, 1.0)
    per_brick = rng.normal(0, 0.045, (rows + 1, 7))
    col = np.floor((x + offset) / brick_w).astype(int) % 7
    variation = per_brick[np.clip(row, 0, rows), col]
    grain = rng.normal(0, 0.018, (size, size))
    base = np.zeros((size, size, 3), dtype=np.float32)
    brick_color = np.array([0.48, 0.30, 0.13], dtype=np.float32)
    base[:] = brick_color + variation[..., None] + grain[..., None]
    base *= (0.78 + 0.22 * bevel[..., None])
    base[mortar] = np.array([0.42, 0.36, 0.27]) + grain[mortar, None] * 0.5
    base = np.clip(base, 0, 1)

    height = 0.44 + 0.5 * bevel + grain * 0.5
    height[mortar] = 0.15 + grain[mortar] * 0.2
    gy, gx = np.gradient(height)
    normal = np.dstack((-gx * 4.5, -gy * 4.5, np.ones_like(height)))
    normal /= np.linalg.norm(normal, axis=2, keepdims=True)
    normal = normal * 0.5 + 0.5
    rough = np.clip(0.72 + grain * 1.5 + mortar * 0.08, 0.45, 0.95)

    color_img = save_image("Brick_BaseColor", base, TEXTURE_DIR / "brick_basecolor.png", "sRGB")
    normal_img = save_image("Brick_Normal", normal.astype(np.float32), TEXTURE_DIR / "brick_normal.png", "Non-Color")
    rough_img = save_image("Brick_Roughness", np.repeat(rough[..., None], 3, axis=2).astype(np.float32), TEXTURE_DIR / "brick_roughness.png", "Non-Color")
    return color_img, normal_img, rough_img


def textured_brick_material():
    color_img, normal_img, rough_img = build_brick_textures()
    mat = bpy.data.materials.new("MAT_Brick_Warm_Yellow")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    texcoord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (1.0, 1.0, 1.0)
    links.new(texcoord.outputs["UV"], mapping.inputs["Vector"])
    color_tex = nodes.new("ShaderNodeTexImage")
    color_tex.image = color_img
    color_tex.interpolation = "Linear"
    links.new(mapping.outputs["Vector"], color_tex.inputs["Vector"])
    links.new(color_tex.outputs["Color"], bsdf.inputs["Base Color"])
    rough_tex = nodes.new("ShaderNodeTexImage")
    rough_tex.image = rough_img
    links.new(mapping.outputs["Vector"], rough_tex.inputs["Vector"])
    links.new(rough_tex.outputs["Color"], bsdf.inputs["Roughness"])
    normal_tex = nodes.new("ShaderNodeTexImage")
    normal_tex.image = normal_img
    links.new(mapping.outputs["Vector"], normal_tex.inputs["Vector"])
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.inputs["Strength"].default_value = 0.58
    links.new(normal_tex.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


MAT_BRICK = textured_brick_material()
MAT_STONE = material("MAT_Stone_Warm", (0.39, 0.35, 0.29), roughness=0.82)
MAT_STONE_LIGHT = material("MAT_Stone_Light", (0.61, 0.55, 0.44), roughness=0.78)
MAT_FLOOR = material("MAT_Platform_Stone", (0.43, 0.405, 0.36), roughness=0.88)
MAT_EDGE = material("MAT_Platform_Edge", (0.83, 0.71, 0.37), roughness=0.7)
MAT_IRON = material("MAT_Painted_Iron", (0.035, 0.052, 0.058), metallic=0.72, roughness=0.3)
MAT_IRON_GREEN = material("MAT_Station_Green", (0.035, 0.12, 0.105), metallic=0.48, roughness=0.34)
MAT_BRASS = material("MAT_Aged_Brass", (0.48, 0.31, 0.08), metallic=0.86, roughness=0.28)
MAT_WOOD = material("MAT_Dark_Wood", (0.24, 0.075, 0.035), roughness=0.56)
MAT_LEATHER = material("MAT_Leather", (0.25, 0.08, 0.035), roughness=0.64)
MAT_GLASS = material("MAT_Roof_Glass", (0.16, 0.36, 0.43), metallic=0.0, roughness=0.12, alpha=0.14)
MAT_ENAMEL = material("MAT_Black_Enamel", (0.012, 0.018, 0.018), metallic=0.38, roughness=0.2)
MAT_WHITE = material("MAT_Sign_Letters", (0.9, 0.82, 0.61), roughness=0.36)
MAT_BALLAST = material("MAT_Track_Ballast", (0.19, 0.17, 0.15), roughness=0.97)
MAT_STEEL = material("MAT_Rail_Steel", (0.18, 0.19, 0.18), metallic=0.92, roughness=0.24)
MAT_EMISSIVE = material("MAT_Lamp_Glow", (0.95, 0.63, 0.24), roughness=0.22, emission=((1.0, 0.42, 0.1), 5.0))


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


def scale_brick_uv(obj, dimensions):
    """Keep masonry close to a 50 x 10 cm brick module on every box face."""
    uv_layer = obj.data.uv_layers.active
    if uv_layer is None:
        return
    for polygon in obj.data.polygons:
        normal = polygon.normal
        if abs(normal.y) > 0.5:
            repeat_u, repeat_v = dimensions[0] / 2.5, dimensions[2] / 1.0
        elif abs(normal.x) > 0.5:
            repeat_u, repeat_v = dimensions[1] / 2.5, dimensions[2] / 1.0
        else:
            repeat_u, repeat_v = dimensions[0] / 2.5, dimensions[1] / 1.0
        for loop_index in polygon.loop_indices:
            uv = uv_layer.data[loop_index].uv
            uv.x *= repeat_u
            uv.y *= repeat_v


def box(name, location, dimensions, mat, *, bevel=0.05, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    apply_bevel(obj, bevel, 2)
    obj.data.materials.append(mat)
    if mat == MAT_BRICK:
        scale_brick_uv(obj, dimensions)
    return obj


def cylinder(name, location, radius, depth, mat, *, vertices=24, rotation=(0, 0, 0), bevel=0.03):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    apply_bevel(obj, bevel, 2)
    obj.data.materials.append(mat)
    return obj


def uv_sphere(name, location, radius, mat, *, scale=(1, 1, 1), segments=24, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=radius, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def tube(name, points, radius, mat, *, cyclic=False, resolution=2):
    curve = bpy.data.curves.new(name + "_Curve", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = resolution
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    curve.resolution_u = 2
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, co in zip(spline.points, points):
        point.co = (*co, 1.0)
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    curve.materials.append(mat)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.object
    obj.name = name
    return obj


def text_mesh(name, body, location, size, depth, mat, *, rotation=(math.radians(90), 0, 0), align="CENTER"):
    curve = bpy.data.curves.new(name + "_Font", "FONT")
    curve.body = body
    curve.align_x = align
    curve.align_y = "CENTER"
    curve.size = size
    curve.extrude = depth
    curve.bevel_depth = min(0.018, depth * 0.35)
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


def roof_height(y):
    center_y = 3.0
    half_span = 39.0
    radius = 47.0
    edge_root = math.sqrt(radius * radius - half_span * half_span)
    offset = max(-half_span, min(half_span, y - center_y))
    return 8.8 + math.sqrt(radius * radius - offset * offset) - edge_root


def build_floor_and_walls():
    box("ENV_Concourse_Floor", (0, -18.0, -0.28), (104, 36, 0.56), MAT_FLOOR, bevel=0.08)
    box("ENV_Hidden_Platform", (0, 9.0, 0.08), (104, 18, 0.64), MAT_FLOOR, bevel=0.08)
    box("ENV_Island_Platform", (0, 36.0, 0.08), (104, 11.5, 0.64), MAT_FLOOR, bevel=0.08)
    box("ENV_Platform_Safety_Edge_A", (0, 17.72, 0.45), (104, 0.55, 0.12), MAT_EDGE, bevel=0.02)
    box("ENV_Platform_Safety_Edge_B", (0, 30.28, 0.45), (104, 0.55, 0.12), MAT_EDGE, bevel=0.02)
    box("ENV_Back_Wall", (0, -36.0, 5.0), (104, 0.85, 10.0), MAT_BRICK, bevel=0.08)

    # Entrance wall has a real, walkable opening instead of an opaque portal.
    box("ARC_Barrier_Left", (-28.0, 0, 5.4), (48.0, 0.9, 10.8), MAT_BRICK, bevel=0.07)
    box("ARC_Barrier_Right", (28.0, 0, 5.4), (48.0, 0.9, 10.8), MAT_BRICK, bevel=0.07)
    box("ARC_Barrier_Upper", (0, 0, 12.5), (104, 0.9, 3.4), MAT_BRICK, bevel=0.07)
    for x in (-49, -4.9, 4.9, 49):
        box(f"ARC_Barrier_Pilaster_{x:+.1f}", (x, -0.52, 5.8), (1.15, 0.55, 11.6), MAT_STONE, bevel=0.09)
    box("ARC_Portal_Left", (-4.65, -0.58, 4.4), (0.8, 0.62, 8.8), MAT_STONE_LIGHT, bevel=0.09)
    box("ARC_Portal_Right", (4.65, -0.58, 4.4), (0.8, 0.62, 8.8), MAT_STONE_LIGHT, bevel=0.09)
    arch_points = []
    for i in range(25):
        theta = math.pi * i / 24
        arch_points.append((4.65 * math.cos(theta), -0.58, 4.4 + 4.65 * math.sin(theta)))
    tube("ARC_Portal_Arch", arch_points, 0.42, MAT_STONE_LIGHT)

    # Voussoirs give the arch readable close-up depth.
    for i in range(13):
        theta = math.pi * (i + 0.5) / 13
        x = 5.05 * math.cos(theta)
        z = 4.4 + 5.05 * math.sin(theta)
        stone = box(f"ARC_Arch_Block_{i:02d}", (x, -0.94, z), (0.9, 0.24, 0.68), MAT_STONE, bevel=0.04)
        stone.rotation_euler[1] = math.pi / 2 - theta

    # Wall panels and base trim create a human-scale concourse facade.
    box("ARC_Back_Wall_Base", (0, -35.54, 0.72), (104, 0.28, 1.35), MAT_STONE, bevel=0.04)
    for x in range(-44, 45, 11):
        box(f"ARC_Back_Wall_Pier_{x:+03d}", (x, -35.52, 5.2), (0.75, 0.32, 8.8), MAT_STONE_LIGHT, bevel=0.05)


def build_roof():
    y_values = np.linspace(-36, 42, 31)
    for x in np.linspace(-48, 48, 13):
        points = [(float(x), float(y), roof_height(float(y))) for y in y_values]
        tube(f"ARC_Roof_Rib_{int(x):+03d}", points, 0.13, MAT_IRON)
        box(f"ARC_Roof_Tie_{int(x):+03d}", (float(x), 3.0, 8.95), (0.22, 77.2, 0.22), MAT_IRON, bevel=0.025)

    for index, y in enumerate(np.linspace(-35, 41, 14)):
        z = roof_height(float(y))
        box(f"ARC_Roof_Purlin_{index:02d}", (0, float(y), z), (100.5, 0.11, 0.11), MAT_IRON, bevel=0.02)

    # One watertight mesh for the full glazed roof, inset under the iron grid.
    vertices = []
    faces = []
    x_values = np.linspace(-50, 50, 26)
    roof_y = np.linspace(-36, 42, 31)
    for x in x_values:
        for y in roof_y:
            vertices.append((float(x), float(y), roof_height(float(y)) - 0.055))
    width = len(roof_y)
    for i in range(len(x_values) - 1):
        for j in range(len(roof_y) - 1):
            a = i * width + j
            b = (i + 1) * width + j
            faces.append((a, b, b + 1, a + 1))
    mesh = bpy.data.meshes.new("ARC_Roof_Glass_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    glass = bpy.data.objects.new("ARC_Roof_Glass", mesh)
    bpy.context.collection.objects.link(glass)
    mesh.materials.append(MAT_GLASS)

    # Cast-iron columns with stepped bases and capitals.
    for x in range(-48, 49, 12):
        for y in (-34.6, 40.6):
            cylinder(f"ARC_Column_{x:+03d}_{int(y):+03d}", (x, y, 4.65), 0.22, 8.8, MAT_IRON_GREEN, vertices=20)
            cylinder(f"ARC_Column_Base_{x:+03d}_{int(y):+03d}", (x, y, 0.34), 0.48, 0.68, MAT_IRON_GREEN, vertices=16)
            cylinder(f"ARC_Column_Cap_{x:+03d}_{int(y):+03d}", (x, y, 8.78), 0.52, 0.48, MAT_IRON_GREEN, vertices=16)
            tube(
                f"ARC_Column_Brace_{x:+03d}_{int(y):+03d}",
                [(x, y, 7.5), (x, y - math.copysign(1.9, y - 11), 8.8)],
                0.1,
                MAT_IRON_GREEN,
            )


def build_track():
    box("RAIL_Ballast_Bed", (0, 24.0, -0.08), (104, 12.0, 0.35), MAT_BALLAST, bevel=0.06)
    for x in np.arange(-50, 50.1, 1.45):
        box(f"RAIL_Sleeper_{x:+05.1f}", (float(x), 24.0, 0.16), (0.32, 10.4, 0.3), MAT_WOOD, bevel=0.045)
    for y in (21.2, 23.0, 25.0, 26.8):
        box(f"RAIL_Steel_{y:04.1f}", (0, y, 0.49), (104, 0.14, 0.22), MAT_STEEL, bevel=0.035)


def build_sign_disc(name, location, radius, label, *, label_size=1.25):
    cylinder(name + "_Disc", location, radius, 0.18, MAT_ENAMEL, vertices=48, rotation=(math.radians(90), 0, 0), bevel=0.08)
    cylinder(name + "_Rim", (location[0], location[1] - 0.11, location[2]), radius + 0.12, 0.08, MAT_BRASS, vertices=48, rotation=(math.radians(90), 0, 0), bevel=0.05)
    text_mesh(name + "_Text", label, (location[0], location[1] - 0.23, location[2]), label_size, 0.055, MAT_WHITE)


def build_bench(x, y, facing=0.0):
    prefix = f"PRP_Bench_{x:+03.0f}_{y:+03.0f}"
    seat = box(prefix + "_Seat", (x, y, 0.92), (4.1, 0.72, 0.18), MAT_WOOD, bevel=0.07, rotation=(0, 0, facing))
    back = box(prefix + "_Back", (x, y + 0.3 * math.cos(facing), 1.62), (4.1, 0.16, 1.0), MAT_WOOD, bevel=0.07, rotation=(0, 0, facing))
    for dx in (-1.65, 1.65):
        box(prefix + f"_Leg_{dx:+.1f}", (x + dx * math.cos(facing), y + dx * math.sin(facing), 0.46), (0.18, 0.55, 0.88), MAT_IRON, bevel=0.04, rotation=(0, 0, facing))
    return seat, back


def build_luggage_rack(x, y):
    prefix = f"PRP_Rack_{x:+03.0f}_{y:+03.0f}"
    for dx in (-2.4, 2.4):
        cylinder(prefix + f"_Post_{dx:+.1f}", (x + dx, y, 1.35), 0.075, 2.7, MAT_IRON, vertices=12, bevel=0.02)
    for z in (1.15, 2.1):
        for offset in np.linspace(-0.65, 0.65, 5):
            box(prefix + f"_Slat_{z:.1f}_{offset:+.2f}", (x, y + float(offset), z), (5.0, 0.055, 0.08), MAT_IRON, bevel=0.015)
    box(prefix + "_Top", (x, y, 2.55), (5.1, 1.55, 0.12), MAT_WOOD, bevel=0.04)


def build_trunk(name, location, size=(1.4, 0.85, 0.75), color_mat=MAT_LEATHER):
    box(name + "_Body", (location[0], location[1], location[2] + size[2] / 2), size, color_mat, bevel=0.11)
    for x in (-size[0] * 0.32, size[0] * 0.32):
        box(name + f"_Band_{x:+.2f}", (location[0] + x, location[1] - size[1] * 0.505, location[2] + size[2] / 2), (0.08, 0.04, size[2] * 0.9), MAT_BRASS, bevel=0.012)
    box(name + "_Latch", (location[0], location[1] - size[1] * 0.53, location[2] + size[2] * 0.56), (0.22, 0.06, 0.18), MAT_BRASS, bevel=0.025)


def build_trolley(x, y, rotation=0.0):
    prefix = f"PRP_Trolley_{x:+03.0f}_{y:+03.0f}"
    box(prefix + "_Base", (x, y, 0.52), (2.1, 1.15, 0.13), MAT_IRON, bevel=0.035, rotation=(0, 0, rotation))
    for dx in (-0.82, 0.82):
        for dy in (-0.42, 0.42):
            cylinder(prefix + f"_Wheel_{dx:+.1f}_{dy:+.1f}", (x + dx, y + dy, 0.2), 0.18, 0.1, MAT_ENAMEL, vertices=16, rotation=(math.radians(90), 0, 0), bevel=0.02)
    box(prefix + "_Handle_Left", (x - 0.92, y, 1.35), (0.08, 0.08, 1.75), MAT_IRON, bevel=0.018)
    box(prefix + "_Handle_Right", (x - 0.92, y + 0.5, 1.35), (0.08, 0.08, 1.75), MAT_IRON, bevel=0.018)
    box(prefix + "_Grip", (x - 0.92, y + 0.25, 2.22), (0.08, 0.62, 0.08), MAT_WOOD, bevel=0.02)
    build_trunk(prefix + "_Trunk_A", (x + 0.1, y, 0.6), (1.35, 0.82, 0.7))
    build_trunk(prefix + "_Trunk_B", (x + 0.18, y + 0.02, 1.3), (1.0, 0.7, 0.55), MAT_WOOD)


def build_lamp(x, y, z=0.0, hanging=False):
    prefix = f"LGT_Lamp_{x:+03.0f}_{y:+03.0f}_{'H' if hanging else 'P'}"
    if hanging:
        top = roof_height(y) - 0.2
        cylinder(prefix + "_Chain", (x, y, (top + z) / 2), 0.03, top - z, MAT_IRON, vertices=10, bevel=0.008)
        lamp_z = z
    else:
        cylinder(prefix + "_Post", (x, y, 2.35), 0.1, 4.7, MAT_IRON_GREEN, vertices=16, bevel=0.025)
        cylinder(prefix + "_Base", (x, y, 0.25), 0.3, 0.5, MAT_IRON_GREEN, vertices=16, bevel=0.035)
        lamp_z = 4.9
    cylinder(prefix + "_Cage", (x, y, lamp_z), 0.48, 0.78, MAT_IRON, vertices=8, bevel=0.025)
    uv_sphere(prefix + "_Glow", (x, y, lamp_z), 0.31, MAT_EMISSIVE, scale=(0.82, 0.82, 1.15), segments=16, rings=8)
    box(prefix + "_Cap", (x, y, lamp_z + 0.53), (0.82, 0.82, 0.14), MAT_IRON, bevel=0.05)


def build_clock():
    x, y, z = -19.0, -35.36, 6.2
    cylinder("SGN_Station_Clock_Face", (x, y, z), 1.75, 0.22, MAT_WHITE, vertices=64, rotation=(math.radians(-90), 0, 0), bevel=0.07)
    cylinder("SGN_Station_Clock_Rim", (x, y + 0.14, z), 1.92, 0.12, MAT_IRON, vertices=64, rotation=(math.radians(-90), 0, 0), bevel=0.05)
    for i in range(12):
        angle = i / 12 * math.tau
        px = x + math.sin(angle) * 1.35
        pz = z + math.cos(angle) * 1.35
        box(f"SGN_Clock_Marker_{i:02d}", (px, y + 0.28, pz), (0.08, 0.04, 0.3 if i % 3 == 0 else 0.18), MAT_ENAMEL, bevel=0.015, rotation=(0, angle, 0))
    tube("SGN_Clock_Hour_Hand", [(x, y + 0.3, z), (x - 0.72, y + 0.3, z + 0.48)], 0.055, MAT_ENAMEL)
    tube("SGN_Clock_Minute_Hand", [(x, y + 0.31, z), (x + 0.3, y + 0.31, z + 1.12)], 0.042, MAT_ENAMEL)


def build_dressing():
    # Platform identity and station name are modeled geometry, not screen-space sprites.
    build_sign_disc("SGN_Platform_934", (0, -0.72, 11.3), 2.2, "9¾", label_size=1.65)
    box("SGN_KingsCross_Board", (18.5, -35.47, 7.3), (23.0, 0.16, 2.15), MAT_ENAMEL, bevel=0.15)
    text_mesh("SGN_KingsCross_Text", "KING'S CROSS", (18.5, -35.31, 7.3), 1.15, 0.055, MAT_WHITE, rotation=(math.radians(-90), 0, 0))

    build_clock()
    for x in (-38, -18, 2, 22, 42):
        build_lamp(x, 14.8)
        build_lamp(x + 5, 34.0)
    for x in (-42, -24, -6, 12, 30, 48):
        build_lamp(x, -20.0, z=10.5, hanging=True)

    for x, y in ((-34, 10.4), (-10, 10.4), (16, 10.4), (38, 10.4), (-26, 36.3), (4, 36.3), (30, 36.3)):
        build_bench(x, y)
    for x, y in ((-37, 6.0), (-5, 6.0), (28, 6.0), (-20, 39.0), (18, 39.0)):
        build_luggage_rack(x, y)

    build_trolley(-10, -9.5)
    build_trolley(16, -13.0)
    build_trolley(-30, 5.0)
    build_trunk("PRP_Loose_Trunk_A", (26.0, 6.2, 0.42), (1.7, 1.0, 0.9))
    build_trunk("PRP_Loose_Trunk_B", (28.0, 6.4, 0.42), (1.1, 0.8, 0.65), MAT_WOOD)


def add_preview_lighting():
    bpy.ops.object.light_add(type="AREA", location=(11, -12, 18))
    key = bpy.context.object
    key.name = "PREVIEW_Key_Area"
    key.data.energy = 9500
    key.data.shape = "RECTANGLE"
    key.data.size = 42
    key.data.size_y = 18
    key.data.color = (1.0, 0.57, 0.28)
    look_at(key, (0, 5, 4.5))

    bpy.ops.object.light_add(type="AREA", location=(18, 24, 18))
    fill = bpy.context.object
    fill.name = "PREVIEW_Fill_Area"
    fill.data.energy = 6800
    fill.data.shape = "DISK"
    fill.data.size = 30
    fill.data.color = (0.22, 0.4, 1.0)
    look_at(fill, (0, 8, 4))

    bpy.ops.object.light_add(type="AREA", location=(-34, -5, 10))
    rim = bpy.context.object
    rim.name = "PREVIEW_Rim_Area"
    rim.data.energy = 3600
    rim.data.size = 14
    rim.data.color = (1.0, 0.33, 0.12)
    look_at(rim, (0, 5, 5))

    for x, y, z in ((0, -4, 8), (-28, 10, 7), (28, 12, 7)):
        bpy.ops.object.light_add(type="POINT", location=(x, y, z))
        light = bpy.context.object
        light.name = f"PREVIEW_Warm_Point_{x:+03d}_{y:+03d}"
        light.data.energy = 1200
        light.data.color = (1.0, 0.43, 0.13)
        light.data.shadow_soft_size = 3.0

    bpy.ops.object.camera_add(location=(30, -14.5, 4.8))
    camera = bpy.context.object
    camera.name = "PREVIEW_Camera"
    camera.data.lens = 34
    look_at(camera, (0, 6.5, 4.0))
    scene.camera = camera


def join_runtime_meshes_by_material():
    groups = {}
    for obj in list(scene.objects):
        if obj.type != "MESH" or obj.name.startswith("PREVIEW_"):
            continue
        key = tuple(slot.material.name if slot.material else "" for slot in obj.material_slots)
        groups.setdefault(key, []).append(obj)
    for index, objects in enumerate(groups.values()):
        if len(objects) < 2:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
        objects[0].name = f"WEB_Batched_{index:02d}_{objects[0].active_material.name if objects[0].active_material else 'Mesh'}"


build_floor_and_walls()
build_roof()
build_track()
build_dressing()
add_preview_lighting()

# Save the editable source before browser batching, so repeated pieces remain easy to edit.
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))

# A web build combines equal-material meshes to reduce draw calls.
join_runtime_meshes_by_material()

bpy.ops.object.select_all(action="DESELECT")
for obj in scene.objects:
    if obj.type == "MESH" and not obj.name.startswith("PREVIEW_"):
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

camera = scene.camera
camera.location = (36.0, 28.0, 6.2)
camera.data.lens = 32
look_at(camera, (0, 10.0, 3.6))
scene.render.filepath = str(PLATFORM_RENDER_PATH)
bpy.ops.render.render(write_still=True)

triangles = 0
for obj in scene.objects:
    if obj.type == "MESH" and not obj.name.startswith("PREVIEW_"):
        mesh = obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
        mesh.calc_loop_triangles()
        triangles += len(mesh.loop_triangles)
        obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh_clear()

print("MAGIC_STATION_BUILD_OK")
print(f"BLEND={BLEND_PATH}")
print(f"GLB={GLB_PATH}")
print(f"RENDER={RENDER_PATH}")
print(f"PLATFORM_RENDER={PLATFORM_RENDER_PATH}")
print(f"TRIANGLES={triangles}")
