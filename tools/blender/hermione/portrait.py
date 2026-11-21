"""Fit the articulated portrait to Hermione, preserving collision-registered skin pieces and grip."""
import io
from PIL import Image
import numpy as np
from atlas import read_landmarks, warp_atlas, ramp
from glb import Asset, write_glb

def gauss(x,s):
    return np.exp(-np.square(x/s))

def bind_surface(key, repo, points):
    path=repo/'tools/blender/face_topology/canonical_face_model.obj'
    canon=np.array([list(map(float,l.split()[1:])) for l in path.read_text().splitlines() if l.startswith('v ')])
    pts=points[key][:,:2]
    xscale,depth,nose={'harry':(1.,1.04,.001),'hermione':(.94,.95,-.0005)}[key]
    eye_a,eye_b=(pts[33]+pts[133])/2,(pts[362]+pts[263])/2
    across=eye_b-eye_a;across/=np.linalg.norm(across);down=np.array([-across[1],across[0]])
    scale=.116/((pts[152]-(eye_a+eye_b)/2)@down)
    x=.54*canon[:,0]*.0102*xscale+.46*((pts-pts[152])@across)*scale
    y=1.50+.54*(canon[:,1]-canon[152,1])*.00964-.46*((pts-pts[152])@down)*scale
    depth=.036+canon[:,2]*.01025*depth+nose*gauss(canon[:,0],2)*gauss(canon[:,1],3)
    return np.c_[x,y,depth]

class Shape:
    def __init__(self, repo, points):
        src,dst=bind_surface('harry',repo,points),bind_surface('hermione',repo,points)
        def basis(a,b):
            d=a[:,None]-b[None,:]
            return np.exp(-np.sum(d*d,axis=-1)/.025**2)
        coef=np.linalg.solve(basis(src,src)+np.eye(len(src))*.018,dst-src)
        self.lo=np.array([-.113,1.386,-.126]);self.step=np.array([.004,.004,.004])
        shape=(59,86,67)
        grid=(np.stack(np.meshgrid(*[np.arange(n) for n in shape], indexing='ij'),axis=-1).reshape(-1,3))*self.step+self.lo
        disp=np.concatenate([basis(p,src)@coef for p in np.array_split(grid,240)])
        x,y,z=grid.T
        # Softer mandibular angle, greater cheek volume and shorter chin. Keep
        # the socket stable near the standing collar; preserve the nape seam.
        later=np.tanh(x/.018)
        jaw=gauss(y-1.533,.035)*gauss(z-.036,.07)
        cheek=gauss(y-1.577,.028)*gauss(np.abs(x)-.054,.024)*gauss(z-.060,.043)
        os=gauss(y-1.51,.022)*gauss(x,.033)*gauss(z-.067,.055)
        brow=gauss(y-1.621,.021)*gauss(z-.084,.04)
        eye=gauss(y-1.6,.020)*gauss(np.abs(x)-.032,.022)*gauss(z-.077,.035)
        disp[:,0]+=-.0032*jaw*later+.0020*cheek*later
        disp[:,1]+=.0047*os+.0012*cheek+.00065*brow
        disp[:,2]+=.0011*cheek-.0011*jaw-.0016*os+.0007*eye
        self.vals=disp.reshape(*shape,3);self.size=np.array(shape)
    def delta(self,p):
        v=np.clip((p-self.lo)/self.step,0,self.size-1.00001);lo=v.astype(int);q=v-lo
        out=np.zeros_like(p,dtype=float)
        for i in (0,1):
            for j in (0,1):
                for k in (0,1):
                    ij=lo+(i,j,k)
                    out+=self.vals[tuple(ij.T)]*(np.prod(np.where(np.array([i,j,k]),q,1-q),axis=1)[:,None])
        return out
    def transform(self,p):return p+self.delta(p)
    def normal_matrices(self,p):
        dx=.00012
        grads=[(self.delta(p+e*dx)-self.delta(p-e*dx))/(2*dx) for e in np.eye(3)]
        jac=np.eye(3)+np.stack(grads,axis=-1)
        return np.linalg.inv(jac).transpose(0,2,1)
def unit(v):
    return v/np.maximum(1e-9,np.linalg.norm(v,axis=1)[:,None])

