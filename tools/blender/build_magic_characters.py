"""Build the game-ready student characters. Run with Blender in background mode.

    blender -b -P tools/blender/build_magic_characters.py
    blender -b -P tools/blender/build_magic_characters.py -- harry
"""
import json
import math
from pathlib import Path
import struct
import sys

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
sys.path.insert(0, str(HERE))
OUTPUT = HERE.parents[1] / "assets/3d/magic/characters"
TAU = math.tau
V = Vector
HEROES = ("harry", "hermione", "ron")
DEFAULT_WAND = dict(zip(HEROES, ("holly", "vine", "willow")))
SCALE = {"harry": 1.0, "hermione": .966, "ron": 1.055}


def linear(hex_color):
    rgb = bytes.fromhex(hex_color)
    return tuple(c / 3294.6 if c < 11 else ((c / 255 + .055) / 1.055) ** 2.4 for c in rgb)


def material(name, color, rough=.76, metal=0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    color = linear(color) if isinstance(color, str) else tuple(color)
    m.diffuse_color = (*color, 1)
    p = m.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    return m


def interp(a, b, k):
    return a * (1-k) + b * k


def mix_weights(a, b, z, boundary, span):
    w = max(0, min(1, (z - boundary + span) / (2*span)))
    w = w*w*(3-2*w)
    return {a: 1-w, b: w}


def spine(co):
    z = co[2]
    return mix_weights("Hips", "Chest", z, 1.08, .13)


def leg(side):
    def weight(co):
        z = co[2]
        if z > .79:
            return mix_weights("Thigh"+side, "Hips", z, .878, .085)
        if z > .27:
            return mix_weights("Shin"+side, "Thigh"+side, z, .472, .086)
        return mix_weights("Foot"+side, "Shin"+side, z, .117, .047)
    return weight


def arm(side):
    def weight(co):
        return mix_weights("Forearm"+side, "Arm"+side, co[2], ELBOW[side][2], .06)
    return weight


class Geometry:
    """Build one skinned draw group. Smooth normals and bone weights survive glTF export."""
    def __init__(self):
        self.v, self.f, self.mi, self.weight, self.materials = [], [], [], [], []

    def vert(self, co, bind):
        self.v.append(tuple(co))
        self.weight.append(bind(co) if callable(bind) else {bind:1.0})
        return len(self.v)-1

    def face(self, verts, mat):
        if mat not in self.materials:
            self.materials.append(mat)
        self.f.append(verts)
        self.mi.append(self.materials.index(mat))

    def rings(self, rows, mat, bind, close=True, caps=True):
        ids = [[self.vert(p, bind) for p in row] for row in rows]
        n = len(ids[0])
        for row1, row2 in zip(ids, ids[1:]):
            for i in range(n if close else n-1):
                j = (i+1)%n
                indices=(row1[i],row1[j],row2[j],row2[i])
                surface=mat(sum(self.v[v][2] for v in indices)/4) if callable(mat) else mat
                self.face(indices,surface)
        if close and caps:
            self.face(tuple(reversed(ids[0])),mat(self.v[ids[0][0]][2]) if callable(mat) else mat)
            self.face(tuple(ids[-1]),mat(self.v[ids[-1][0]][2]) if callable(mat) else mat)

    def orb(self, center, radii, mat, bind, nu=16, nv=10):
        # Rings avoid coincident pole vertices and degenerate triangles.
        rows = []
        for k in range(nv+1):
            phi = -.5*math.pi + math.pi*(.003+.994*k/nv)
            rows.append([(center[0]+radii[0]*math.cos(phi)*math.sin(TAU*i/nu),
                          center[1]-radii[1]*math.cos(phi)*math.cos(TAU*i/nu),
                          center[2]+radii[2]*math.sin(phi)) for i in range(nu)])
        self.rings(rows, mat, bind)

    def profile(self, data, mat, bind, n=40, ripple=0, opening=None, subset=(0,1), drape=None):
        # data rows run hem-to-collar: height, center x/y, ellipse radii.
        rows=[]
        for k,(z,x,y,rx,ry) in enumerate(data):
            opening_angle=opening[k] if opening else 0
            start=opening_angle+(TAU-2*opening_angle)*subset[0]
            end=opening_angle+(TAU-2*opening_angle)*subset[1]
            open_ring=bool(opening or subset!=(0,1))
            row=[]
            for i in range(n + int(open_ring)):
                a=interp(start,end,i/n)
                wave=ripple*(.6*math.cos(11*a+.8*z)+.33*math.cos(7*a-1.3*z)+.16*math.cos(17*a))
                if drape:
                    wave += drape(z,a)
                row.append((x+(rx+wave)*math.sin(a), y-(ry+wave)*math.cos(a), z))
            rows.append(row)
        self.rings(rows,mat,bind,not open_ring)
        return rows

    def tube(self, points, radii, mat, bind, sides=10):
        pts=[V(p) for p in points]; rows=[]
        reference=V((1,0,0))
        if abs((pts[-1]-pts[0]).normalized().dot(reference))>.85:
            reference=V((0,1,0))
        for i,p in enumerate(pts):
            axis=(pts[min(i+1,len(pts)-1)]-pts[max(0,i-1)]).normalized()
            u=axis.cross(reference).normalized()
            v=axis.cross(u).normalized()
            rows.append([tuple(p+radii[i]*(math.cos(TAU*j/sides)*u+math.sin(TAU*j/sides)*v)) for j in range(sides)])
        self.rings(rows,mat,bind)

    def patch(self, coords, mat, bind):
        # Add front-facing triangular polygons with normals pointing toward the camera.
        ids=[self.vert(p,bind) for p in coords]
        center=sum((V(p) for p in coords), V((0,0,0)))/len(coords)
        ci=self.vert(center,bind)
        normal=(V(coords[1])-V(coords[0])).cross(center-V(coords[0]))
        for i in range(len(ids)):
            a,b=ids[i],ids[(i+1)%len(ids)]
            self.face((a,b,ci) if normal.y<0 else (b,a,ci), mat)

    def finish(self,name,rig):
        mesh=bpy.data.meshes.new(name)
        mesh.from_pydata(self.v,[],self.f)
        mesh.materials.clear()
        for mat in self.materials:
            mesh.materials.append(mat)
        mesh.polygons.foreach_set("material_index",self.mi)
        mesh.polygons.foreach_set("use_smooth",[True]*len(self.f))
        mesh.update()
        ob=bpy.data.objects.new(name,mesh)
        bpy.context.collection.objects.link(ob)
        bind_mesh(ob,rig,self.weight)
        return ob


def bind_mesh(ob,rig,weights):
    groups={}
    for idx,entry in enumerate(weights):
        for name,weight in entry.items():
            if weight<.0001:
                continue
            if name not in groups:
                groups[name]=ob.vertex_groups.new(name=name)
            groups[name].add([idx],weight,"REPLACE")
    mod=ob.modifiers.new("Student skeleton","ARMATURE")
    mod.object=rig
    ob.parent=rig


SHOULDER={"L":(.173,.004,1.375),"R":(-.173,.004,1.375)}
ELBOW={"L":(.227,.008,1.087),"R":(-.244,.034,1.098)}
WRIST={"L":(.246,-.023,.862),"R":(-.265,-.153,.996)}
GRIP=V((-.278,-.197,.958))
WAND_AXIS=V((-.49,-.76,.423)).normalized()


def skeleton():
    ad=bpy.data.armatures.new("StudentSkeleton")
    rig=bpy.data.objects.new("StudentRig",ad)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active=rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    def joint(name,point,parent=None):
        b=ad.edit_bones.new(name)
        b.head=point
        b.tail=V(point)+V((0,.08,0)) # local bone axes coincide with Blender world axes
        if parent:
            b.parent=ad.edit_bones[parent]
    joint("Hips",(0,0,.907))
    joint("Chest",(0,0,1.035),"Hips")
    joint("Head",(0,0,1.49),"Chest")
    for s,side in ((1,"L"),(-1,"R")):
        joint("Arm"+side,SHOULDER[side],"Chest")
        joint("Forearm"+side,ELBOW[side],"Arm"+side)
        joint("Hand"+side,WRIST[side],"Forearm"+side)
        joint("Thigh"+side,(s*.087,0,.883),"Hips")
        joint("Shin"+side,(s*.104,-.006,.47),"Thigh"+side)
        joint("Foot"+side,(s*.112,.006,.121),"Shin"+side)
    bpy.ops.object.mode_set(mode="OBJECT")
    return rig


def palette(hero):
    shades={
        "harry":("253447","516677","3B454C","22384B"),
        "hermione":("895F71","AD8797","726E79","283D54"),
        "ron":("776452","A88969","374653","384957")
    }[hero]
    colors={
        "robe":"232531","edge":"3D3B47","lining":"762F42","liningLight":"A3595D",
        "knit":"4D5057","rib":"40434B","shirt":"E1DDD2","tie":"872E3A",
        "gold":"C89845","trousers":"373C47","pantSeam":"454B56","shoe":"302828",
        "welt":"504138","sole":"232226","lace":"69554B","ivory":"E8DEBE","hood":"3A3540",
        "coat":shades[0],"trim":shades[1],"tee":shades[2],"denim":shades[3],"denimSeam":"71808A",
    }
    mats={k:material("Fabric_"+k,v) for k,v in colors.items()}
    mats["skin"]=material("Skin_hands", {"harry":(.56,.325,.255),"hermione":(.59,.33,.245),"ron":(.60,.355,.287)}[hero],.56)
    mats["nail"]=material("Nails",{"harry":"C8937C","hermione":"D29A88","ron":"DBA694"}[hero],.49)
    mats["brass"]=material("Antique_brass","AB8250",.43,.58)
    mats["badge"]=material("Heraldic_thread","C3A45E",.62,.12)
    mats["holly"]=material("Holly_dark_honey","75523A",.46)
    mats["vine"]=material("Vine_caramel","98694B",.47)
    mats["willow"]=material("Willow_walnut","5E4337",.54)
    return mats


def armsleeves(g,m,material,cuff,variant):
    for sign,side in ((1,"L"),(-1,"R")):
        el,wr=V(ELBOW[side]),V(WRIST[side])
        top=V((sign*.172,.005,1.356))
        size={"robe":1.15,"travel":1.03,"uniform":.97}[variant]
        # Cross sections follow the bent forearm, including the back of its elbow.
        # Above the deltoid the sleeve cap tapers inward into the shoulder seam.
        sections=[(.00,.043,.043),(.035,.045,.044),(.075,.045,.045),(.13,.044,.044),
                  (.21,.049,.048),(.30,.054,.053),(.38,.055,.056),(.43,.057,.056),
                  (.465,.054,.055),(.49,.055,.055),(.505,.060,.059),(.525,.058,.058),
                  (.546,.061,.061),(.565,.059,.060),(.61,.060,.063),(.68,.062,.063),
                  (.76,.064,.067),(.84,.065,.068),(.90,.062,.066),(.96,.057,.060),
                  (1.0,.050,.054)]
        rings=[]
        for t,rx,ry in sections:
            center=wr.lerp(el,2*t) if t<=.5 else el.lerp(top,2*t-1)
            if variant=="robe" and t<.36:
                rx+=(.36-t)*.073; ry+=(.36-t)*.067
            direction=(el-wr).normalized().lerp((top-el).normalized(),max(0,min(1,(t-.41)/.18))).normalized()
            u=V((1,0,0)); u=(u-direction*u.dot(direction)).normalized(); v=direction.cross(u)
            row=[]
            for i in range(36):
                a=TAU*i/36
                longitudinal=(.0023+.001*(1-t))*math.cos(7*a+t*3.4)
                elbow_eff=math.exp(-((t-.51)/.115)**2)
                pinch=.0040*math.sin(66*t+2*math.cos(a)+.6*math.sin(3*a))*elbow_eff
                rr=longitudinal+pinch
                edge=.0030*math.sin(3*a+.9)*(1-t)**12
                row.append(tuple(center+(rx*size+rr)*math.sin(a)*u-(ry*size+rr)*math.cos(a)*v+direction*edge))
            rings.append(row)
        for z,x,rx,ry in [(1.368,.167,.044,.047),(1.377,.156,.039,.039),
                          (1.383,.143,.030,.029),(1.386,.129,.017,.017),(1.385,.122,.004,.007)]:
            rings.append([(sign*x+rx*math.sin(TAU*i/36),.006-ry*math.cos(TAU*i/36),z) for i in range(36)])
        g.rings(rings,material,arm(side),caps=False)
        edge_dir=(el-wr).normalized()
        folded=[[wr+(V(p)-wr)*factor+edge_dir*d for p in rings[0]]
                for factor,d in ((1,0),(.982,.001),(.954,.004),(.932,.014))]
        g.rings(folded,cuff,arm(side),caps=False)
        # A sewn cuff follows the actual open sleeve edge.
        ring=rings[0]
        g.tube(ring+[ring[0]],[.0018]*37,cuff,arm(side),7)
        if variant!="robe":
            sub=[]
            for k in range(3):
                row=[]
                for i in range(36):
                    p=V(rings[0][i]).lerp(V(rings[2][i]),k*.46)
                    outward=V(rings[0][i])-wr
                    row.append(p+outward*.022)
                sub.append(row)
            g.rings(sub,cuff,arm(side),caps=False)


def footwear(g,m,hero):
    for s,side in ((1,"L"),(-1,"R")):
        x=s*.109
        # Shaped leather uppers taper into a narrow heel with an almond toe.
        for mat,rows in ((m["sole"],[(.013,-.041,.059,.031,.169,.075),(.026,-.042,.060,.032,.171,.076)]),
                       (m["welt"],[(.024,-.042,.060,.032,.170,.076),(.032,-.042,.060,.032,.169,.076)]),
                       (m["shoe"],[(.028,-.042,.058,.032,.167,.075),(.042,-.038,.058,.032,.164,.075),
                           (.058,-.031,.055,.032,.158,.073),(.072,-.020,.050,.031,.134,.071),
                           (.091,-.008,.045,.031,.096,.067),(.113,0,.042,.031,.070,.064),
                           (.139,.004,.044,.032,.062,.061)])):
            forms=[]
            for z,cy,wa,wh,front,back in rows:
                row=[]
                for j in range(32):
                    t=TAU*j/32; c=math.cos(t)
                    # Radius split by heel/toe and tapered rear quarter.
                    rx=wh+(wa-wh)*(.5+.5*c)
                    row.append((x+rx*math.sin(t),cy-(front if c>0 else back)*c,z))
                forms.append(row)
            g.rings(forms,mat,"Foot"+side)
        for j in range(4):
            z=.090+.007*j; y=-.101+.011*j
            for tilt in (-1,1):
                g.tube([(x-.022,y,z-.003*tilt),(x,y-.004,z+.003),(x+.022,y,z+.003*tilt)],[.0017]*3,m["lace"],"Foot"+side,6)


def hands_and_neck(g,m):
    g.profile([(1.390,0,.009,.081,.061),(1.419,0,.008,.068,.056),
               (1.442,0,.010,.055,.051),(1.460,0,.014,.046,.046),
               (1.478,0,.017,.043,.041),(1.497,0,.020,.046,.043),
               (1.519,0,.024,.052,.048),(1.546,0,.025,.054,.050)],m["skin"],"Head",n=40)
    for side in ("L","R"):
        p=V(WRIST[side])
        bind="Hand"+side
        if side=="L":
            g.profile([(.767,.246,-.020,.019,.023),(.783,.249,-.023,.024,.038),
                       (.807,.246,-.024,.025,.044),(.833,.246,-.024,.025,.043),
                       (.854,.246,-.023,.024,.035),(.881,p.x,p.y,.026,.030)],
                      m["skin"],bind,n=25)
            for i,(dy,length) in enumerate(((-.029,.068),(-.011,.074),(.008,.067),(.026,.052))):
                start=V((.246,-.021+dy,.792))
                pts=[start,start+V((.003,0,-length*.28)),
                     start+V((-.001,.0006,-length*.57)),start+V((-.008,.002,-length*.84)),
                     start+V((-.014,.003,-length))]
                r=.0094 if i<3 else .0077
                g.tube(pts,[r,r,r*.80,r*.78,r*.37],m["skin"],bind)
                tip=pts[-2].lerp(pts[-1],.68)
                g.orb((tip.x+.004,tip.y,tip.z),(.0025,r*.59,.005),m["nail"],bind,9,5)
            g.tube([(.246,-.046,.833),(.236,-.061,.814),(.226,-.065,.792),(.222,-.059,.774)],
                   [.014,.013,.010,.006],m["skin"],bind,12)
        else:
            g.profile([(.931,-.27,-.184,.020,.029),(.946,-.273,-.184,.024,.038),
                       (.971,-.273,-.178,.026,.042),(.991,-.266,-.161,.027,.034),
                       (1.008,p.x,p.y,.025,.03)],m["skin"],bind,n=27)
            across=V((0,.49,.872))
            for i in range(4):
                base=GRIP+across*((1.5-i)*.0147)
                pts=[base+V((.003,.022,-.001)),base+V((-.012,.010,-.004)),
                     base+V((-.016,-.005,-.003)),base+V((-.008,-.015,.001)),base+V((.004,-.013,.005))]
                r=.0093 if i<3 else .0081
                g.tube(pts,[r,r,r*.91,r*.86,r*.6],m["skin"],bind)
            g.tube([(-.249,-.173,.977),(-.251,-.196,.987),(-.260,-.211,.981),(-.277,-.217,.970)],
                   [.014,.012,.0105,.006],m["skin"],bind,12)


def trousers(g,m,hero,variant):
    is_skirt=hero=="hermione" and variant!="travel"
    fabric=m["denim"] if variant=="travel" else m["trousers"]
    # Each leg becomes one half of the pelvis. The inside seam opens exactly
    # at the crotch, joining the left and right panels along the front/back rise.
    lower=[(.115,.109,.006,.046,.060),(.125,.110,.006,.054,.065),
           (.143,.109,.007,.054,.063),(.158,.109,.008,.050,.062),(.178,.109,.009,.047,.059),
           (.218,.109,.012,.051,.059),(.297,.107,.012,.059,.064),(.363,.106,.008,.056,.061),
           (.405,.105,.005,.052,.058),(.433,.104,0,.050,.057),(.452,.104,-.004,.054,.060),
           (.476,.103,-.006,.056,.061),(.495,.102,-.006,.060,.066),(.523,.101,-.004,.064,.069),
           (.56,.099,-.001,.066,.073),(.632,.094,0,.074,.083),(.703,.086,.002,.079,.091),
           (.744,.083,.003,.082,.094),(.766,.083,.004,.083,.096)]
    upper=[(.784,.17,.102,.20),(.806,.17,.105,.45),(.831,.172,.109,.70),
           (.865,.173,.111,.92),(.902,.170,.112,1.0),(.940,.163,.107,1.0),(.979,.151,.098,1.0)]
    for sign,side in ((1,"L"),(-1,"R")):
        n=36
        rows=[]; outside=[]
        for z,cx,cy,rx,ry in lower:
            if is_skirt and z>.71:
                break
            if is_skirt:
                rx*=.81; ry*=.83
            row=[]
            for j in range(n+1):
                a=TAU*j/n
                ankle=math.exp(-((z-.15)/.046)**2); knee=math.exp(-((z-.472)/.077)**2)
                fold=(.0035*math.sin(90*z+1.9*math.cos(a))*knee+.0028*math.sin(100*z+2*math.sin(a))*ankle)
                if is_skirt: fold*=.1
                row.append((sign*(cx-(rx+fold)*math.cos(a)),cy-(ry+fold)*math.sin(a),z))
            rows.append(row)
            outside.append(row[n//2])
        # At the top the two panels form a single natural trouser surface.
        for z,rx,ry,t in ([] if is_skirt else upper):
            row=[]
            for j in range(n+1):
                a=TAU*j/n
                startx=.083*(1-math.cos(a)); starty=.004-.096*math.sin(a)
                x=interp(startx,rx*math.sin(a/2),t)
                y=interp(starty,.004-ry*math.cos(a/2),t)
                row.append((sign*x,y,z))
            rows.append(row)
            outside.append(row[n//2])
        if sign<0:
            rows=[r[::-1] for r in rows]
        g.rings(rows,fabric,leg(side),close=False)
        if not is_skirt:
            g.tube(outside[2:-1],[.0010]*len(outside[2:-1]),m["denimSeam" if variant=="travel" else "pantSeam"],leg(side),6)
    if is_skirt:
        pleats=[(.61,.219,.145,.012),(.616,.218,.145,.012),(.687,.210,.137,.010),
                (.82,.184,.119,.005),(.897,.159,.101,.001),(.955,.145,.094,0),(.978,.142,.092,0)]
        rows=[]
        for z,rx,ry,amplitude in pleats:
            row=[]
            for j in range(96):
                a=TAU*j/96
                fold=amplitude*(1 if j%6 in (2,3,4) else -.7)
                row.append(((rx+fold)*math.sin(a),-(ry+fold)*math.cos(a),z))
            rows.append(row)
        g.rings(rows,fabric,"Hips")


BODY=[(.937,.155,.107),(.947,.160,.111),(.958,.164,.112),(.977,.164,.113),(.993,.161,.111),
      (1.022,.151,.108),(1.061,.144,.105),(1.126,.153,.11),(1.212,.167,.12),
      (1.29,.18,.117),(1.347,.18,.099),(1.378,.166,.084),(1.400,.129,.074),(1.416,.082,.061),(1.423,.054,.051)]


def torso_rows(hero,extra=0,levels=()):
    data=sorted(BODY)
    zs=sorted(set([z for z,rx,ry in data]+list(levels)+[.936+i*.014 for i in range(35)]))
    def sample(z):
        for a,b in zip(data,data[1:]):
            if z<=b[0]:
                t=max(0,(z-a[0])/(b[0]-a[0]))
                return interp(a[1],b[1],t),interp(a[2],b[2],t)
        return data[-1][1:]
    rows=[]
    for z in zs:
        rx,ry=sample(z)
        rows.append((z,0,.007,rx*(.955 if hero=="hermione" else 1)+extra,ry+extra))
    return rows


def knit_fold(z,a):
    belly=math.exp(-((z-1.03)/.061)**2)
    side=abs(math.sin(a))**1.65
    return (.0033*math.sin(89*z+2.7*math.sin(a)+1.1*math.cos(2*a))*belly+
            .0028*math.sin(64*z+3.5*math.sin(a))*side*math.exp(-((z-1.255)/.105)**2))


def crest(g,m,x,z,y):
    # A hand-stitched shield with a small rampant animal in gold thread.
    def plate(shape,mat,offset):
        g.patch([(x+dx,y+offset+abs(dx)*.13,z+dz) for dx,dz in shape],mat,spine)
    outline=[(-.022,.026),(.020,.026),(.021,.005),(.017,-.011),(.009,-.018),(0,-.027),(-.012,-.019),(-.020,-.010)]
    plate(outline,m["badge"],0)
    plate([(a*.81,b*.83) for a,b in outline],m["tie"],-.001)
    lion=[(-.010,-.014),(-.004,-.003),(-.009,.006),(-.012,.014),(-.008,.017),
          (-.011,.018),(-.013,.014),(-.012,.008),(-.015,.006),(-.015,.016),
          (-.010,.021),(-.006,.018),(-.004,.007),(.001,.006),(.001,.013),
          (-.001,.016),(.005,.020),(.009,.018),(.013,.015),(.009,.013),
          (.007,.010),(.009,.006),(.013,.008),(.014,.012),(.017,.012),
          (.016,.004),(.008,.001),(.004,-.003),(.007,-.009),(.009,-.010),(.011,-.014),
          (.003,-.012),(-.001,-.006),(-.006,-.011),(-.005,-.015),(-.013,-.015)]
    plate([(a*.85,b*.85) for a,b in lion],m["ivory"],-.0022)


def school_top(g,m,hero):
    hems=(.932,.940,.945,.950,.953,.956,.970)
    def knit_color(z):
        if .945<=z<.950: return m["tie"]
        if .953<=z<.956: return m["gold"]
        return m["rib" if z<.970 else "knit"]
    g.profile(torso_rows(hero,levels=hems),knit_color,spine,n=52,ripple=.0015,drape=knit_fold)
    # A curved standing collar frames the nape. Lower at the front and sharply
    # tapered into the fold-down points, following the trapezius and neck.
    collar=[]
    for z,rx,ry,bias in [(1.393,.090,.078,.0),(1.423,.072,.063,.004),
                          (1.450,.057,.055,.009),(1.469,.050,.051,.014)]:
        collar.append([(rx*math.sin(TAU*i/48),.012-ry*math.cos(TAU*i/48),
                        z-bias*math.cos(TAU*i/48)) for i in range(48)])
    g.rings(collar,m["shirt"],spine)
    bib=[(-.072,-.060,1.428),(-.058,-.088,1.387),(0,-.119,1.275),
         (.058,-.088,1.387),(.072,-.060,1.428),(0,-.060,1.426)]
    # Position cloth appliques just outside the curved sweater at each height.
    for i,(x,y,z) in enumerate(bib):
        if 1.3<z<1.40:
            bib[i]=(x,-.094,z)
    g.patch(bib,m["shirt"],spine)
    for s in (-1,1):
        coords=[(s*x,y,z) for x,y,z in [(.041,-.038,1.460),(.075,-.058,1.429),(.059,-.092,1.383),(.018,-.083,1.413),(.006,-.070,1.428)]]
        g.patch(coords,m["shirt"],spine)
        pts=[(s*.077,-.062,1.424),(s*.069,-.087,1.389),(s*.04,-.108,1.338),(0,-.122,1.275)]
        g.tube(pts,[.006,.006,.005,.005],m["rib"],spine,9)
        g.tube([(x,y-.002,z+.0015) for x,y,z in pts],[.00145]*4,m["gold"],spine,7)
    g.patch([(-.012,-.086,1.411),(.012,-.086,1.411),(.009,-.094,1.392),(-.008,-.094,1.392)],m["tie"],spine)
    def ty(z):
        return -.095 - (1.392-z)*.265
    g.patch([(-.007,ty(1.397),1.397),(.007,ty(1.397),1.397),(.012,ty(1.313),1.313),
             (.002,ty(1.288),1.288),(-.010,ty(1.309),1.309)],m["tie"],spine)
    for z in (1.322,1.344,1.367,1.383):
        coords=[(-.009,z-.005),(.009,z+.003),(.009,z+.006),(-.009,z-.002)]
        g.patch([(x,ty(zz)-.0013,zz) for x,zz in coords],m["gold"],spine)
    armsleeves(g,m,m["knit"],m["rib"],"uniform")


def robe(g,m,hero):
    # The open overgown includes a real lining in the turned-back facing.
    dims=[(.395,.289,.189,.94),(.400,.29,.191,.94),(.442,.284,.186,.91),
          (.56,.263,.173,.87),(.70,.241,.160,.78),(.85,.218,.152,.72),
          (1.0,.189,.141,.67),(1.146,.186,.145,.64),(1.268,.201,.154,.65),
          (1.351,.204,.132,.68),(1.390,.18,.104,.68),(1.422,.122,.085,.64),
          (1.454,.078,.065,.62)]
    rows=[(z,0,.015,x,y) for z,x,y,o in dims]
    opened=[d[-1] for d in dims]
    def cloth(co):
        x,y,z=co
        if z<.90:
            side="L" if x>0 else "R"
            w=min(.53,max(0,(.92-z)*1.04)) * min(1,.5+abs(x)*2.3)
            return {"Hips":1-w,"Thigh"+side:w}
        return spine(co)
    g.profile(rows,m["robe"],cloth,n=74,opening=opened,ripple=.004)
    # Narrow side facing fans out into broad velvet lapels at chest height.
    for sign in (1,-1):
        front=[]
        for i,(z,xx,yy,a) in enumerate(dims):
            a+=.01
            span=.058+max(0,1-abs(z-1.32)/.18)*.25
            rr=[]
            for k in range(5):
                ang=sign*(a+span*k/4)
                wave=.004*(.6*math.cos(11*ang+.8*z)+.33*math.cos(7*ang-1.3*z)+.16*math.cos(17*ang))
                rr.append(((xx+wave+.002)*math.sin(ang),.015-(yy+wave+.003)*math.cos(ang),z))
            front.append(rr if sign==1 else list(reversed(rr)))
        g.rings(front,m["lining"],cloth,close=False)
        edge=[row[0 if sign==1 else -1] for row in front]
        g.tube(edge,[.0021]*len(edge),m["edge"],cloth,7)
    # Actual draped hood with structured shoulder yoke and overlapping pointed back.
    outer=[]
    for k in range(8):
        t=k/7
        row=[]
        for i in range(37):
            a=interp(-math.pi*.59,math.pi*.59,i/36)
            sag=(math.cos(a)+.28)/1.28
            xx=(.090+.086*t)*math.sin(a)
            yy=.012+(.073+.062*t)*math.cos(a)
            zz=1.466-.091*t-.187*t*t*max(0,sag)**4-.018*(1-sag)
            row.append((xx,yy,zz))
        outer.append(row)
    g.rings(outer,m["hood"],spine,False)
    g.tube(outer[-1],[.0035]*37,m["edge"],spine,8)
    g.tube(outer[0],[.0055]*37,m["lining"],spine,8)
    armsleeves(g,m,m["robe"],m["edge"],"robe")
    crest(g,m,.137,1.312,-.101)


def travel(g,m,hero):
    # A pink open cardigan, blue canvas jacket and horizontal-striped pullover.
    rows=torso_rows(hero,.0008)
    g.profile(rows,m["tee"],spine,n=40)
    neck=[]
    for z,rx,ry,k in ((1.404,.072,.062,.021),(1.423,.076,.074,.024),
                        (1.442,.072,.077,.025),(1.451,.067,.074,.025),
                        (1.453,.065,.072,.025),(1.452,.063,.070,.025)):
        neck.append([(rx*math.sin(TAU*i/42),.011-ry*math.cos(TAU*i/42),z-k*math.cos(TAU*i/42)) for i in range(42)])
    g.rings(neck,m["rib"],spine,caps=False)
    if hero=="ron":
        stripes=[(1.025,1.049),(1.105,1.133),(1.204,1.247),(1.287,1.303),(1.334,1.341)]
        def stripe(z):
            return m["trim" if any(lo<=z<hi for lo,hi in stripes) else "coat"]
        g.profile(torso_rows(hero,.006,[h for band in stripes for h in band]),stripe,spine,n=52,ripple=.0012,drape=knit_fold)
        armsleeves(g,m,m["coat"],m["trim"],"travel")
        return
    is_cardigan=hero=="hermione"
    if is_cardigan:
        for low,rx,ry in ((1.1,.151,.111),(1.145,.158,.115),(1.19,.166,.122),(1.24,.176,.123),(1.29,.181,.118),(1.33,.18,.107)):
            g.profile([(low,0,.007,rx,ry),(low+.004,0,.007,rx,ry)],m["ivory"],spine,n=36)
    rows=torso_rows(hero,.008)
    opened=[.32+.22*(z-1) if z<1.34 else .46 for z,*_ in rows]
    coat=g.profile(rows,m["coat"],spine,n=52,opening=opened,ripple=.0013)
    for s in (-1,1):
        idx=0 if s==1 else -1
        pts=[r[idx] for r in coat]
        g.tube(pts,[.0050 if is_cardigan else .0027]*len(pts),m["trim" if is_cardigan else "brass"],spine,8)
        if not is_cardigan:
            g.patch([(s*.045,-.067,1.428),(s*.103,-.058,1.404),(s*.079,-.102,1.347),(s*.058,-.095,1.37)],
                    m["trim"],spine)
        g.tube([(s*.124,-.082,1.125),(s*.114,-.088,1.104),(s*.093,-.094,1.068)],
               [.0028]*3,m["trim"],spine,8)
    armsleeves(g,m,m["coat"],m["trim"],"travel")


def wand(g,m,kind):
    # The pivot stays in the grip so all combinations align across both clips.
    side=WAND_AXIS.cross(V((0,0,1))).normalized()
    up=WAND_AXIS.cross(side).normalized()
    lengths={"holly":.280,"vine":.285,"willow":.356}
    length=lengths[kind]
    grip={"holly":.086,"vine":.080,"willow":.100}[kind]
    def axis(t):
        bend={"holly":.0036,"vine":.007,"willow":.006}[kind]
        return GRIP + WAND_AXIS*t + side*(math.sin(t*24)*bend) + up*(.008*t/length)
    segments=[(-.050,.007),(-.047,.0120),(-.042,.0124),(-.037,.0107),
              (.001,.0098),(grip-.026,.0092),(grip-.022,.010),(grip-.018,.0094),
              (grip-.012,.0088),(grip-.009,.007),(grip,.0058),
              (length*.46,.0049),(length*.69,.0036),(length*.89,.0024),(length,.0018),(length+.002,.0008)]
    g.tube([axis(t) for t,r in segments],[r for t,r in segments],m[kind],"HandR",14)
    if kind=="vine":
        for branch in (0,2.55):
            coords=[]; radii=[]
            for i in range(53):
                u=i/52
                a=branch+u*math.pi*6.4
                r=.0097*(1-.72*u)
                t=-.044+.205*u
                coords.append(axis(t)+(math.cos(a)*up+math.sin(a)*side)*r)
                radii.append(.0023*(1-.87*u))
            g.tube(coords,radii,m["holly"],"HandR",7)
        for k in range(5):
            t=.035+k*.018
            p=axis(t)
            sg=1 if k%2 else -1
            g.tube([p+up*.005,p+up*.010+side*sg*.006,p+WAND_AXIS*.015+up*.008],
                   [.0014,.0027,.0007],m["vine"],"HandR",7)
    else:
        for j in range(6 if kind=="willow" else 4):
            t=-.038+.014*j
            g.tube([axis(t-.0017),axis(t),axis(t+.0017)],[.010,.0108,.0103],
                   m["holly" if kind=="willow" else "willow"],"HandR",12)


def animate_rig(rig):
    anim=rig.animation_data_create()
    bpy.context.scene.render.fps=24
    for label,end in (("Idle",72),("Walk",24)):
        action=bpy.data.actions.new(label)
        anim.action=action
        for f in range(0,end+1,3):
            phase=f/end*TAU
            sn,cs=math.sin(phase),math.cos(phase)
            doubles=math.sin(2*phase)
            hips=rig.pose.bones["Hips"]
            hips.location=(.003*sn,0,.002*cs) if label=="Idle" else (.009*sn,0,.010*(1-math.cos(2*phase)))
            hips.keyframe_insert(data_path="location",frame=f)
            rot={"Hips":(0,0,.007*sn),"Chest":(.012*sn,.005*cs,0),
                 "Head":(-.010*sn,.012*cs,.018*sn)}
            for sign,s in ((1,"L"),(-1,"R")):
                if label=="Idle":
                    rot["Arm"+s]=(.014*sn,sign*.009*cs,0)
                    rot["Forearm"+s]=(-.007*sn,0,0)
                    rot["Hand"+s]=(.007*sn,0,0)
                    rot["Thigh"+s]=(0,0,0)
                    rot["Shin"+s]=(0,0,0)
                    rot["Foot"+s]=(0,0,0)
                else:
                    step=sn*sign
                    knee=.06+.36*((1-step)*.5)**2
                    rot.update({"Hips":(.015,.022*cs,.044*sn),"Chest":(.021,-.016*cs,-.068*sn),
                                "Head":(-.016*doubles,-.008*cs,.029*sn)})
                    rot["Thigh"+s]=(.39*step-.055,0,0)
                    rot["Shin"+s]=(knee,0,0)
                    rot["Foot"+s]=(-knee*.69-.12*step,0,0)
                    rot["Arm"+s]=(-step*(.22 if s=="R" else .30),sign*.018*cs,0)
                    rot["Forearm"+s]=(-.04-.052*step,0,0)
                    rot["Hand"+s]=(.018*step,0,0)
            for name,angles in rot.items():
                bone=rig.pose.bones[name]
                bone.rotation_mode="XYZ"
                bone.rotation_euler=angles
                bone.keyframe_insert(data_path="rotation_euler",frame=f)
        # Non-overlapping stashed tracks retain clip identities in the glTF.
        track=anim.nla_tracks.new()
        track.name=label
        track.strips.new(label,0,action)
        track.mute=True
        anim.action=None
    for bone in rig.pose.bones:
        bone.location=(0,0,0)
        bone.rotation_euler=(0,0,0)


def prepare_defaults(path,hero):
    """Ordinary GLB viewers show the default costume; game visibility selects all variants.

    Transparent MASK copies retain the real base colour and shading. A game can enable
    them by setting opacity to one before applying its outfit and wand visibility.
    """
    data=path.read_bytes()
    n=struct.unpack_from("<I",data,12)[0]
    doc=json.loads(data[20:20+n])
    cache={}
    default={"Outfit_robe","Wand_"+DEFAULT_WAND[hero]}
    names={node["name"] for node in doc["nodes"] if "name" in node}
    required={"Outfit_robe","Outfit_uniform","Outfit_travel","Wand_holly","Wand_vine","Wand_willow"}
    assert required.issubset(names),required-names
    assert {a["name"] for a in doc["animations"]}=={"Idle","Walk"},[(a["name"]) for a in doc["animations"]]
    assert len(doc["skins"])>=1
    for node in doc["nodes"]:
        name=node.get("name","")
        if name in required-default:
            mesh=doc["meshes"][node["mesh"]]
            for part in mesh["primitives"]:
                idx=part["material"]
                if idx not in cache:
                    copy=json.loads(json.dumps(doc["materials"][idx]))
                    copy["name"]="Optional_"+copy["name"]
                    copy["alphaMode"]="MASK"
                    copy["alphaCutoff"]=.5
                    pbr=copy.setdefault("pbrMetallicRoughness",{})
                    pbr.setdefault("baseColorFactor",[1,1,1,1])[3]=0
                    cache[idx]=len(doc["materials"])
                    doc["materials"].append(copy)
                part["material"]=cache[idx]
    # The exporter repeats joints/weights/positions for each small material region.
    # All materials remain embedded. No decoder or external resource is required.
    doc["asset"]["copyright"]="Original character artwork, costumes and animations for Magic Academy. Face topology adapted from MediaPipe, Copyright Google LLC, Apache License 2.0. See tools/blender/face_topology/LICENSE."
    out=json.dumps(doc,ensure_ascii=False,separators=(",",":")).encode()
    out+=b" "*((-len(out))%4)
    tail=data[20+n:]
    blob=struct.pack("<4sIIII",b"glTF",2,20+len(out)+len(tail),len(out),0x4e4f534a)+out+tail
    path.write_bytes(blob)
    return len(blob),sum(doc["accessors"][p["indices"]]["count"]//3 for mesh in doc["meshes"] for p in mesh["primitives"])


def build(hero):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rig=skeleton()
    mats=palette(hero)
    body=Geometry()
    hands_and_neck(body,mats)
    footwear(body,mats,hero)
    body.finish("Hands_Neck_and_Shoes",rig)
    from magic_character_heads import build_head
    before=set(bpy.context.scene.objects)
    build_head(hero)
    face_objects=[ob for ob in bpy.context.scene.objects if ob not in before and ob.type in {"MESH","CURVE"}]
    assert face_objects, "Head builder produced no visible geometry"
    bpy.ops.object.select_all(action="DESELECT")
    for ob in face_objects:
        ob.select_set(True)
    bpy.context.view_layer.objects.active=face_objects[0]
    bpy.ops.object.convert(target="MESH")
    bpy.ops.object.join()
    head=bpy.context.object
    head.name="Portrait"
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    group=head.vertex_groups.new(name="Head")
    group.add(list(range(len(head.data.vertices))),1,"REPLACE")
    mod=head.modifiers.new("Follow head","ARMATURE")
    mod.object=rig
    head.parent=rig
    for outfit in ("robe","uniform","travel"):
        garment=Geometry()
        trousers(garment,mats,hero,outfit)
        if outfit in ("robe","uniform"):
            school_top(garment,mats,hero)
            if outfit=="robe":
                robe(garment,mats,hero)
        else:
            travel(garment,mats,hero)
        garment.finish("Outfit_"+outfit,rig)
    for wood in ("holly","vine","willow"):
        accessory=Geometry()
        wand(accessory,mats,wood)
        accessory.finish("Wand_"+wood,rig)
    from magic_character_cloth import dress_surfaces
    dress_surfaces()
    animate_rig(rig)
    rig.scale=(SCALE[hero],)*3
    bpy.context.scene.frame_set(0)
    path=OUTPUT / (hero+".glb")
    path.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(path),export_format="GLB",export_materials="EXPORT",
                              export_animations=True,export_animation_mode="ACTIONS",export_merge_animation="ACTION",
                              export_apply=False,export_cameras=False,export_lights=False,
                              export_yup=True,export_force_sampling=True,export_frame_step=2,
                              export_def_bones=True,export_anim_single_armature=True)
    size,tris=prepare_defaults(path,hero)
    print(f"{hero}: {path}, {size:,} bytes, {tris:,} triangles (all wardrobe options)",flush=True)


if __name__=="__main__":
    args=sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
    for selected in [h for h in HEROES if h in args] or HEROES:
        build(selected)
