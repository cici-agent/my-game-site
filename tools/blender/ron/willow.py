"""Build Ron's turned willow wand around the high-detail right hand's five contacts."""
from io import BytesIO

import numpy as np
from PIL import Image

from finish import leg
from geometry import unit

LENGTH_METRES = .3556
BANDS = -.038 + .014 * np.arange(6)


def make_texture():
    """Map the wood along the cut shaft. The polished ridges expose a lighter grain."""
    theta, height = np.meshgrid(np.arange(384) * 2 * np.pi / 384, np.arange(1024) / 1023)
    theta += .06 * np.sin(12 * height + 2 * theta) + .03 * np.cos(32 * height - theta)
    grain = .44 * np.sin(21 * theta + 2 * np.cos(8 * height + 2 * theta))
    grain += .22 * np.sin(41 * theta - 2.5 * np.sin(13 * height + theta))
    grain += .16 * np.cos(97 * theta + 1.8 * np.sin(18 * height - theta))
    for angle, y in ((1.7, .81), (4.1, .48)):
        offset = np.angle(np.exp(1j * (theta - angle)))
        rings = np.hypot(offset / .37, (height - y) / .035)
        grain += .35 * np.exp(-rings) * np.sin(16 * rings)
    grain += np.random.default_rng(71).normal(0, .12, grain.shape)
    return grain, height


def image_texture(builder, name, rgb):
    buf = BytesIO()
    Image.fromarray(np.clip(rgb, 0, 255).astype('uint8')).save(buf, 'JPEG', quality=90, subsampling=0)
    image = builder.append('images', dict(name=name, bufferView=builder.view(buf.getvalue()), mimeType='image/jpeg'))
    return builder.append('textures', {'source': image})


def change_axes(vector):
    x, y, z = vector
    return np.array([x, z, -y])