def encode(asset,buf,data,typ,subtype=5126):
    arr=np.ascontiguousarray(data,dtype={5126:'<f4',5121:'u1'}[subtype])
    if typ=='VEC4' and arr.shape[1]==3 and subtype==5121:
        arr=np.column_stack([arr,np.full(len(arr),255,dtype='u1')])
    assert arr.ndim==2 and arr.shape[1]=={'VEC3':3,'VEC4':4,'SCALAR':1}[typ]
    view=add_view(asset,buf,arr.tobytes())
    acc={'bufferView':view,'componentType':subtype,'type':typ,'count':len(arr)}
    if subtype==5126:acc.update(min=arr.reshape(len(arr),-1).min(axis=0).tolist(),max=arr.reshape(len(arr),-1).max(axis=0).tolist())
    else: acc['normalized']=True
    asset.doc['accessors'].append(acc);return len(asset.doc['accessors'])-1
def add_view(a,buf,data):
    buf.extend(bytes((-len(buf))%4))
    view={'buffer':0,'byteOffset':len(buf),'byteLength':len(data)}
    buf.extend(data);a.doc['bufferViews'].append(view);return len(a.doc['bufferViews'])-1

def geometry(a,buf,shape,node,mats):
    for prim in a.primitives(a.byname[node]):
        if a.doc['materials'][prim['material']]['name'] not in mats:continue
        attr=prim['attributes'];pos=a.acc(attr['POSITION']).astype(float);norm=a.acc(attr['NORMAL']).astype(float)
        transformed=shape.transform(pos);normal_matrices=shape.normal_matrices(pos)
        normals=unit(np.einsum('nij,nj->ni',normal_matrices,norm))
        attr['POSITION']=encode(a,buf,transformed,'VEC3');attr['NORMAL']=encode(a,buf,normals,'VEC3')
        for t in prim.get('targets',[]):
            delta=a.acc(t['POSITION']).astype(float) if 'POSITION' in t else np.zeros_like(pos)
            if not np.any(delta):continue
            moved=pos+delta
            t['POSITION']=encode(a,buf,shape.transform(moved)-transformed,'VEC3')
            if 'NORMAL' in t:
                dn=a.acc(t['NORMAL']).astype(float)
                nnew=unit(np.einsum('nij,nj->ni',shape.normal_matrices(moved),norm+dn))
                t['NORMAL']=encode(a,buf,nnew-normals,'VEC3')

def photo_colors(im,uv):
    x,y=np.clip(uv*724,0.,722.9999).T;i,j=x.astype(int),y.astype(int)
    s=(x-i)[:,None];t=(y-j)[:,None]
    return (im[j,i]*(1-s)+im[j,i+1]*s)*(1-t)+(im[j+1,i]*(1-s)+im[j+1,i+1]*s)*t
def linear(v):
    return np.where(v<=.04045,v/12.92,((v+.055)/1.055)**2.4)
def image_bytes(a,i):
    view=a.doc['bufferViews'][a.doc['images'][i]['bufferView']];start=view.get('byteOffset',0)
    return bytes(a.bin[start:start+view['byteLength']])

def complexion(a,buf,images,atlas_dir):
    ps=a.primitives(a.byname['Portrait']);mat=a.doc['materials']
    face=next(p for p in ps if mat[p['material']]['name']=='harry_registered_skin')['attributes']
    neck=next(p for p in ps if mat[p['material']]['name']=='Harry | jaw, throat and nape skin')['attributes']
    P=a.acc(face['POSITION']).astype(float);uv=a.acc(face['TEXCOORD_0']).astype(float)
    use=(uv[:,0]>.05)&(P[:,1]<1.64)
    P=P[use];uv=uv[use]
    old=np.asarray(Image.open(io.BytesIO(image_bytes(a,images['portrait_skin']))).convert('RGB'))/255.
    new=np.asarray(Image.open(atlas_dir/'hermione-registered.png').convert('RGB'))/255.
    A=linear(photo_colors(old,uv));B=linear(photo_colors(new,uv))
    ratio=np.clip((B+.017)/(A+.017),.45,1.8)
    local=(P[:,1]>1.523)&(P[:,1]<1.577)&(abs(P[:,0])>.041)&(abs(P[:,0])<.066)&(P[:,2]>.045)
    global_ratio=np.median(ratio[local],axis=0)
    cols=a.acc(neck['COLOR_0']).copy()
    co=a.acc(neck['POSITION']).astype(float)
    for chunk in np.array_split(np.arange(len(co)),85):
        d=co[chunk,None]-P[None,:];d=np.einsum('ijk,ijk->ij',d,d);near=np.argmin(d,axis=1)
        w=(1-ramp((np.sqrt(d[np.arange(len(chunk)),near])-.00006)/.035))[:,None]
        cols[chunk,:3]*=w*ratio[near]+(1-w)*global_ratio
    neck['COLOR_0']=encode(a,buf,np.uint8(np.clip(cols*255+.5,0,255)),'VEC4',5121)
    for m in mat:
        name=m['name'];pbr=m['pbrMetallicRoughness']
        if name in ('Skin_hands','Nails','Wand hand | short nail beds','Wand hand | nail tips','harry_skin','harry_ear_warmth'):
            base=np.array(pbr.get('baseColorFactor',[1,1,1,1]));base[:3]*=global_ratio
            pbr['baseColorFactor']=np.clip(base,0,1).tolist()
        elif name=='Wand hand | warm skin':
            # Vertex colours capture subtle fingertip pinkness. Use a factor
            # whose channels fit glTF's 0..1 range and preserve this detail.
            hand=a.primitives(a.byname['HF_Wand_Hand'])[0]['attributes']
            c=a.acc(hand['COLOR_0']).copy();c[:,:3]*=global_ratio
            hand['COLOR_0']=encode(a,buf,np.uint8(np.clip(c*255+.5,0,255)),'VEC4',5121)
    print('neck/hand complexion linear',global_ratio)

