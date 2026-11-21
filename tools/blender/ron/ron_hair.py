"""Scalp-anchored copper short cut with clustered swept waves, undercut wisps and spring."""
from io import BytesIO
from PIL import Image
import numpy as np
from geometry import Threads, unit
TAU=2*np.pi
TARGETS=('CopperLeft','CopperRight','ForelockRecoil')

def line_at(a):
    front=np.maximum(0,np.cos(a));back=np.maximum(0,-np.cos(a))
    peak=.092*np.exp(-((a+.10)/.25)**2)
    return 1.72-.73*front**2+.27*back+.060*np.sin(3*a-.35)*front+peak*front

def scalp(a,t,offset=0):
    a,t=np.broadcast_arrays(a,t);dx=np.sin(a)*np.sin(t);dy=np.cos(t);dz=np.cos(a)*np.sin(t)
    radial=unit(np.stack([dx/.086,dy/.103,dz/.105],-1))
    lift=.004*(1+.7*np.sin(a+t))*np.sin(2*t)**2
    return np.stack([dx*.086,1.615+dy*.101,-.009+dz*.106],-1)+radial*(lift+offset)[...,None],radial

def fibre_material(b,name,linear_color,seed):
    # Each raised section has many pigmented filaments across its outer face.
    # The colour atlas is continuous around its circumference and through mipmaps.
    w,h=288,256
    v,u=np.mgrid[:h,:w];u=u/w;v=v/h
    rng=np.random.default_rng(seed)
    drift=.008*np.sin(v*7.1+seed)+.004*np.sin(v*12.7)
    pigment=np.zeros_like(u)
    for speed,gain in [(6,.090),(13,.105),(19,.071),(33,.049),(47,.036)]:
        pigment+=gain*np.sin(TAU*speed*(u+drift)+rng.uniform(0,TAU)+.5*np.sin(3.0*v+speed))
    pigment+=rng.normal(0,.022,u.shape)
    tex_linear=np.array(linear_color)[None,None,:]*np.maximum(.35,1+pigment[:,:,None])
    srgb=np.clip(1.055*tex_linear**(1/2.4)-.055,0,1)
    data=BytesIO();Image.fromarray(np.uint8(255*srgb+.5)).save(data,'JPEG',quality=94,subsampling=0)
    image=b.append('images',dict(name=name,bufferView=b.view(data.getvalue()),mimeType='image/jpeg'))
    tex=b.append('textures',dict(source=image));mat=b.mat(name,(1,1,1),.82)
    material=b.doc['materials'][mat];material['pbrMetallicRoughness']['baseColorTexture']=dict(index=tex)
    return mat

def animate(b,idx):
    for name,clip in b.a.actions.items():
        dur=max(float(b.a.acc(s['input'])[-1,0]) for s in clip['samplers'])
        n=max(3,round(dur*24));f=np.linspace(0,1,n+1);cyc=f*TAU
        if name in ('Idle','Walk','Run'):
            amp={'Idle':.08,'Walk':.42,'Run':.94}[name]
            side=amp*np.sin(cyc-.20);recoil=amp*(.40+.35*np.sin(2*cyc-.66))
        elif name=='Sequence':
            gain=np.interp(f,[0,.1,.25,.32,.44,.51,.65,.72,.81,.90,1],[0,0,.39,.84,.89,.42,.23,.04,.46,.76,0])
            side=gain*np.sin(TAU*f*7.1-.32);recoil=gain*(.4+.27*np.sin(TAU*f*13.3))
        else:
            strength=.88 if name=='Cast' else .35
            side=strength*np.sin(cyc*1.72-.53)*np.sin(np.pi*f)**2
            recoil=strength*(np.sin(np.pi*f)**2)*(.48+.33*np.sin(cyc*2.15-.68))
        vals=np.c_[np.maximum(0,side),np.maximum(0,-side),np.maximum(0,recoil)];vals[-1]=vals[0]
        idx_s=len(clip['samplers'])
        clip['samplers'].append(dict(input=b.accessor(f*dur,'SCALAR'),output=b.accessor(vals,'SCALAR'),interpolation='LINEAR'))
        clip['channels'].append(dict(sampler=idx_s,target=dict(node=idx,path='weights')))

