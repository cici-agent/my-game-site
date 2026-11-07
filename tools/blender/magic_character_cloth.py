"""Tileable knit and twill textures, embedded in the game characters at export."""
import bpy
import numpy as np


def packed_texture(name, rgb, normal=False):
    height, width = rgb.shape[:2]
    image = bpy.data.images.new(name, width, height, alpha=False)
    if normal:
        image.colorspace_settings.name = "Non-Color"
    rgba = np.ones((height, width, 4), dtype=np.float32)
    rgba[:, :, :3] = rgb
    image.pixels.foreach_set(rgba.ravel())
    image.pack()
    return image


def textile(kind):
    # Each tile represents 12 cm. Low-frequency waves soften the regular yarn pattern.
    y, x = np.mgrid[0:256, 0:256] / 256
    angle = 2 * np.pi
    grain = np.random.default_rng(710 if kind == "knit" else 929).normal(0, .04, x.shape)
    uneven = .32 * np.cos(angle * (x + 2 * y)) + .18 * np.sin(angle * (3 * x - y))
    if kind == "knit":
        leg = np.abs(2 * ((x * 24) % 1) - 1)
        surface = .36 * np.cos(angle * (y * 19 + .56 * leg)) + .20 * np.cos(angle * x * 24)
    else:
        warp = np.cos(angle * (44 * x + uneven * .12))
        weft = np.cos(angle * (46 * y + uneven * .10))
        surface = .21 * warp + .18 * weft + .14 * np.cos(angle * (19 * x - 23 * y))
    surface += .18 * uneven + grain
    light = np.clip(.84 + .20 * surface, .53, 1)
    tone = packed_texture("Yarn_" + kind, light[:, :, None])
    dx = np.roll(surface, -1, axis=1) - np.roll(surface, 1, axis=1)
    dy = np.roll(surface, -1, axis=0) - np.roll(surface, 1, axis=0)
    normals = np.stack((-dx, -dy, np.ones_like(dx)), axis=-1)
    normals /= np.linalg.norm(normals, axis=2, keepdims=True)
    normal = packed_texture("Fibres_" + kind, normals * .5 + .5, normal=True)
    return tone, normal


def map_garment(mesh):
    # Align the vertical grain on the front, back and side panels. The underside of
    # cuffs and collars gets a planar projection. UVs remain attached during walking.
    layer = mesh.uv_layers.new(name="Cloth")
    for face in mesh.polygons:
        axis = max(range(3), key=lambda index: abs(face.normal[index]))
        for slot in face.loop_indices:
            x, y, z = mesh.vertices[mesh.loops[slot].vertex_index].co
            u, v = ((y, z), (x, z), (x, y))[axis]
            layer.data[slot].uv = (u / .12, v / .12)


def dress_surfaces():
    for obj in bpy.context.scene.objects:
        if obj.name.startswith("Outfit_"):
            map_garment(obj.data)
    knit = {"knit", "rib", "tee"}
    twill = {"robe", "lining", "liningLight", "hood", "edge", "trousers", "denim", "coat", "trim", "shirt", "tie"}
    tiles = {}
    for mat in bpy.data.materials:
        name = mat.name.removeprefix("Fabric_")
        if name not in knit | twill:
            continue
        kind = "knit" if name in knit else "twill"
        if kind not in tiles:
            tiles[kind] = textile(kind)
        tone_map, normal_map = tiles[kind]
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        shader = nodes.get("Principled BSDF")
        tone = nodes.new("ShaderNodeTexImage")
        tone.image = tone_map
        blend = nodes.new("ShaderNodeMix")
        blend.data_type = "RGBA"
        blend.blend_type = "MULTIPLY"
        sockets = {socket.identifier: socket for socket in blend.inputs}
        sockets["Factor_Float"].default_value = 1
        sockets["A_Color"].default_value = shader.inputs["Base Color"].default_value[:]
        links.new(tone.outputs["Color"], sockets["B_Color"])
        output = next(socket for socket in blend.outputs if socket.identifier == "Result_Color")
        links.new(output, shader.inputs["Base Color"])
        normal = nodes.new("ShaderNodeTexImage")
        normal.image = normal_map
        direction = nodes.new("ShaderNodeNormalMap")
        direction.inputs["Strength"].default_value = .55 if kind == "knit" else .32
        links.new(normal.outputs["Color"], direction.inputs["Color"])
        links.new(direction.outputs["Normal"], shader.inputs["Normal"])
        shader.inputs["Roughness"].default_value = .9 if kind == "knit" else .84
