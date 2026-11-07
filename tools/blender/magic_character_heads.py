"""Rebuild the academy heads in Blender. All geometry is in meters, facing -Y.

The facial surface starts with Google MediaPipe's canonical face model (Apache
License 2.0, see face_topology/LICENSE). We fit it to our generated reference
portraits, close the cranium, construct the ears, and groom original hair meshes.
"""
from pathlib import Path
from math import sin, cos, pi, exp, sqrt
import json
import random
import bpy
import numpy as np
from mathutils import Vector

SOURCE = Path(__file__).resolve().parent
TEXTURES = SOURCE.parents[1] / "art" / "textures" / "characters"
CHIN = 1.50
SKIN = {"harry": (.56, .325, .255), "hermione": (.59, .33, .245), "ron": (.60, .355, .287)}
HAIR = {"harry": (.033, .021, .016), "hermione": (.104, .055, .029), "ron": (.25, .099, .047)}
# Ordered outline of MediaPipe's 468-landmark facial topology.
OUTLINE = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,
           152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109]


def mat(name, rgb, roughness=.58, metal=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1)
    m.use_nodes = True
    shader = m.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*rgb, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metal
    return m


def mesh(name, verts, faces, material):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    obj = bpy.data.objects.new("Head_" + name, data)
    bpy.context.collection.objects.link(obj)
    data.materials.append(material)
    data.polygons.foreach_set("use_smooth", [True] * len(faces))
    return obj


def add_uv(obj, uvs):
    uv = obj.data.uv_layers.new(name="PortraitUV")
    coords = [component for loop in obj.data.loops for component in uvs[loop.vertex_index]]
    uv.uv.foreach_set("vector", coords)


def sphere(name, point, sizes, material):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, location=point)
    obj = bpy.context.object
    obj.name = "Head_" + name
    obj.scale = sizes
    obj.data.materials.append(material)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


class Tubes:
    """Collect hundreds of tapered strands in a small number of draw calls."""
    def __init__(self):
        self.verts, self.faces, self.uvs, self.material_indices = [], [], [], []

    def add(self, path, widths, thicknesses, normals, slot=0, sides=8, uv_shift=0):
        offset = len(self.verts)
        for i, p in enumerate(path):
            tangent = (path[min(i+1, len(path)-1)] - path[max(0, i-1)]).normalized()
            normal = Vector(normals[i])
            side = tangent.cross(normal).normalized()
            normal = side.cross(tangent).normalized()
            u = i / (len(path)-1)
            for j in range(sides + 1):
                angle = j * 2*pi / sides
                self.verts.append(tuple(p + side * (cos(angle)*widths[i]) + normal * (sin(angle)*thicknesses[i])))
                self.uvs.append((j/sides + uv_shift, u))
            if i:
                for j in range(sides):
                    a = offset + (i-1)*(sides+1)+j
                    b = a+sides+1
                    self.faces.append((a,b,b+1,a+1))
                    self.material_indices.append(slot)

    def card(self, path, widths, normals, phase=0):
        # Open, convex cards carry fine opaque and cutout strands. Their ends fan
        # independently through the alpha texture instead of converging to points.
        offset=len(self.verts)
        columns=5
        for i,p in enumerate(path):
            tangent=(path[min(i+1,len(path)-1)]-path[max(0,i-1)]).normalized()
            side=tangent.cross(normals[i]).normalized()
            normal=side.cross(tangent).normalized()
            u=i/(len(path)-1)
            for j in range(columns):
                f=j/(columns-1)
                across=2*f-1
                arc=(1-across*across)*widths[i]*.105
                self.verts.append(tuple(p+side*(across*widths[i])+normal*arc))
                self.uvs.append((f,1-u))
            if i:
                for j in range(columns-1):
                    a=offset+(i-1)*columns+j
                    self.faces.append((a,a+columns,a+columns+1,a+1))
                    self.material_indices.append(0)

    def output(self, name, materials, texture=False):
        obj = mesh(name, self.verts, self.faces, materials[0])
        for material in materials[1:]:
            obj.data.materials.append(material)
        obj.data.polygons.foreach_set("material_index", self.material_indices)
        if texture:
            add_uv(obj, self.uvs)
        return obj