def make(b):
    for name in ('HF_Occipital_Crop','HF_Tousled_Fringe_And_Crown'):b.drop(name)
    def bind(v):return b.skin(len(v),'Head')
    base=next(p for p in b.s.primitives(b.s.byname['Portrait']) if b.s.doc['materials'][p['material']]['name']=='ron_photographic_crown')
    # Keep the student's real copper-root photograph, including the infolded
    # hairline that closes the meeting between the cap, temple and neck.
    d,faces=b.data(b.s,base);v=d['POSITION']/1.055;v[:,1]-=.010
    d['POSITION']=v;d['JOINTS_0'],d['WEIGHTS_0']=bind(v)
    mat=b.smat(base['material']);b.doc['materials'][mat]['name']='Ron | photographed copper roots'
    cap=b.prim(d,faces,mat)
    # The cap is static. The two layers below root below its surface and share its skin joint.
    b.mesh('Ron_Copper_Roots',[cap],slot='hair')
    rng=np.random.default_rng(197912);pieces=[Threads() for _ in range(5)]
    flexibility=[[] for _ in pieces]
    palette=[(.053,.015,.006),(.089,.027,.010),(.137,.044,.015),(.176,.066,.024),(.216,.096,.042)]
    def lock(hue,xyz,normal,width,depth,sides,flex):
        pieces[hue].tube(xyz,width,depth,sides,normal)
        flexibility[hue].extend(np.repeat(flex,sides))
    # Pen strokes of very different thicknesses follow broad clumps, not the
    # latitude of the cap. This gives an irregular higher forelock, lower temples
    # and a softer, feathered edge behind each ear.
    for layer,count in enumerate([39,51,71,58]):
        for j in range(count):
            a=(j+rng.uniform(-.39,.39))/count*TAU-np.pi
            front=max(0,np.cos(a));back=max(0,-np.cos(a));side=np.tanh((a+.16)/.40)
            end=line_at(a)+rng.uniform(-.035,.102)+(.09*back if layer>1 else 0)
            if layer==0:end-=rng.uniform(.31,.49)
            if layer==1:end-=rng.uniform(.10,.25)
            start=rng.uniform(.10,.26)+layer*.18
            # Temple waves turn back from a slightly left-of-centre forehead part.
            sweep=.16*np.sin(a)+side*(.13+.32*front)+.19*front
            wav=rng.uniform(-.115,.115);roll=rng.uniform(-.12,.12);phase=rng.uniform(-np.pi,np.pi)
            u=np.linspace(0,1,17);ang=a-sweep*(1-u)**1.35+wav*np.sin(np.pi*u)+roll*np.sin(TAU*u)*np.sin(np.pi*u)
            theta=start+(end-start)*u
            lift=(.0008+.0020*np.sin(np.pi*u)**1.1+
                  (.0012+.0037*front)*np.exp(-((u-.63)/.29)**2)+
                  .0014*np.sin(2*np.pi*u+phase)**2*np.sin(np.pi*u))
            lift=(lift+.0015*back*u**2)*.79
            xyz,rad=scalp(ang,theta,lift);taper=np.maximum(.025,np.sin(np.pi*(.020+.980*u))**.53)
            width=rng.uniform(.00148,.00258)*(.98 if layer<2 else .84);depth=rng.uniform(.00056,.00090)
            hue=int(rng.choice([1,2,3],p=[.33,.52,.15]));flex=(u**2.6)*(.45+.42*front+.15*back)
            lock(hue,xyz,rad,width*taper,depth*taper,7,flex)
            axis=unit(np.gradient(xyz,axis=0));tan=unit(np.cross(axis,rad))
            # Several fine fibres trace the same lock; their different travel
            # lengths and small S-curves prevent a striped or extruded appearance.
            for k in range(3 if layer!=2 else 4):
                d=(k-1.1)*width*.49
                rseed=rng.uniform(0,TAU);sheen=(depth+.00003)*(.65+.30*(1-abs(d)/(width*1.4)))
                strand=xyz+tan*((d+.00040*np.sin(TAU*u+rseed))*taper)[:,None]+rad*(sheen*taper)[:,None]
                fcolor=int(np.clip(hue+rng.choice([-1,0,1],p=[.22,.39,.39]),0,4))
                strandwidth=rng.uniform(.00016,.00039)*taper
                lock(fcolor,strand,rad,strandwidth,strandwidth*.63,4,flex)
    # Defined side-swept locks cross the original cap line and taper on the
    # forehead. The shorter group on his left reveals the brow, the longer
    # side fans to the temple in interrupted tufts.
    # azimuth, length below the hairline, sweep at the root, width in metres.
    locks=[(-1.41,.14,.27,.0030),(-1.19,.21,.29,.0035),(-.98,.25,.34,.0041),
           (-.79,.20,.41,.0039),(-.60,.26,.43,.0042),(-.42,.34,.48,.0042),
           (-.25,.37,.56,.0045),(-.08,.25,.59,.0038),(.11,.24,.59,.0042),
           (.27,.36,.61,.0047),(.42,.32,.58,.0041),(.56,.25,.50,.0042),
           (.72,.30,.45,.0044),(.89,.26,.43,.0041),(1.08,.20,.38,.0035),
           (1.27,.21,.30,.0039),(1.40,.14,.28,.003)]
    for i,(a,extra,sweep,width) in enumerate(locks):
        for k in range(3):
            u=np.linspace(0,1,26);az=a+(k-1)*.030
            start=.34+.08*(i%3);end=line_at(az)+extra+rng.uniform(-.033,.032)
            ang=az-sweep*(1-u)**1.18+.050*np.sin(TAU*u-.46*i)*np.sin(np.pi*u)
            theta=start+(end-start)*u
            # In the last third of the stroke the tip curls back onto the forehead.
            loft=.0012+.0040*np.sin(np.pi*u)**1.4+.0018*np.sin(np.pi*u*1.6)**2
            xyz,rad=scalp(ang,theta,loft)
            width_l=width*(.8 if k==0 else .64)
            t=np.maximum(.014,np.sin(np.pi*(.019+.981*u))**.69)
            tangent=unit(np.cross(unit(np.gradient(xyz,axis=0)),rad))
            xyz+=tangent*((k-1)*width*.72*t)[:,None]
            val=int(rng.choice([1,2,3],p=[.25,.56,.19]));w=width_l*t
            flex=u**2.65*(.85+.13*np.cos(az));lock(val,xyz,rad,w,.27*w,7,flex)
            for j in range(5):
                off=(j-2)/2.65
                strand=xyz+tangent*(off*w)[:,None]+rad*(.26*w*np.sqrt(1-off**2))[:,None]
                strand+=tangent*(.00033*np.sin(TAU*u+i*.31+j)*t)[:,None]
                fw=(.00022+.000035*(j%2))*t
                lock(int(np.clip(val+(1 if j in (0,3) else -1 if j==1 else 0),0,4)),strand,rad,fw,fw*.54,4,flex)
    # Isolated near-skin strands break the perimeter without a hard painted fringe.
    for j in range(126):
        a=(j+rng.uniform(-.38,.38))/126*TAU-np.pi
        u=np.linspace(0,1,13);front=max(0,np.cos(a));edge=line_at(a)
        theta=edge-rng.uniform(.13,.31)+u*rng.uniform(.24,.39)
        if abs(a)<.92 and j%8==0:theta+=.13*u*u
        ang=a+(.043+.072*np.tanh(a+.11))*u+.026*np.sin(np.pi*u*1.6+a)
        xyz,rad=scalp(ang,theta,.0006+.0020*np.sin(np.pi*u)**.9)
        width=rng.uniform(.00019,.00056)*(1-.974*u**1.3)
        lock(int(rng.choice([1,2,3])),xyz,rad,width,width*.62,4,u**2.8*(.55+.41*front))
    # Short flyaways lift above the crown, only a fraction of a millimetre
    # thick, with an irregular length and near-horizontal final tangent.
    for j in range(55):
        a=rng.uniform(-np.pi,np.pi);u=np.linspace(0,1,13)
        t0=rng.uniform(.24,max(.25,line_at(a)-.34));theta=t0+u*rng.uniform(.20,.35)
        ang=a+rng.uniform(-.24,.26)*u+.032*np.sin(3*u+a)
        xyz,rad=scalp(ang,theta,.001+rng.uniform(.0035,.0076)*np.sin(np.pi*u*.76)**1.65)
        w=rng.uniform(.00017,.00029)*(1-.96*u**1.6)
        lock(int(rng.choice([1,2,3,4])),xyz,rad,w,w*.75,4,u**2.8)
    prims=[]
    for i,c in enumerate(pieces):
        m=fibre_material(b,'Ron | copper fibre '+['umber','auburn','ginger','burnished copper','wheat glint'][i],palette[i],214+i)
        p=c.prim(b,m,bind);pos=np.asarray(c.v);f=np.array(flexibility[i]);front=np.clip((pos[:,2]+.048)/.14,0,1)
        lr=np.tanh(pos[:,0]/.032)
        left=np.c_[.0028*f,.00055*lr*f,.00056*lr*f]
        reel=np.c_[.00042*lr*f,(.0013+.0006*front)*f,-(.0017+.0028*front)*f]
        p['targets']=[{'POSITION':b.accessor(d,'VEC3')} for d in (left,-left,reel)]
        prims.append(p)
    from ron_cards import add as photographic_cards
    prims.append(photographic_cards(b,bind,rng))
    idx=b.mesh('Ron_Swept_Copper_Waves',prims,slot='hair',targets=TARGETS)
    animate(b,idx)
