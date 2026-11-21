"""glTF mesh construction in metres, glTF Y-up, skin joint indices in the target skeleton."""
import copy, struct, json
from pathlib import Path
import numpy as np
from glb import Asset

def unit(v):
    return v/np.maximum(np.linalg.norm(v,axis=-1,keepdims=True),1.e-12)

class Builder:
    def __init__(self,target,source):
        self.a,self.s=Asset(target),Asset(source)
        self.doc=self.a.doc;self.bin=bytearray(self.a.bin[:self.doc['buffers'][0]['byteLength']])
        self.root=self.a.parents[self.a.byname['Portrait']];self.materials={};self.textures={};self.images={}
        self.joint={self.a.nodes[j]['name']:i for i,j in enumerate(self.doc['skins'][0]['joints'])}
        self.source_joints=np.array([self.joint[self.s.nodes[j]['name']] for j in self.s.doc['skins'][0]['joints']],np.uint8)
    def append(self,key,row):
        arr=self.doc.setdefault(key,[]);arr.append(row);return len(arr)-1
    def view(self,raw):
        self.bin.extend(bytes(-len(self.bin)%4));start=len(self.bin);self.bin.extend(raw)
        return self.append('bufferViews',dict(buffer=0,byteOffset=start,byteLength=len(raw)))
    def accessor(self,v,typ,component=5126):
        v=np.ascontiguousarray(v,dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[component])
        w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[typ];v=v.reshape(-1,w)
        return self.append('accessors',dict(bufferView=self.view(v.tobytes()),componentType=component,type=typ,count=len(v),min=v.min(0).tolist(),max=v.max(0).tolist()))
    def mat(self,name,color,rough=.7,metal=0,double=True):
        return self.append('materials',dict(name=name,doubleSided=double,pbrMetallicRoughness=dict(baseColorFactor=[*color,1],roughnessFactor=rough,metallicFactor=metal)))
    def texture(self,idx):
        if idx in self.textures:return self.textures[idx]
        t=copy.deepcopy(self.s.doc['textures'][idx]);im=t['source']
        if im not in self.images:
            item=copy.deepcopy(self.s.doc['images'][im]);v=self.s.doc['bufferViews'][item['bufferView']];o=v.get('byteOffset',0)
            item['bufferView']=self.view(self.s.bin[o:o+v['byteLength']]);self.images[im]=self.append('images',item)
        t['source']=self.images[im]
        if 'sampler' in t:t['sampler']=self.append('samplers',copy.deepcopy(self.s.doc['samplers'][t['sampler']]))
        self.textures[idx]=self.append('textures',t);return self.textures[idx]
    def smat(self,idx):
        if idx in self.materials:return self.materials[idx]
        material=copy.deepcopy(self.s.doc['materials'][idx])
        def walk(obj):
            if isinstance(obj,dict):
                if 'index' in obj:obj['index']=self.texture(obj['index'])
                else:
                    for a in obj.values():walk(a)
        walk(material);self.materials[idx]=self.append('materials',material);return self.materials[idx]
    def data(self,asset,p):
        d={k:asset.acc(i).copy() for k,i in p['attributes'].items() if k in ('POSITION','NORMAL','TEXCOORD_0','TEXCOORD_1','JOINTS_0','WEIGHTS_0')}
        if asset is self.s:
            d['JOINTS_0']=self.source_joints[d['JOINTS_0']]
        return d,asset.acc(p['indices']).reshape(-1,3).copy()
    def prim(self,d,f,mat):
        attrs={}
        for k,v in d.items():
            attrs[k]=self.accessor(v,{'POSITION':'VEC3','NORMAL':'VEC3','TEXCOORD_0':'VEC2','TEXCOORD_1':'VEC2','JOINTS_0':'VEC4','WEIGHTS_0':'VEC4'}[k],5121 if k=='JOINTS_0' else 5126)
        return dict(attributes=attrs,indices=self.accessor(f,'SCALAR',5123 if np.max(f)<65536 else 5125),material=mat)
    def skin(self,n,j):
        js=np.zeros((n,4),np.uint8);js[:,0]=self.joint[j];ws=np.zeros((n,4),np.float32);ws[:,0]=1;return js,ws
    def mesh(self,name,prims,slot=None,node=None,targets=()):
        mesh=dict(name=name,primitives=prims)
        if targets:mesh.update(weights=[0]*len(targets),extras={'targetNames':list(targets)})
        if node is None:
            node=self.append('nodes',dict(skin=0,name=name,extras={'wardrobeSlot':slot} if slot else {}));self.a.nodes[self.root]['children'].append(node)
        n=self.a.nodes[node];n['mesh']=self.append('meshes',mesh);n['name']=name
        if slot:n.setdefault('extras',{})['wardrobeSlot']=slot
        return node
    def drop(self,name):
        idx=self.a.byname.get(name)
        if idx is None:return
        self.a.nodes[self.root]['children']=[i for i in self.a.nodes[self.root]['children'] if i!=idx]
        # Unreachable geometry and textures are removed by the final packer.
        self.a.nodes[idx].pop('mesh',None);self.a.nodes[idx].pop('skin',None);self.a.nodes[idx]['name']='RetiredPart'+str(idx)
    def save(self,path):
        self.doc['buffers'][0]['byteLength']=len(self.bin)
        raw=json.dumps(self.doc,separators=(',',':'),ensure_ascii=False).encode();raw+=b' '*(-len(raw)%4);self.bin.extend(bytes(-len(self.bin)%4))
        Path(path).write_bytes(struct.pack('<4sII',b'glTF',2,28+len(raw)+len(self.bin))+struct.pack('<I4s',len(raw),b'JSON')+raw+struct.pack('<I4s',len(self.bin),b'BIN\0')+self.bin)