def ring(tubes, points, radius, norm):
    path = [Vector(p) for p in points]
    tubes.add(path, [radius]*len(path), [radius]*len(path), [norm]*len(path), sides=8)


def read_surface(key):
    all_verts, faces = [], []
    for line in (SOURCE / "face_topology" / "canonical_face_model.obj").read_text().splitlines():
        if line.startswith("v "):
            all_verts.append([float(x) for x in line.split()[1:]])
        elif line.startswith("f "):
            faces.append(tuple(int(x.split("/")[0])-1 for x in line.split()[1:]))
    canonical = np.array(all_verts)
    # Both a uniform portrait scale and the canonical depth preserve the profile.
    params = {"harry": (1.00,1.04, .001), "hermione": (.94,.95,-.0005), "ron": (.99,1.03,.001)}
    width, depth, nose = params[key]
    verts = np.column_stack((canonical[:,0]*.0102*width, -.036-canonical[:,2]*.01025*depth,
                             CHIN + (canonical[:,1]-canonical[152,1])*.00964))
    verts[:,1] -= nose*np.exp(-((canonical[:,0]/2)**2 + (canonical[:,1]/3)**2))
    photo = TEXTURES / "face_reference.jpg"
    landmarks = TEXTURES / "face_landmarks.json"
    if landmarks.is_file():
        meta = json.loads(landmarks.read_text())
        pts = np.array(meta["faces"][key])[:468, :2]
        eye0, eye1 = (pts[33]+pts[133])/2, (pts[362]+pts[263])/2
        across = (eye1 - eye0) / np.linalg.norm(eye1 - eye0)
        down = np.array([-across[1], across[0]])
        d = pts - pts[152]
        scale = .116 / np.dot(pts[152]-(eye0+eye1)/2, down)
        x1, z1 = (d @ across)*scale, CHIN-(d @ down)*scale
        verts[:,0] = .54 * verts[:,0] + .46 * x1
        verts[:,2] = .54 * verts[:,2] + .46 * z1
        photo_size = (meta["width"],meta["height"])
    else:
        # Registration from hand-picked eyes, lips and chin for fresh source builds.
        # The measured 468-point registration takes precedence when available.
        ref = {"harry": (181,160,317,46), "hermione": (523,166,321,45), "ron": (874,153,319,48)}
        xmid, zeye, zchin, eye_dist = ref[key]
        h = 1040/3
        pts = np.column_stack((xmid + canonical[:,0]*eye_dist/3.18,
                               zchin - (canonical[:,1]+9.403)*(zchin-zeye)/12.04))
        photo_size = (1040,h)
    # Split the photo into per-character tiles for game streaming.
    order = ["harry","hermione","ron"].index(key)
    uv = np.column_stack((pts[:,0]/(photo_size[0]/3)-order, 1-pts[:,1]/photo_size[1]))
    return list(map(Vector, verts)), faces, list(map(tuple,uv)), photo, order


