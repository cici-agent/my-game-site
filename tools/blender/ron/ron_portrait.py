"""Fit an articulated Ron with his registered portrait and socket-matched skin."""
import io
import numpy as np
from PIL import Image
from glb import Asset, write_glb
from portrait import Shape as Deformation, add_view, encode, gauss, geometry, image_bytes, linear, photo_colors
from atlas import ramp
from ron_atlas import read_points, register

def surface(name,canonical,points):
    pt=points[name][:,:2];l=(pt[33]+pt[133])/2;r=(pt[362]+pt[263])/2
    across=r-l;across/=np.linalg.norm(across);down=np.array([-across[1],across[0]])
    factor=.116/((pt[152]-(l+r)/2)@down)
    width,depth=(.99,1.03) if name=='ron' else (1.,1.04)
    x=.54*canonical[:,0]*.0102*width+.46*((pt-pt[152])@across)*factor
    y=1.50+.54*(canonical[:,1]-canonical[152,1])*.00964-.46*((pt-pt[152])@down)*factor
    z=.036+canonical[:,2]*.01025*depth+.001*gauss(canonical[:,0],2)*gauss(canonical[:,1],3)
    return np.c_[x,y,z]

class RonShape(Deformation):
    def __init__(self,topology,points):
        canon=np.array([list(map(float,line.split()[1:])) for line in topology.read_text().splitlines() if line.startswith('v ')])
        src=surface('harry',canon,points);dst=surface('ron',canon,points)
        def kernel(a,b):return np.exp(-np.sum((a[:,None]-b[None,:])**2,axis=-1)/.025**2)
        coef=np.linalg.solve(kernel(src,src)+np.eye(len(src))*.018,dst-src)
        self.lo=np.array([-.113,1.386,-.126]);self.step=np.full(3,.004);shape=(59,86,67)
        grid=np.stack(np.meshgrid(*[np.arange(n) for n in shape],indexing='ij'),axis=-1).reshape(-1,3)*self.step+self.lo
        delta=np.concatenate([kernel(g,src)@coef for g in np.array_split(grid,240)])
        x,y,z=grid.T;lateral=np.tanh(x/.017)
        jaw=gauss(y-1.532,.028)*gauss(z-.040,.065)
        cheek=gauss(y-1.576,.022)*gauss(abs(x)-.057,.019)*gauss(z-.055,.038)
        chin=gauss(y-1.512,.019)*gauss(x,.030)*gauss(z-.070,.043)
        bridge=gauss(x,.014)*gauss(y-1.586,.025)*gauss(z-.093,.026)
        delta[:,0]+=.00115*jaw*lateral+.00215*cheek*lateral
        delta[:,1]-=.00185*chin
        delta[:,2]+=.0017*chin+.0015*bridge+.0020*cheek
        self.vals=delta.reshape(*shape,3);self.size=np.array(shape)

def tone(a,buf,ids,stage):
    mat=a.doc['materials'];ps=a.primitives(a.byname['Portrait'])
    def attr(name):return next(p['attributes'] for p in ps if mat[p['material']]['name']==name)
    face=attr('harry_registered_skin');neck=attr('Harry | jaw, throat and nape skin')
    P=a.acc(face['POSITION']).astype(float);uv=a.acc(face['TEXCOORD_0']).astype(float)
    mask=(uv[:,0]>.05)&(P[:,1]<1.64);P=P[mask];uv=uv[mask]
    old=np.asarray(Image.open(io.BytesIO(image_bytes(a,ids['portrait_skin']))).convert('RGB'),float)/255
    new=np.asarray(Image.open(stage/'ron-registered.png').convert('RGB'),float)/255
    ratio=np.clip((linear(photo_colors(new,uv))+.017)/(linear(photo_colors(old,uv))+.017),.43,1.82)
    mids=(P[:,1]>1.523)&(P[:,1]<1.577)&(abs(P[:,0])>.041)&(abs(P[:,0])<.066)&(P[:,2]>.045)
    average=np.median(ratio[mids],axis=0)
    co=a.acc(neck['POSITION']).astype(float);color=a.acc(neck['COLOR_0']).copy()
    for batch in np.array_split(np.arange(len(co)),85):
        v=co[batch,None]-P[None,:];dist=np.einsum('ijk,ijk->ij',v,v);nearest=np.argmin(dist,axis=1)
        w=(1-ramp((np.sqrt(dist[np.arange(len(batch)),nearest])-.00006)/.035))[:,None]
        color[batch,:3]*=w*ratio[nearest]+(1-w)*average
    neck['COLOR_0']=encode(a,buf,np.uint8(np.clip(color*255+.5,0,255)),'VEC4',5121)
    for m in mat:
        name=m['name'];pbr=m['pbrMetallicRoughness']
        if name in {'Skin_hands','Nails','Wand hand | short nail beds','Wand hand | nail tips','harry_skin','harry_ear_warmth'}:
            base=np.array(pbr.get('baseColorFactor',[1,1,1,1]),float);base[:3]*=average;pbr['baseColorFactor']=np.clip(base,0,1).tolist()
        elif name=='Wand hand | warm skin':
            hand=a.primitives(a.byname['HF_Wand_Hand'])[0]['attributes'];color=a.acc(hand['COLOR_0']).copy()
            color[:,:3]*=average;hand['COLOR_0']=encode(a,buf,np.uint8(np.clip(color*255+.5,0,255)),'VEC4',5121)
        elif name=='Portrait | soft brown lashes':
            base=pbr.get('baseColorFactor',[.075,.042,.022,1]);pbr['baseColorFactor']=[.077,.039,.024,base[3]]
    return average

