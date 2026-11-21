"""Fit the school's carved vine wand to the recorded five finger contacts."""
from io import BytesIO
import math
import numpy as np
from PIL import Image
from glb import Asset, write_glb

TAU=2*math.pi
def unit(x):
    return x/np.linalg.norm(x,axis=-1,keepdims=True).clip(1e-14)
def change_axes(x):
    return np.array([x[0],x[2],-x[1]])
def smooth(t):
    t=np.clip(t,0,1)
    return t*t*(3-2*t)

class Surface:
    def __init__(self):
        self.positions=[];self.uv=[];self.faces=[]
    def grid(self,points,uv,flip=False):
        offset=len(self.positions);rows,cols=points.shape[:2]
        self.positions.extend(points.reshape(-1,3));self.uv.extend(uv.reshape(-1,2))
        for i in range(rows-1):
            for j in range(cols-1):
                a=offset+i*cols+j; b=a+cols
                tris=[[a,a+1,b],[a+1,b+1,b]]
                self.faces.extend([tri[::-1] if flip else tri for tri in tris])
    def tube(self,points,rads,breadth=12):
        points=np.array(points);t=unit(np.gradient(points,axis=0));along=[]
        # Parallel transport the cross-section around a curved vine.
        ref=np.eye(3)[np.argmin(np.abs(t[0]))]
        for v in t:
            ref=unit(ref-v*(ref@v))
            along.append(ref)
        a=np.array(along);b=np.cross(t,a);ang=np.linspace(0,TAU,breadth+1)
        p=points[:,None,:]+np.asarray(rads)[:,None,None]*(a[:,None,:]*np.cos(ang)[None,:,None]+b[:,None,:]*np.sin(ang)[None,:,None])
        x,y=np.meshgrid(np.linspace(0,1,breadth+1),np.linspace(0,1,len(points)))
        self.grid(p,np.stack((x,y),axis=-1))

def wood_texture():
    w,h=384,1024
    u,v=np.meshgrid(np.arange(w)/w,np.arange(h)/h)
    # An annual-ring cut, elongated fibres and two small branch knots follow the lathed shaft.
    theta=TAU*u
    phase=theta*16+1.55*np.sin(theta*3+v*8)+.8*np.sin(theta*2-v*22)+.3*np.sin(3*theta+v*45)
    grain=.50*np.sin(phase)+.27*np.sin(phase*2.1+np.cos(theta*3))+.23*np.sin(11*phase+np.sin(v*16))
    for uc,vc in ((.31,.69),(.72,.32)):
        du=(u-uc+.5)%1-.5
        radial=np.sqrt((du/.090)**2+((v-vc)/.055)**2)
        grain+=.55*np.exp(-radial)*np.sin(radial*16)
    rng=np.random.default_rng(128)
    grain+=.23*rng.standard_normal((h,w))+.27*np.cos(theta*2+v*13)
    color=np.clip(np.array([140.,91.,58.])[None,None,:]+grain[:,:,None]*[22,17,12],0,255).astype('uint8')
    f=BytesIO();Image.fromarray(color).save(f,'JPEG',quality=92,subsampling=0);return f.getvalue()