def facial_surface(key, skin):
    front, faces, uvs, photo, order = read_surface(key)
    verts = list(front)
    # Continue the front oval smoothly over the scalp and the underside of the jaw.
    # Top, nape and jaw move by different amounts as the rings approach the occiput.
    center_z = 1.611
    outline_center = [(front[i].x,front[i].z-center_z) for i in OUTLINE]
    ring_prev = list(OUTLINE)
    existing = {tuple(p[i:i+2]) for p in faces for i in (0,1)} | {(p[2],p[0]) for p in faces}
    forward = (OUTLINE[0],OUTLINE[1]) not in existing
    for k, (xscale, zscale, uplift, back) in enumerate([
        (1.015,1.02,.010,.022), (1.02,1.055,.019,.046), (.95,1.045,.021,.064),
        (.82,.91,.022,.079), (.62,.69,.022,.09), (.36,.40,.022,.099), (.12,.14,.023,.104)]):
        current = []
        for i,(x,z) in zip(OUTLINE, outline_center):
            p = front[i]
            high = max(0, min(1, (z+.006)/.070))
            if k < 3:
                back_y = p.y*(1 - (k+1)/4) + back
            else:
                back_y = back + p.y*(.12 if k == 3 else .025)
            # Continue the forehead over the brow before curving toward the back.
            # This keeps the hairline in contact with the skin even at a high part.
            brow=max(0,min(1,(z-.015)/.042))*(max(0,1-(abs(x)/.085)**3))
            frontal_y=p.y + [.001,.010,.028,.058,.094,.141,.170][k]
            frontal_z=center_z+z + [.017,.032,.043,.048,.043,.027,.005][k]
            q=Vector((x*xscale, back_y*(1-brow)+frontal_y*brow,
                      (center_z+z*zscale+uplift*high)*(1-brow)+frontal_z*brow))
            # Keep the new crown underneath the scalp, including its concave part.
            c=Vector((0,.009,1.625))
            d=q-c
            radial=((d.x/.081)**2+(d.y/.101)**2+(d.z/.098)**2)**.5
            if q.z>1.63 and radial>1:
                q=c+d/radial
            verts.append(q)
            # Source skin extends partway around temples, then blends into a constant skin tone.
            uvs.append(uvs[i] if k == 0 else (.003,.003))
            current.append(len(verts)-1)
        for j in range(len(current)):
            n = (j+1) % len(current)
            f = (ring_prev[j],ring_prev[n],current[n],current[j])
            faces.append(f if forward else f[::-1])
        ring_prev = current
    faces.append(tuple(ring_prev if forward else reversed(ring_prev)))
    # Per-face texture images are prepared by the source builder from the RGB plate.
    skin_image = mat(key+"_registered_skin", (1,1,1), .61)
    imgfile = TEXTURES / (key + "_skin.jpg")
    if not imgfile.is_file():
        raise FileNotFoundError("Missing registered face tile: " + str(imgfile))
    tex = skin_image.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(str(imgfile), check_existing=True)
    skin_image.node_tree.links.new(tex.outputs["Color"],skin_image.node_tree.nodes["Principled BSDF"].inputs["Base Color"])
    obj = mesh(key+"_face", verts, faces, skin_image)
    obj.data.materials.append(skin)
    # First two rows hold continuous texture transitions. The ear covers the join.
    for p in obj.data.polygons:
        if p.index >= len(faces) - len(OUTLINE)*6 - 1:
            p.material_index=1
    add_uv(obj,uvs)
    # Subdivide before export for smooth cheeks and jaw at menu portrait distance.
    mod = obj.modifiers.new("Facial curvature", "SUBSURF")
    mod.levels = 2
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return front


def ears(key,skin):
    cartilage = mat(key+"_ear_warmth", tuple(v*m for v,m in zip(SKIN[key],(.92,.75,.72))))
    curves = Tubes()
    for side in [-1,1]:
        s = side
        verts,faces=[],[]
        # An oblique pinna with a raised outer helix, a depressed bowl and a tapered lobe.
        center = Vector((s*.0765,.001,1.609))
        lateral = Vector((s*.82,-.55,0))
        horizontal = Vector((s*.55,.82,0))
        rings = [(0,.003),(.25,.003),(.4,.004),(.57,.005),(.73,.0085),(.84,.0108),
                 (.95,.0092),(1,.005),(.95,.0005),(.80,-.0015),(.15,-.002)]
        seg = 36
        for k,(r,bump) in enumerate(rings):
            for j in range(seg):
                a=2*pi*j/seg
                top=sin(a)
                p=center+horizontal*(cos(a)*r*.015*(.91+.14*top)+top*.0046*r)
                p+=Vector((0,0,top*.026*r))+lateral*bump
                verts.append(p)
            if k:
                for j in range(seg):
                    a=(k-1)*seg+j
                    b=(k-1)*seg+(j+1)%seg
                    face=(a,b,b+seg,a+seg)
                    faces.append(face if s<0 else face[::-1])
        obj=mesh(key+"_ear_" + str(s),verts,faces,skin)
        obj.data.materials.append(cartilage)
        for polygon in obj.data.polygons[:4*seg]:
            polygon.material_index=1
        points=[]
        for j in range(19):
            u=j/18
            points.append(center + horizontal*(.001+.005*sin(u*pi*1.12)) +
                          Vector((0,0,-.010+.024*u))+lateral*(.007+.001*sin(u*pi)))
        curves.add(points,[.0005+.0013*sin(pi*j/18) for j in range(19)],[.001]*19,[lateral]*19)
        sphere(key+"_tragus_"+str(s),center-horizontal*.005+lateral*.0063,(.0025,.003,.0045),skin)
    curves.output(key+"_inner_ear_rims",[skin])


