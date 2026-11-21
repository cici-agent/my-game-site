"""Read the embedded glTF buffers, animated joints and mesh primitives used by the student builder."""
from pathlib import Path
import struct,json
import numpy as np

def field(a,k,fallback):return np.array(a.get(k,fallback),float)
class Asset:
    def __init__(self,path):
        raw=Path(path).read_bytes();jl=struct.unpack_from('<I',raw,12)[0]
        self.doc=json.loads(raw[20:20+jl]);self.bin=memoryview(raw)[28+jl:]
        self.nodes=self.doc['nodes'];self.byname={n['name']:i for i,n in enumerate(self.nodes)}
        self.actions={a['name']:a for a in self.doc['animations']};self.arrays={}
        self.parents={v:i for i,n in enumerate(self.nodes) for v in n.get('children',[])}
    def acc(self,i):
        if i in self.arrays:return self.arrays[i]
        a=self.doc['accessors'][i];w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
        dt={5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4',5120:'i1',5122:'<i2'}[a['componentType']]
        size=np.dtype(dt).itemsize
        def get(vi,off,shape,kind):
            v=self.doc['bufferViews'][vi];return np.ndarray(shape,dtype=kind,buffer=self.bin,offset=v.get('byteOffset',0)+off,
                strides=(v.get('byteStride',np.dtype(kind).itemsize*shape[1]),np.dtype(kind).itemsize))
        arr=get(a['bufferView'],a.get('byteOffset',0),(a['count'],w),dt) if 'bufferView' in a else np.zeros((a['count'],w),dtype=dt)
        if 'sparse' in a:
            s=a['sparse'];idx=s['indices'];v=s['values'];arr=arr.copy()
            it={5121:'u1',5123:'<u2',5125:'<u4'}[idx['componentType']]
            arr[get(idx['bufferView'],idx.get('byteOffset',0),(s['count'],1),it).ravel()]=get(v['bufferView'],v.get('byteOffset',0),(s['count'],w),dt)
        if a.get('normalized') and dt!='<f4':arr=arr.astype(float)/float(np.iinfo(np.dtype(dt)).max)
        self.arrays[i]=arr;return arr
    def at(self,name,t):
        a=self.actions[name];values={};morphs={}
        for c in a['channels']:
            tg=c['target'];i=tg['node'];path=tg['path'];sa=a['samplers'][c['sampler']]
            times=self.acc(sa['input']).ravel();data=self.acc(sa['output']).reshape(len(times),-1)
            k=int(np.clip(np.searchsorted(times,t+1e-8)-1,0,len(times)-1));j=min(k+1,len(times)-1)
            u=float(np.clip((t-times[k])/(times[j]-times[k]),0,1)) if j!=k else 0
            if sa.get('interpolation')=='STEP':u=0
            v=data[k]*(1-u)+data[j]*u
            if path=='rotation' and np.dot(data[k],data[j])<0:v=data[k]*(1-u)-data[j]*u
            if path=='weights':morphs[i]=v
            else:values[i,path]=v
        world={}
        def matrix(i):
            if i in world:return world[i]
            n=self.nodes[i]
            xyz=values.get((i,'translation'),field(n,'translation',[0,0,0]))
            q=values.get((i,'rotation'),field(n,'rotation',[0,0,0,1]));x,y,z,w=q/np.linalg.norm(q)
            scale=values.get((i,'scale'),field(n,'scale',[1,1,1]))
            r=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
                        [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
                        [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
            m=np.eye(4);m[:3,:3]=r*scale;m[:3,3]=xyz
            if i in self.parents:m=matrix(self.parents[i])@m
            world[i]=m;return m
        return matrix,morphs
    def primitives(self,i):
        return self.doc['meshes'][self.nodes[i]['mesh']]['primitives']


def write_glb(document, binary, target):
    document['buffers'][0]['byteLength'] = len(binary)
    binary.extend(bytes(-len(binary) % 4))
    metadata = json.dumps(document, separators=(',', ':'), ensure_ascii=False).encode()
    metadata += b' ' * (-len(metadata) % 4)
    header = struct.pack('<4sII', b'glTF', 2, 28 + len(metadata) + len(binary))
    Path(target).write_bytes(header + struct.pack('<I4s', len(metadata), b'JSON') + metadata
                             + struct.pack('<I4s', len(binary), b'BIN\0') + binary)