def make(builder):
    hand = builder.a.nodes[builder.a.byname['HF_Wand_Hand']]['extras']
    center = change_axes(hand['gripCenter'])
    axis = unit(change_axes(hand['gripAxis']))
    up = unit(np.array([0., 1., 0.]) - axis * axis[1])
    side = np.cross(axis, up)
    angles, contacts = [], []
    for digit in ('little', 'ring', 'middle', 'thumb', 'index'):
        offset = change_axes(hand['grip_' + digit + '_wood']) - center
        t = float(offset @ axis)
        radial = offset - t * axis
        angles.append(np.arctan2(radial @ side, radial @ up) % (2 * np.pi))
        contacts.append((t, np.linalg.norm(radial)))

    # Metres in the actor's local rest frame. Compensate for the final stature
    # transform so the standalone wand and the prop in his hand agree in length.
    start = -.055
    end = start + LENGTH_METRES * leg(builder.a) / leg(builder.s)
    profile = sorted([(start, .0004), (-.0545, .0039), (-.0525, .0076), (-.05, .0104),
                      (-.046, .0117), (-.041, .0113), *contacts, (.050, .00915),
                      (.056, .0100), (.059, .00985), (.061, .0083), (.064, .00795),
                      (.066, .00835), (.0685, .00665), (.078, .0059), (.14, .0049),
                      (.195, .0039), (end - .035, .0026), (end - .0038, .0016),
                      (end - .00085, .00118), (end, .00022)])
    stations, radii = np.asarray(profile).T
    contact_t = np.asarray(contacts)[:, 0]
    t = np.unique(np.r_[np.linspace(start, end, 156), stations, *(BANDS + offset for offset in (-.003, -.0012, 0., .0012, .003))])
    theta = np.unique(np.r_[np.linspace(0, 2 * np.pi, 65), angles])
    arc = (t - start) / (end - start)
    q = np.maximum(t - .052, 0.)
    curve = center + t[:, None] * axis
    curve += (.0038 * (1 - np.cos(20 * q)))[:, None] * side
    curve += (.003 * (q / (end - .052))**2)[:, None] * up
    radial = np.cos(theta)[:, None] * up + np.sin(theta)[:, None] * side
    radius = np.interp(t, stations, radii)[:, None] * np.ones_like(theta)
    # Turn six low beads in the handle and lightly scallop its surface. The
    # original hand model supplies the exact cross section at each contact.
    worn = np.minimum(1., np.min(np.abs(t[:, None] - contact_t), axis=1) / .002)**2
    ridge = np.sum(np.exp(-((t[:, None] - BANDS) / .0022)**2), axis=1)
    grip = np.exp(-((t - .002) / .062)**6)
    flute = (.00019 * np.cos(5 * theta + 7 * t[:, None]) +
             .00010 * np.sin(3 * theta - 2 * t[:, None]))
    radius += worn[:, None] * (.00105 * ridge[:, None] + grip[:, None] * flute)
    pos = curve[:, None, :] + radius[:, :, None] * radial[None, :, :]
    around = np.gradient(pos, theta, axis=1)
    along = np.gradient(pos, t, axis=0)
    normals = unit(np.cross(around, along))
    normals[:, 0] = normals[:, -1] = unit(normals[:, 0] + normals[:, -1])
    u, v = np.meshgrid(theta / (2 * np.pi), arc)
    uv = np.stack([u, v], axis=-1)
    ni, nj = pos.shape[:2]
    a = (np.arange(ni - 1)[:, None] * nj + np.arange(nj - 1)).ravel()
    faces = np.concatenate([np.stack([a, a + 1, a + nj], 1), np.stack([a + 1, a + nj + 1, a + nj], 1)])
    # Close both cut ends with a small radial fan.
    pos, normals, uv = pos.reshape(-1, 3), normals.reshape(-1, 3), uv.reshape(-1, 2)
    for ring, direction, tc in ((0, -1, 0), (ni - 1, 1, 1)):
        ids = np.arange(nj) + ring * nj
        top = len(pos)
        pos = np.vstack((pos, curve[ring]))
        normals = np.vstack((normals, axis * direction))
        uv = np.vstack((uv, [.5, tc]))
        tris = np.stack((np.full(nj - 1, top), ids[:-1], ids[1:]), 1)
        faces = np.vstack((faces, tris if direction == 1 else tris[:, ::-1]))

    grain, h = make_texture()
    local = start + h * (end - start)
    polish = sum(np.exp(-((local - b) / .0021)**2) for b in BANDS)
    shoulder = np.exp(-((local - .0575) / .0016)**2) + np.exp(-((local - .066) / .0011)**2)
    color = np.array([115, 77, 55]) + grain[:, :, None] * [23, 18, 13]
    color += (polish + .82 * shoulder)[:, :, None] * [22, 17, 11]
    tex = image_texture(builder, 'Willow | sapwood and rubbed turning', color)
    rough = np.clip(143 + grain * 19 - 41 * polish - 21 * shoulder, 67, 173)
    packed = np.stack((np.full_like(rough, 255), rough, np.zeros_like(rough)), axis=-1)
    surface = image_texture(builder, 'Willow | polished grip roughness', packed)
    mat = builder.mat('Ron | waxed willow wood', [1, 1, 1], 1., 0, False)
    builder.doc['materials'][mat]['pbrMetallicRoughness'].update(
        baseColorTexture={'index': tex}, metallicRoughnessTexture={'index': surface})
    joints, weights = builder.skin(len(pos), 'HandR')
    part = builder.prim(dict(POSITION=pos, NORMAL=normals, TEXCOORD_0=uv, JOINTS_0=joints, WEIGHTS_0=weights), faces, mat)
    node = builder.mesh('Ron_Willow_Wand', [part], 'weapon', builder.a.byname['HF_Pathfinder_Wand_05'])
    builder.a.nodes[node]['extras'] = dict(wardrobeSlot='weapon', itemId='ron.willow', wood='willow',
                                           shaftLength=LENGTH_METRES, gripCentre=center.tolist())
    builder.drop('Pathfinder_Wand_Garnet_Catchlight')