class Threads:
    def __init__(self):
        self.v=[];self.n=[];self.uv=[];self.f=[]
    def tube(self,path,width,depth=None,sides=6,radial=None):
        path=np.asarray(path);n=len(path);axis=unit(np.gradient(path,axis=0))
        if radial is None:radial=np.broadcast_to((0.,0.,1.),path.shape)
        ra=np.broadcast_to(radial,path.shape).copy();bad=np.abs((axis*ra).sum(1))>.92
        ra[bad]=np.array([1.,0.,0.])
        u=unit(np.cross(axis,ra));v=unit(np.cross(u,axis))
        w=np.broadcast_to(width,(n,));h=np.broadcast_to(depth if depth is not None else width,(n,))
        angles=np.arange(sides)*np.pi*2/sides;cs=np.cos(angles)[None,:,None];sn=np.sin(angles)[None,:,None]
        pos=path[:,None,:]+u[:,None,:]*w[:,None,None]*cs+v[:,None,:]*h[:,None,None]*sn
        norm=unit(u[:,None,:]*cs/np.maximum(w[:,None,None],.000001)+v[:,None,:]*sn/np.maximum(h[:,None,None],.000001))
        begin=len(self.v);self.v.extend(pos.reshape(-1,3));self.n.extend(norm.reshape(-1,3))
        self.uv.extend(np.stack(np.broadcast_arrays(np.arange(sides)[None,:]/sides,np.linspace(0,1,n)[:,None]),axis=2).reshape(-1,2))
        for i in range(n-1):
            for j in range(sides):
                a=begin+i*sides+j;b=begin+i*sides+(j+1)%sides;c=a+sides;d=b+sides
                self.f.extend(((a,c,b),(b,c,d)))
    def prim(self,b,mat,binder):
        v=np.asarray(self.v);js,ws=binder(v)
        return b.prim(dict(POSITION=v,NORMAL=np.array(self.n),TEXCOORD_0=np.array(self.uv),JOINTS_0=js,WEIGHTS_0=ws),np.array(self.f),mat)
