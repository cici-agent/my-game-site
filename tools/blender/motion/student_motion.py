"""Apply the shared school-character body motion to a new, similarly proportioned GLB."""
import argparse
import json
import math
from pathlib import Path
import struct
import os
import tempfile
import numpy as np

JOINTS = ['Hips', 'Chest', 'Head', 'ArmL', 'ForearmL', 'HandL', 'ArmR', 'ForearmR', 'HandR',
          'ThighL', 'ShinL', 'FootL', 'ThighR', 'ShinR', 'FootR']
SIDES = ('L', 'R')


def rotation(matrix):
    axes = matrix[:3, :3]
    return axes / np.linalg.norm(axes, axis=0)


def quaternion(m):
    # The symmetric eigenproblem also works for rotations close to 180 degrees.
    x, y, z = m
    k = np.array([[x[0]-y[1]-z[2], x[1]+y[0], x[2]+z[0], z[1]-y[2]],
                  [x[1]+y[0], y[1]-x[0]-z[2], y[2]+z[1], x[2]-z[0]],
                  [x[2]+z[0], y[2]+z[1], z[2]-x[0]-y[1], y[0]-x[1]],
                  [z[1]-y[2], x[2]-z[0], y[0]-x[1], m.trace()]])
    return np.linalg.eigh(k)[1][:, -1]


def arc(a, b):
    u, v = a/np.linalg.norm(a), b/np.linalg.norm(b)
    w = np.cross(u, v)
    c = float(np.clip(u@v, -1, 1))
    if c < -.999999:
        axis = np.cross(u, np.eye(3)[np.abs(u).argmin()])
        axis /= np.linalg.norm(axis)
        return 2*np.outer(axis, axis)-np.eye(3)
    k = np.array([[0., -w[2], w[1]], [w[2], 0., -w[0]], [-w[1], w[0], 0.]])
    return np.eye(3)+k+k@k/(1+c)