def hair_texture(key):
    rgb = HAIR[key]
    material = mat(key+"_combed_hair", rgb, .80)
    shader=material.node_tree.nodes["Principled BSDF"]
    shader.inputs["Specular IOR Level"].default_value=.14
    material.use_backface_culling=False
    tex = material.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(str(TEXTURES/(key+"_hair.png")),check_existing=True)
    material.node_tree.links.new(tex.outputs["Color"],shader.inputs["Base Color"])
    alpha=material.node_tree.nodes.new("ShaderNodeMath")
    alpha.operation="GREATER_THAN"
    alpha.inputs[1].default_value=.43
    material.node_tree.links.new(tex.outputs["Alpha"],alpha.inputs[0])
    material.node_tree.links.new(alpha.outputs[0],shader.inputs["Alpha"])
    return material


def hairline(key,a):
    front = max(0,cos(a))
    back = max(0,-cos(a))
    if key=="hermione":
        return 1.68 - .77*front**2 + .36*back + .035*sin(a*5)
    if key=="harry":
        return 1.72 - .70*front**2 + .28*back + .10*sin(4*a+.55)*front - .18*exp(-((a+0.45+pi)%(2*pi)-pi)**2/.065)
    return 1.72 - .70*front**2 + .27*back + .105*sin(3*a-.3)*front


def scalp(key,a,theta,offset=0):
    xscale=.083 if key=="hermione" else .086
    dx,dy,dz=sin(a)*sin(theta),-cos(a)*sin(theta),cos(theta)
    normal=Vector((dx/xscale,dy/.105,dz/.103)).normalized()
    # The silhouette is slightly asymmetrical: cropped sides, layered crown and a raised forelock.
    if key=="harry":
        offset+=sin(theta)**.55*(.004+.0046*sin(5*a+1.75*theta)+.0026*sin(9*a-3*theta))
        offset+=.007*exp(-((a+.6+pi)%(2*pi)-pi)**2/.48)*sin(2.2*theta)**2
    if key=="ron":
        offset+=.004*(1+.7*sin(a+theta))*sin(2*theta)**2
    return Vector((dx*xscale, .009+dy*.106,1.625+dz*.101))+normal*offset, normal