def build(source,output):
    a=Asset(source);doc=a.doc;binary=bytearray(a.bin[:doc['buffers'][0]['byteLength']])
    def view(data):
        binary.extend(bytes(-len(binary)%4));n=len(doc['bufferViews'])
        doc['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':len(data)})
        binary.extend(data);return n
    def acc(data,kind,ctype,limits=False):
        data=np.ascontiguousarray(data,dtype={5123:'<u2',5125:'<u4',5121:'u1',5126:'<f4'}[ctype])
        i=len(doc['accessors']);entry=dict(bufferView=view(data.tobytes()),componentType=ctype,type=kind,count=len(data))
        if limits:entry.update(min=data.min(axis=0).tolist(),max=data.max(axis=0).tolist())
        doc['accessors'].append(entry);return i
    h=a.nodes[a.byname['HF_Wand_Hand']];extras=h['extras']
    gr=change_axes(extras['gripCenter']);axis=unit(change_axes(extras['gripAxis']))
    up=unit(np.array([0.,1.,0.])-axis*axis[1]);side=np.cross(axis,up)
    fingers=[]
    for f in ('little','ring','middle','thumb','index'):
        d=change_axes(extras['grip_'+f+'_wood'])-gr;t=float(d@axis)
        fingers.append((t,np.linalg.norm(d-t*axis)))
    radius_table=sorted([(-.059,.0004),(-.0586,.0041),(-.0565,.0080),(-.0535,.0108),(-.049,.01185),(-.045,.012),(-.038,.0114),*fingers,(.051,.0091),(.056,.0094),(.060,.0081),(.069,.00665),(.091,.0056),(.146,.00465),(.199,.0036),(.243,.00255),(.272,.00165),(.280,.0011),(.281,.00025)])
    sta=np.array(radius_table)
    def radius(t):
        return np.interp(t,sta[:,0],sta[:,1])
    def center(t):
        bend=t*0 if t<.05 else smooth((t-.05)/.095)
        return gr+axis*t+side*(.006*np.sin(24*t)*bend)+up*.004*(t/.28)**2*bend
    def outward(theta):
        return up*np.cos(theta)+side*np.sin(theta)
    parts=[Surface() for _ in range(4)]
    body,stems,leaves,veins=parts
    ts=np.unique(np.r_[sta[:,0],np.linspace(sta[0,0],sta[-1,0],112)])
    th=np.linspace(0,TAU,57)
    pts=np.array([[center(t)+outward(theta)*radius(t)*(1+.012*np.cos(5*theta+t*29)*smooth((t-.050)/.04)) for theta in th] for t in ts])
    u,v=np.meshgrid(th/TAU,(ts-ts[0])/(ts[-1]-ts[0]))
    body.grid(pts,np.stack((u,v),axis=-1))
    # Two distinct twining stems and small relief-cut, veined leaves, all continuous with the wood.
    def vine_at(t,branch):
        s=np.clip((t+.052)/.222,0,1)
        theta=branch+TAU*(2.45*s+.19*s*s)+.22*np.sin(s*6)
        r=.00175*(1-.80*s)
        # The spiral is intaglio-shallow under the gripping fingers.
        grip=smooth((t+.037)/.009)*(1-smooth((t-.045)/.012))
        r*=1-.83*grip
        return center(t)+outward(theta)*(radius(t)+.09*r),theta,r
    for branch,end in ((.42,.180),(3.04,.133)):
        ts=np.linspace(-.052,end,142);row=[vine_at(t,branch) for t in ts]
        rad=np.array([s[2] for s in row]);rad*=np.minimum(smooth(np.arange(len(ts))/5),smooth(np.arange(len(ts))[::-1]/7))
        stems.tube([s[0] for s in row],rad+.00006,12)
    for idx,(t,sg,branch) in enumerate([(-.045,1,.42),(.053,-1,3.04),(.061,1,.42),(.077,-1,.42),(.090,1,3.04),(.111,-1,3.04),(.127,1,.42),(.148,-1,.42)]):
        p,theta,_=vine_at(t,branch);n=outward(theta);across=unit(np.cross(axis,n))
        length=.016*(1-.22*idx/7);width=.0038*(1-.25*idx/7)
        def leafpoint(u,v):
            mid=theta+sg*(.15+.98*u)
            normal=outward(mid)
            transverse=unit(np.cross(axis,normal))
            bulge=math.sin(math.pi*u)**.82
            scallops=1+.12*math.sin(5*math.pi*u)**2
            return center(t+u*length)+normal*(radius(t+u*length)+.0004+.0019*bulge*(1-v*v))+transverse*(v*width*bulge*scallops)
        us=np.linspace(.005,.997,23);vs=np.linspace(-1,1,9)
        pp=np.array([[leafpoint(u,v) for v in vs] for u in us])
        uu,vv=np.meshgrid(vs*.5+.5,us);leaves.grid(pp,np.stack((uu,vv),axis=-1),flip=True)
        veins.tube([leafpoint(u,0)+outward(theta+sg*(.15+.98*u))*.00012 for u in us],.00029*np.sin(np.pi*us)**.5+.00002,6)
        for k in (.31,.52,.68):
            for sign in (-1,1):
                ray=np.linspace(0,1,8);veins.tube([leafpoint(k+.17*x,.77*x*sign)+outward(theta+sg*(.15+.98*(k+.17*x)))*.00009 for x in ray],.00016*(1-ray)+.000025,5)
    img=len(doc['images']);doc['images'].append({'name':'Hermione vine • figured wood fibres','bufferView':view(wood_texture()),'mimeType':'image/jpeg'})
    tex=len(doc['textures']);doc['textures'].append({'source':img})
    joint=doc['skins'][h['skin']]['joints'].index(a.byname['HandR']);pr=[]
    for part,material,color,rough in zip(parts,('Vinewood • polished stock','Vinewood • twining tendril','Vinewood • carved leaf','Vinewood • leaf midrib'),([1,1,1],[.30,.145,.074],[.36,.195,.105],[.29,.133,.055]),(.40,.39,.43,.46)):
        mi=len(doc['materials']);pbr={'baseColorFactor':[*color,1],'metallicFactor':0,'roughnessFactor':rough}
        if part is body:pbr['baseColorTexture']={'index':tex}
        doc['materials'].append({'name':material,'pbrMetallicRoughness':pbr,'doubleSided':part is leaves})
        pos=np.array(part.positions);f=np.asarray(part.faces)
        cross=np.cross(pos[f[:,1]]-pos[f[:,0]],pos[f[:,2]]-pos[f[:,0]])
        if part is leaves and (cross*(pos[f[:,0]]-gr-axis*((pos[f[:,0]]-gr)@axis)[:,None])).sum()<0:
            f=f[:,::-1];cross=-cross
        normals=np.zeros_like(pos)
        for i in range(3):np.add.at(normals,f[:,i],cross)
        lengths=np.linalg.norm(normals,axis=1);normals[lengths<1e-14]=up;normals=unit(normals)
        joints=np.zeros((len(pos),4),dtype='u1');joints[:,0]=joint
        weights=np.zeros((len(pos),4),dtype='f4');weights[:,0]=1.
        attr={'POSITION':acc(pos,'VEC3',5126,True),'NORMAL':acc(normals,'VEC3',5126),'TEXCOORD_0':acc(part.uv,'VEC2',5126),'JOINTS_0':acc(joints,'VEC4',5121),'WEIGHTS_0':acc(weights,'VEC4',5126)}
        pr.append({'attributes':attr,'indices':acc(f.ravel(),'SCALAR',5123),'material':mi})
    node=a.nodes[a.byname['HF_Pathfinder_Wand_05']]
    node['name']='Hermione_Vine_Wand';node['extras']={'wardrobeSlot':'weapon','itemId':'hermione.vine','gripCentre':gr.tolist(),'shaftLength':.34,'wood':'vine'}
    node['mesh']=len(doc['meshes']);doc['meshes'].append({'name':'Hermione_Vine_Wand','primitives':pr})
    glint=a.nodes[a.byname['Pathfinder_Wand_Garnet_Catchlight']]
    glint.pop('mesh',None);glint.pop('skin',None);glint.pop('extras',None);glint['name']='Retired_Wand_Light'
    write_glb(doc,binary,output)