def build(source,target,textures,topology,stage):
    points=read_points(textures);register(textures,points,stage)
    a=Asset(source);d=a.doc;buf=bytearray(a.bin[:d['buffers'][0]['byteLength']])
    ids={e['name']:i for i,e in enumerate(d['images'])};tone(a,buf,ids,stage)
    for old,file,new in [('portrait_skin','ron-registered.png','Ron | freckled complexion'),('portrait_skin_grain','ron-normal.png','Ron | skin microrelief'),('registered_lid','ron-lid.png','Ron | mobile lids')]:
        d['images'][ids[old]].update(name=new,bufferView=add_view(a,buf,(stage/file).read_bytes()),mimeType='image/png')
    fs={'Portrait':{'harry_registered_skin','harry_skin','harry_ear_warmth','Harry | jaw, throat and nape skin'},
        'HF_Upper_And_Lower_Eyelids':{'Portrait | mobile eyelid skin','Portrait | soft brown lashes'},
        'HF_Irises_And_Catchlights':{'Portrait | photographic iris and cornea'},
        'HF_Lip_Opening':{'Portrait | recessed lip opening','harry_registered_skin'}}
    shape=RonShape(topology,points)
    for node,mats in fs.items():geometry(a,buf,shape,node,mats)
    optical=a.nodes[a.byname['Harry_Spectacle_Pads']];optical.pop('skin',None);optical.pop('mesh',None);optical['name']='Retired optical mount'
    face=d['meshes'][a.nodes[a.byname['Portrait']]['mesh']]
    face['primitives']=[p for p in face['primitives'] if d['materials'][p['material']]['name'] not in {'harry_aged_wire','HF umber hair roots'}]
    names={'harry_registered_skin':'Ron | registered freckled complexion','harry_skin':'Ron | scalp skin','harry_ear_warmth':'Ron | ear warmth','Harry | jaw, throat and nape skin':'Ron | jaw throat and nape'}
    for m in d['materials']:
        if m['name'] in names:m['name']=names[m['name']]
    adjust={'FaceBrowLiftR':.94,'FaceBrowLiftL':1.14,'FaceFocus':1.05,'FaceCorner':1.09,'FaceCheekLiftR':.93,'FaceCheekLiftL':1.09}
    for clip in d['animations']:
        for ch in clip['channels']:
            tg=ch['target']
            if tg['path']!='weights' or a.nodes[tg['node']]['name'] not in fs:continue
            keys=d['meshes'][a.nodes[tg['node']]['mesh']]['extras']['targetNames']
            if not any(k in adjust for k in keys):continue
            sm=clip['samplers'][ch['sampler']].copy();val=a.acc(sm['output']).reshape(-1,len(keys)).astype(float)
            for i,k in enumerate(keys):
                if k in adjust:val[:,i]=np.clip(val[:,i]*adjust[k],0,1)
            if clip['name']=='Cast':
                times=a.acc(sm['input']).ravel()
                # A curious asymmetric lift before the circle passes into
                # concentration and a brief lip press ahead of the release.
                for part,amp,when,spread in [('FaceBrowLiftL',.29,.76,.31),('FaceBrowLiftR',.055,.78,.37),('FaceLipPress',.21,1.44,.38),('FaceFocus',.15,1.53,.41),('FaceCheekLiftL',.065,.86,.30)]:
                    if part in keys:
                        i=keys.index(part);val[:,i]=np.clip(val[:,i]+amp*gauss(times-when,spread)*np.sqrt(np.maximum(0,np.sin(np.pi*times/times[-1]))),0,1)
            sm['output']=encode(a,buf,val.reshape(-1,1),'SCALAR');ch['sampler']=len(clip['samplers']);clip['samplers'].append(sm)
    write_glb(d,buf,target)