def hair(key, rng):
    base = mat(key+"_hair_roots",tuple(v*.72 for v in HAIR[key]),.84)
    base.node_tree.nodes["Principled BSDF"].inputs["Specular IOR Level"].default_value=.12
    strands = hair_texture(key)
    cap_verts,cap_faces,cap_uv=[],[],[]
    crown=mat(key+"_photographic_crown",HAIR[key],.78)
    cs=crown.node_tree.nodes["Principled BSDF"]
    cs.inputs["Specular IOR Level"].default_value=.16
    ct=crown.node_tree.nodes.new("ShaderNodeTexImage")
    ct.image=bpy.data.images.load(str(TEXTURES/(key+"_scalp.jpg")),check_existing=True)
    crown.node_tree.links.new(ct.outputs["Color"],cs.inputs["Base Color"])
    count=72
    for k in range(19):
        for j in range(count):
            a=j*2*pi/count
            atten=max(0,cos(a))
            edge=hairline(key,a)-.015
            if key=="harry": edge+=.045*sin(7*a+.42)*atten
            theta=max(.002,edge*k/18)
            p,n=scalp(key,a,theta)
            cap_uv.append((.5+.486*sin(a)*sin(theta),.96-.83*k/18))
            cap_verts.append(p)
            if k:
                x=(k-1)*count+j
                y=(k-1)*count+(j+1)%count
                cap_faces.append((x,x+count,y+count,y))
    from mathutils.bvhtree import BVHTree
    face=bpy.data.objects.get("Head_"+key+"_face")
    tree=BVHTree.FromPolygons([v.co for v in face.data.vertices],[list(poly.vertices) for poly in face.data.polygons])
    apex=Vector((0,.010,1.62))
    edge_points=list(cap_verts[-count:])
    for j,p in enumerate(edge_points):
        ray=(p-apex).normalized()
        hit=tree.ray_cast(p+ray*.09,-ray,.28)[0]
        inner=hit-ray*.0009 if hit is not None else p-ray*.014
        inner.z-=.001
        cap_verts.append(inner)
        cap_uv.append(cap_uv[18*count+j])
        a=18*count+j
        b=18*count+(j+1)%count
        cap_faces.append((a,a+count,b+count,b))
    add_uv(mesh(key+"_hairline",cap_verts,cap_faces,crown),cap_uv)
    locks=Tubes()
    for layer, number in enumerate([32,46,74]):
        for j in range(number):
            a=(j+rng.uniform(-.40,.40))*2*pi/number
            front=max(0,cos(a))
            t0=.07+layer*.31+rng.uniform(0,.14)
            t1=hairline(key,a)+rng.uniform(-.035,.18)-(.23 if layer==0 else 0)
            if key=="harry":
                t1+=front*(.105*sin(7*a+.6)+.10*sin(3*a+.3)+rng.uniform(-.05,.10))
            if key=="ron":
                t1+=front*(.125+.11*sin(3*a-.75)+rng.uniform(-.045,.09))
            base_width=rng.uniform(.00085,.0021)
            if layer==2:
                base_width*=1.35
            if key=="ron":
                sweep=1.12*front+.20*sin(a)+.24
            elif key=="harry":
                sweep=.46*sin(2*a+.6)+.49*front+.18*sin(5*a)
            else:
                sweep=1.03*sin(a)+.20
            wav=rng.uniform(-.30,.30)
            liftvar=rng.uniform(.0008,.0037) if key=="harry" else rng.uniform(.0004,.0017)
            path,normals,widths,depths=[],[],[],[]
            for k in range(15):
                u=k/14
                aa=a-sweep*(1-u)**1.3+wav*sin(pi*u)
                tt=t0+(t1-t0)*u
                lift=(.00045+(liftvar+layer*.0007)*sin(pi*u)) + .0018*sin(u*pi*2+a)**2
                p,n=scalp(key,aa,tt,lift)
                if key=="harry":
                    p+=n*(.0015*front*sin(pi*u)**2 + (.0009+.003*(.5+.5*sin(a*13)))*u*u)
                dist=.36+.64*sin(pi*(.12+.79*u))**.48
                path.append(p); normals.append(n)
                widths.append(base_width*dist); depths.append((.0005+.0014*dist)*(.5+.5*dist))
            locks.card(path,widths,normals)
    # Fine angular flyaways break the crown and temple silhouette of the tousled cut.
    if key=="harry":
        for j in range(41):
            a=rng.uniform(-pi,pi)
            theta=rng.uniform(.20,max(.26,hairline(key,a)-.31))
            drift=rng.uniform(-.41,.41)
            rise=rng.uniform(.003,.008)
            path=[];normals=[];widths=[]
            for i in range(10):
                u=i/9
                p,n=scalp(key,a+drift*u,theta+.30*u,.001+rise*u**1.8)
                path.append(p);normals.append(n);widths.append(.00075*(1-.70*u))
            locks.card(path,widths,normals)
    if key=="hermione":
        long_hair(key,rng,locks,base)
    locks.output(key+"_groom",[strands],texture=True)


def strands_back(key):
    m=mat(key+"_wavy_fibers",HAIR[key],.83)
    s=m.node_tree.nodes["Principled BSDF"]
    s.inputs["Specular IOR Level"].default_value=.14
    tex=m.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image=bpy.data.images.load(str(TEXTURES/(key+"_scalp.jpg")),check_existing=True)
    m.node_tree.links.new(tex.outputs["Color"],s.inputs["Base Color"])
    return m