def build(source,target,repo,atlas_dir):
    points=read_landmarks(repo)
    warp_atlas(repo,atlas_dir,points)
    a=Asset(source);buf=bytearray(a.bin[:a.doc['buffers'][0]['byteLength']]);doc=a.doc
    ids={i['name']:n for n,i in enumerate(doc['images'])}
    complexion(a,buf,ids,atlas_dir)
    for old,file,new in [('portrait_skin','hermione-registered.png','Hermione | registered complexion'),('portrait_skin_grain','hermione-normal.png','Hermione | pore relief'),('registered_lid','hermione-lid.png','Hermione | mobile lids')]:
        image=doc['images'][ids[old]];image.update(name=new,bufferView=add_view(a,buf,(atlas_dir/file).read_bytes()),mimeType='image/png')
    fs={'Portrait':{'harry_registered_skin','harry_skin','harry_ear_warmth','Harry | jaw, throat and nape skin'},
        'HF_Upper_And_Lower_Eyelids':{'Portrait | mobile eyelid skin','Portrait | soft brown lashes'},
        'HF_Irises_And_Catchlights':{'Portrait | photographic iris and cornea'},
        'HF_Lip_Opening':{'Portrait | recessed lip opening','harry_registered_skin'}}
    shp=Shape(repo,points)
    for node,mats in fs.items():geometry(a,buf,shp,node,mats)
    # The entire upper-head mount includes the nasal pads as its own skinned object.
    node=a.nodes[a.byname['Harry_Spectacle_Pads']]
    node.pop('skin',None);node.pop('mesh',None);node['name']='Retired optical mount'
    portrait=doc['meshes'][a.nodes[a.byname['Portrait']]['mesh']]
    portrait['primitives']=[p for p in portrait['primitives'] if doc['materials'][p['material']]['name'] not in {'harry_aged_wire','HF umber hair roots'}]
    names={'harry_registered_skin':'Hermione | registered complexion','harry_skin':'Hermione | scalp skin','harry_ear_warmth':'Hermione | ear warmth','Harry | jaw, throat and nape skin':'Hermione | jaw, throat and nape'}
    for m in doc['materials']:
        if m['name'] in names:m['name']=names[m['name']]
    adjust={'FaceBrowLiftR':1.15,'FaceBrowLiftL':.91,'FaceFocus':1.07,'FaceCorner':.84,'FaceCheekLiftR':1.06,'FaceCheekLiftL':.95}
    for anim in doc['animations']:
        for c in anim['channels']:
            tg=c['target']
            if tg['path']!='weights' or a.nodes[tg['node']]['name'] not in fs:continue
            keys=doc['meshes'][a.nodes[tg['node']]['mesh']]['extras']['targetNames']
            if not any(k in adjust for k in keys):continue
            sm=anim['samplers'][c['sampler']].copy()
            data=a.acc(sm['output']).reshape(-1,len(keys)).astype(float)
            for i,k in enumerate(keys):
                if k in adjust:data[:,i]=np.clip(data[:,i]*adjust[k],0,1)
            sm['output']=encode(a,buf,data.reshape(-1,1),'SCALAR')
            c['sampler']=len(anim['samplers']);anim['samplers'].append(sm)
    write_glb(doc,buf,target)