class Model:
    def __init__(self, path):
        self.file_mode = Path(path).stat().st_mode & 0o777
        data = Path(path).read_bytes()
        if data[:4] != b'glTF':
            raise ValueError('Expected a binary glTF file.')
        meta = struct.unpack_from('<I', data, 12)[0]
        self.doc = json.loads(data[20:20+meta])
        self.buf = bytearray(data[28+meta:28+meta+self.doc['buffers'][0]['byteLength']])
        self.nodes = self.doc['nodes']
        self.names = {n.get('name'): i for i, n in enumerate(self.nodes)}
        self.parents = {c: p for p, n in enumerate(self.nodes) for c in n.get('children', [])}
        self.bones = {}
        for si, skin in enumerate(self.doc['skins']):
            inv = self.array(skin['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)
            for i, m in zip(skin['joints'], np.linalg.inv(inv)):
                if i in self.bones and not np.allclose(self.bones[i], m, atol=2e-5):
                    raise ValueError('Different bind spaces for the same joint')
                self.bones[i] = m
        if not all(k in self.names and self.names[k] in self.bones for k in JOINTS):
            raise ValueError('This preset expects the 15 named school-character joints.')
        self.bind = np.array([self.bones[self.names[key]] for key in JOINTS])
        self.foot = {}
        for side in SIDES:
            fi = self.names['Foot'+side]
            inv = np.linalg.inv(self.bones[fi])
            points = []
            for n in self.nodes:
                if 'mesh' not in n or 'skin' not in n:
                    continue
                js = self.doc['skins'][n['skin']]['joints']
                if fi not in js:
                    continue
                for p in self.doc['meshes'][n['mesh']]['primitives']:
                    attr = p['attributes']
                    if 'JOINTS_0' not in attr:
                        continue
                    weights = self.array(attr['WEIGHTS_0'])
                    joints = self.array(attr['JOINTS_0'])
                    mask = np.sum(weights*(joints == js.index(fi)), axis=1) > .995
                    if mask.any():
                        points.append(self.array(attr['POSITION'])[mask])
            if not points:
                raise ValueError('Expected a rigidly foot-bound shoe sole.')
            coords = np.unique(np.vstack(points).round(5), axis=0)
            coords = coords[coords[:, 1] < self.bones[fi][1, 3]+.025]
            if not len(coords):
                raise ValueError('No sole points found below ankle.')
            self.foot[side] = (inv@np.column_stack([coords, np.ones(len(coords))]).T)[:3]

    def array(self, i):
        a = self.doc['accessors'][i]
        v = self.doc['bufferViews'][a['bufferView']]
        if 'sparse' in a:
            raise ValueError('Sparse accessors are unsupported for rig or sole data.')
        widths = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
        typ = np.dtype({5120: 'i1', 5121: 'u1', 5122: '<i2', 5123: '<u2',
                       5125: '<u4', 5126: '<f4'}[a['componentType']])
        w = widths[a['type']]
        arr = np.ndarray((a['count'], w), dtype=typ, buffer=self.buf,
                         offset=v.get('byteOffset', 0)+a.get('byteOffset', 0),
                         strides=(v.get('byteStride', typ.itemsize*w), typ.itemsize))
        return arr.astype(float)/np.iinfo(typ).max if a.get('normalized') else arr

    def append(self, values):
        data = np.asarray(values, dtype='<f4')
        self.buf.extend(bytes(-len(self.buf) % 4))
        views = self.doc['bufferViews']
        acc = self.doc['accessors']
        views.append({'buffer': 0, 'byteOffset': len(self.buf), 'byteLength': data.nbytes})
        self.buf.extend(data.tobytes())
        tp = {1: 'SCALAR', 3: 'VEC3', 4: 'VEC4'}[data.shape[1]]
        entry = {'bufferView': len(views)-1, 'componentType': 5126, 'count': len(data), 'type': tp}
        if tp == 'SCALAR':
            entry.update(min=[float(data.min())], max=[float(data.max())])
        acc.append(entry)
        return len(acc)-1

    def write(self, path):
        self.doc['buffers'][0]['byteLength'] = len(self.buf)
        self.buf.extend(bytes(-len(self.buf) % 4))
        meta = json.dumps(self.doc, separators=(',', ':'), ensure_ascii=False).encode()
        meta += b' '*(-len(meta) % 4)
        hdr = struct.pack('<4sII', b'glTF', 2, 28+len(meta)+len(self.buf))
        payload = hdr + struct.pack('<I4s', len(meta), b'JSON') + meta
        payload += struct.pack('<I4s', len(self.buf), b'BIN\0') + self.buf
        with tempfile.NamedTemporaryFile(dir=Path(path).parent, delete=False) as f:
            tmp = Path(f.name)
            try:
                os.fchmod(f.fileno(), self.file_mode)
                f.write(payload)
                f.close()
                os.replace(tmp, path)
            finally:
                tmp.unlink(missing_ok=True)


def leg_length(bind):
    return sum(np.linalg.norm(bind[JOINTS.index(a), :3, 3]-bind[JOINTS.index(b), :3, 3])
               for a, b in [('ThighL', 'ShinL'), ('ShinL', 'FootL')])


def align_leg(poses, side, sole, wanted):
    t, k, f = [JOINTS.index(k+side) for k in ('Thigh', 'Shin', 'Foot')]
    h, knee, ankle = (poses[i, :3, 3].copy() for i in (t, k, f))
    foot = poses[f]
    floor = float(np.min((foot[:3, :3]@sole)[1])+ankle[1])
    goal = ankle.copy()
    goal[1] += wanted-floor
    line = goal-h
    dist = np.linalg.norm(line)
    axis = line/dist
    l1 = np.linalg.norm(knee-h)
    l2 = np.linalg.norm(ankle-knee)
    d = np.clip(dist, abs(l1-l2)+1e-7, l1+l2-1e-7)
    pole = knee-h-axis*((knee-h)@axis)
    if np.linalg.norm(pole) < 1e-5:
        pole = np.array([0., 0., 1.])
        pole -= axis*(pole@axis)
    along = (l1*l1-l2*l2+d*d)/(2*d)
    new_k = h+along*axis+math.sqrt(max(0, l1*l1-along*along))*pole/np.linalg.norm(pole)
    new_a = h+axis*d
    poses[t, :3, :3] = arc(knee-h, new_k-h)@poses[t, :3, :3]
    poses[k, :3, :3] = arc(ankle-knee, new_a-new_k)@poses[k, :3, :3]
    poses[k, :3, 3] = new_k
    poses[f, :3, 3] = new_a
    return abs(new_a[1]-goal[1])


def wand_axis(model, explicit_name=None):
    """Find the oriented shaft of the target's rigidly held wand, in rig bind space."""
    meshes = model.doc.get('meshes', [])
    hand = model.names['HandR']
    wrist = model.bones[hand][:3, 3]
    axes = []
    if explicit_name and explicit_name not in model.names:
        raise ValueError(f'No wand node named {explicit_name!r}.')
    for node in model.nodes:
        name = node.get('name', '')
        chosen = name == explicit_name if explicit_name else (
            name.startswith('Wand_') or node.get('extras', {}).get('wardrobeSlot') == 'weapon')
        if not chosen or 'mesh' not in node or 'skin' not in node:
            continue
        joints = model.doc['skins'][node['skin']]['joints']
        if hand not in joints:
            continue
        points = []
        for primitive in meshes[node['mesh']]['primitives']:
            a = primitive['attributes']
            if not all(k in a for k in ['JOINTS_0', 'WEIGHTS_0', 'POSITION']):
                continue
            weight = np.sum(model.array(a['WEIGHTS_0'])*(model.array(a['JOINTS_0']) == joints.index(hand)), axis=1)
            points.extend(model.array(a['POSITION'])[weight > .995])
        if len(points) < 3:
            continue
        points = np.unique(points, axis=0)
        center = points.mean(axis=0)
        _, sv, vectors = np.linalg.svd(points-center, full_matrices=False)
        if len(sv) < 2 or sv[0] < 4*sv[1]:
            continue  # Skip gems or other round accessories sharing the weapon slot.
        shaft = (points-center)@vectors[0]
        length = float(np.ptp(shaft))
        if length < .1*leg_length(model.bind):
            continue
        ends = [points[shaft < shaft.min()+length*.02].mean(0),
                points[shaft > shaft.max()-length*.02].mean(0)]
        base, tip = sorted(ends, key=lambda point: np.linalg.norm(point-wrist))
        direction = tip-base
        axes.append((length, direction/np.linalg.norm(direction)))
    if not axes:
        if explicit_name:
            raise ValueError('Expected an elongated wand skinned to HandR for the selected node.')
        return None
    # Alternate school wands share their mounting direction. Use the longest
    # shaft as the least sensitive reference for a curved or decorated tip.
    return max(axes, key=lambda item: item[0])[1]


def cast_wrist_correction(reference_axis, target_axis, time, phases):
    start, _, _, release, end = phases
    blend = min(1., max(0., time/start), max(0., (end-time)/(end-release)))
    amount = blend*blend*(3.-2.*blend)
    axis = (1-amount)*target_axis+amount*reference_axis
    if np.linalg.norm(axis) < 1e-6 or np.dot(reference_axis, target_axis) < -.999:
        raise ValueError('Reversed wand grip needs a separate retarget profile.')
    return arc(target_axis, axis)


def convert(pack_path, model_path, out, wand_node=None):
    if Path(model_path).resolve() == Path(out).resolve():
        raise ValueError('Use a new output file.')
    target = Model(model_path)
    data = np.load(pack_path, allow_pickle=False)
    src = data['bind']
    if list(data['joints']) != JOINTS:
        raise ValueError('Unknown motion pack')
    tgt = target.bind
    ratio = float(leg_length(tgt)/leg_length(src))
    ids = [target.names[k] for k in JOINTS]
    order = {j: i for i, j in enumerate(ids)}
    parents = [order.get(target.parents.get(j), -1) for j in ids]
    if parents != [-1, 0, 1, 1, 3, 4, 1, 6, 7, 0, 9, 10, 0, 12, 13]:
        raise ValueError('The 15-joint preset needs the school-character hierarchy.')
    # All current students use a Y-up scene with a uniformly scaled rig.
    node = target.nodes[ids[0]]
    q = node.get('rotation', [0., 0., 0., 1.])
    x, y, z, w = q
    m = np.eye(4)
    m[:3, :3] = np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
                          [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
                          [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])*node.get('scale', [1, 1, 1])
    m[:3, 3] = node.get('translation', [0, 0, 0])
    root_parent = tgt[0]@np.linalg.inv(m)
    if not np.allclose(root_parent[:3, :3], np.eye(3)*np.linalg.norm(root_parent[:3, 0]), atol=1e-4):
        raise ValueError('Expected a Y-up uniform-scale student root in its bind pose.')
    refrot = [rotation(b) for b in src]
    tgrot = [rotation(b) for b in tgt]
    locals_ = [np.linalg.inv(tgt[p])@b if p >= 0 else m for p, b in zip(parents, tgt)]
    for i, p in enumerate(parents):
        if p >= 0 and i not in (2,):
            aa = np.linalg.norm(tgt[i, :3, 3]-tgt[p, :3, 3])
            bb = ratio*np.linalg.norm(src[i, :3, 3]-src[p, :3, 3])
            if aa/max(bb, 1e-9) < .83 or aa/max(bb, 1e-9) > 1.17:
                raise ValueError('Character proportions require a separate retarget profile.')
    names = [str(k) for k in data['clips']]
    target_axis = wand_axis(target, wand_node) if 'Cast' in names else None
    hand = JOINTS.index('HandR')
    fps = int(data['fps'])
    if 'Cast' in names:
        reference_axis, cast_phases = data['Cast_wand_axis'], data['Cast_phases']
    animations = target.doc.setdefault('animations', [])
    originals = {a.get('name'): a for a in animations}
    animations[:] = [a for a in animations if a.get('name') not in names]

    def place(ref):
        poses = tgt.copy()
        poses[0, :3, 3] = tgt[0, :3, 3]+ratio*(ref[0, :3, 3]-src[0, :3, 3])
        for i, p in enumerate(parents):
            poses[i, :3, :3] = (rotation(ref[i])@refrot[i].T@tgrot[i])*np.linalg.norm(tgt[i, :3, :3], axis=0)
            if p >= 0:
                poses[i, :3, 3] = (poses[p]@locals_[i])[:3, 3]
        return poses

    # Set the shoe-height calibration once for the character, across all clips.
    # Lowering the hips independently at strikes would reintroduce a step hitch.
    drop = 0.
    for clip in names:
        for ref, floors in zip(data[clip], data[clip+'_floor']):
            poses = place(ref)
            for idx, side in enumerate(SIDES):
                ti, ki, fi = [JOINTS.index(k+side) for k in ('Thigh', 'Shin', 'Foot')]
                h, k, a = poses[[ti, ki, fi], :3, 3]
                local_bottom = float((poses[fi, :3, :3]@target.foot[side])[1].min())
                wanted = floors[idx]*ratio-local_bottom
                l1, l2 = np.linalg.norm(h-k), np.linalg.norm(k-a)
                span2 = l1*l1+l2*l2+2*l1*l2*math.cos(math.radians(6))
                dxz = (a-h)[[0, 2]]
                drop = max(drop, h[1]-wanted-math.sqrt(max(0., span2-dxz@dxz)))
    if drop > .065*ratio:
        raise ValueError('Shoe and leg measurements need a separate retarget profile.')
    for clip in names:
        motion = data[clip]
        ground = data[clip+'_floor']
        allroots = []
        allrots = []
        errors = []
        for frame, ref in enumerate(motion):
            poses = place(ref)
            if clip == 'Cast' and target_axis is not None:
                correction = cast_wrist_correction(reference_axis, target_axis, frame/fps, cast_phases)
                # Correct the hand orientation only; both the palm and the target's
                # own held object follow the same rigid rotation. Preserve wrist origin.
                poses[hand,:3,:3] = (rotation(ref[hand])@refrot[hand].T@correction@tgrot[hand]
                                      * np.linalg.norm(tgt[hand,:3,:3],axis=0))
            poses[:, 1, 3] -= drop
            for idx, s in enumerate(SIDES):
                errors.append(align_leg(poses, s, target.foot[s], float(ground[frame, idx])*ratio))
            allroots.append((np.linalg.inv(root_parent)@poses[0])[:3, 3])
            allrots.append([quaternion(rotation(np.linalg.inv(poses[p] if p >= 0 else root_parent)@poses[i]))
                           for i, p in enumerate(parents)])
        if max(errors) > .006:
            raise ValueError(f'{clip} shoe correction unreachable: {max(errors):.4f} m')
        clock = target.append((np.arange(len(motion))/int(data['fps']))[:, None])
        samplers = []
        channels = []

        def track(i, prop, values):
            srcidx = target.append(values)
            channels.append({'sampler': len(samplers), 'target': {'node': ids[i], 'path': prop}})
            samplers.append({'input': clock, 'output': srcidx, 'interpolation': 'LINEAR'})
        track(0, 'translation', allroots)
        rotations = np.array(allrots)
        for i in range(len(ids)):
            values = rotations[:, i]
            for n in range(1, len(values)):
                if values[n-1]@values[n] < 0:
                    values[n] *= -1
            track(i, 'rotation', values)
        # Preserve an existing face or accessory performance when replacing
        # the body. Fit its key times to the new cycle; cubic tangents are
        # derivatives in seconds and must be scaled together with their times.
        original = originals.get(clip)
        if original:
            secondary = [ch for ch in original['channels']
                         if ch['target'].get('path') == 'weights' or ch['target'].get('node') not in ids]
            if secondary:
                old_end = max(float(target.array(s['input'])[-1,0]) for s in original['samplers'])
                stretch = (len(motion)-1) / int(data['fps']) / old_end if old_end else 1.
                for ch in secondary:
                    sampler = original['samplers'][ch['sampler']].copy()
                    times = target.array(sampler['input']).copy()
                    sampler['input'] = target.append(times * stretch)
                    if sampler.get('interpolation') == 'CUBICSPLINE':
                        values = target.array(sampler['output']).copy()
                        blocks = values.reshape(len(times),3,-1)
                        blocks[:,0] /= stretch
                        blocks[:,2] /= stretch
                        sampler['output'] = target.append(values)
                    channels.append(dict(ch, sampler=len(samplers)))
                    samplers.append(sampler)
        extra = dict(original.get('extras', {}) if original else {})
        if clip == 'Cast':
            extra['phases'] = dict(zip(('circleStart','circleEnd','gather','release','recover'),
                                       map(float, data['Cast_phases'])))
            extra['groundSpeed'] = 0.
        else:
            extra['groundSpeed'] = ratio*{'Idle': 0., 'Walk': 1.09, 'Run': 2.34}[clip]
        animations.append({'name': clip, 'channels': channels, 'samplers': samplers, 'extras': extra})
        print(clip, len(motion), 'samples; scale', round(ratio, 3),
              'contact error (mm)', round(max(errors)*1000, 2))
    target.write(out)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input')
    parser.add_argument('output')
    parser.add_argument('--pack', default=str(Path(__file__).with_name('student-motion.npz')))
    parser.add_argument('--wand-node', help='Skinned right-hand wand to calibrate. Defaults to the longest Wand_* or weapon slot.')
    args = parser.parse_args()
    convert(args.pack, args.input, args.output, args.wand_node)