def long_hair(key,rng,locks,base):
    # Connected backing and overlapping wavy tresses give the long hair volume from behind.
    def curtain(a,t,phase,amplitude):
        p,n=scalp(key,a,1.31)
        side=sin(a)
        back=max(0,-cos(a))
        wave=amplitude*sin(2*pi*t*1.56+phase)*(sin(pi*min(1,t*1.17))*.65+.35)
        spread=.030*max(0,sin(pi*t))**.8+.016*t
        p.x+=side*(spread+wave)
        p.y+=(-cos(a))*(spread*.56+wave*.65)+.016*t
        p.z-=t*(.242+.04*back)
        return p,n
    start,end=.93,2*pi-.93
    verts,faces=[],[]
    for k in range(16):
        t=k/15
        for j in range(55):
            a=start+(end-start)*j/54
            p,n=curtain(a,t,3*a,.018)
            p-=n*.004
            if k==15:
                p.z+=.015+.009*sin(7*a)**2
            verts.append(p)
            if k and j:
                i=k*55+j
                faces.append((i-56,i-1,i,i-55))
    backing=mesh(key+"_wavy_hair_back",verts,faces,strands_back(key))
    add_uv(backing,[(.04+.92*(j%55)/54,.97-.90*(j//55)/15) for j in range(len(verts))])
    for layer,num in enumerate([44,50]):
        for j in range(num):
            a=start+(end-start)*(j+rng.uniform(-.22,.22))/(num-1)
            phase=3*a+rng.uniform(-.68,.68)
            width=rng.uniform(.0022,.0059)
            length=rng.uniform(.90,1.06)
            path,norms,widths,depths=[],[],[],[]
            for k in range(22):
                u=k/21
                p,n=curtain(a+.11*sin(3*pi*u+phase),u*length,phase,.016+.005*layer)
                n=(n+Vector((.38*sin(4*pi*u+phase),.28*cos(3*pi*u+phase),0))).normalized()
                p+=n*(.0022+layer*.0022)
                profile=max(.035,(1-u**2.3)**.65)
                path.append(p);norms.append(n);widths.append(width*profile);depths.append((.0020+.0011*layer)*profile)
            locks.card(path,widths,norms)


def spectacles(front):
    bronze=mat("harry_aged_wire",(.067,.05,.041),.31,.69)
    bridge=Tubes()
    y=-.1015
    centers = [(front[i] + front[j])/2 for i,j in [(33,133),(263,362)]]
    for side,center in zip([-1,1],centers):
        cx,cz=center.x,center.z
        pts=[]
        for j in range(61):
            a=2*pi*j/60
            x=cos(a)*.024
            pts.append((cx+x,y+.0034*(x*side/.024),cz+sin(a)*.023))
        ring(bridge,pts,.00094,(0,-1,0))
        ring(bridge,[(cx+side*.024,y+.0034,cz+.001),(side*.064,-.091,cz+.0034),
               (side*.076,-.050,cz+.006),(side*.080,-.010,cz+.007),(side*.079,.008,cz-.001)],.00092,(0,0,1))
    mid_z=sum(p.z for p in centers)/2
    a=centers[0].x+.023; b=centers[1].x-.023
    pts=[(a+(b-a)*j/12,y-.0036 - .0007*sin(pi*j/12),mid_z+.0034+.0028*sin(pi*j/12)) for j in range(13)]
    ring(bridge,pts,.00085,(0,-1,0))
    bridge.output("harry_wire_spectacles",[bronze])


def build_head(key):
    if key not in SKIN:
        raise ValueError("Unknown academy character: "+key)
    before=set(bpy.context.scene.objects)
    skin=mat(key+"_skin",SKIN[key],.62)
    face=facial_surface(key,skin)
    ears(key,skin)
    hair(key,random.Random({"harry":7312,"hermione":9193,"ron":4157}[key]))
    if key=="harry":
        spectacles(face)
    return [obj for obj in bpy.context.scene.objects if obj not in before]
