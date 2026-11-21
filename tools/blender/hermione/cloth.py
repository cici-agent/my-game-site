"""Add follow-through to the free robe panels. Seams and lining share a deformation."""
import numpy as np
from glb import Asset, write_glb

def smooth(t):
    t=np.clip(t,0,1)
    return t*t*(3.-2*t)
def progression(name,frame):
    if name=='Run':return 1.,0.
    if name=='Walk':return .30,0.
    if name=='Cast':return 0.,frame
    if name=='Sequence':
        walk=smooth((frame-31)/21)*(1-smooth((frame-188)/23))
        run=smooth((frame-84)/16)*(1-smooth((frame-146)/18))
        return walk*(.30+.70*run),max(0.,frame-236)
    return 0.,0.
def delta(p,key):
    x,y,z=p.T
    w=smooth((1.105-y)/.715)**1.68
    back=smooth((.135-z)/.275);front=1.-back
    if key==0:
        return np.stack((.013*np.tanh(10*x)*w*(.25+.75*front),.018*w*(.5+.5*back),
                         w*(-.065*(.15+.85*back)+.011*front)),axis=1)
    s=1. if key==1 else -1.
    return np.stack((s*w*(-.055*z+.013*(.5+back)),
                     w*(.0025+.006*s*x),s*w*.082*x),axis=1)
def build(src,out):
    a=Asset(src);d=a.doc;buf=bytearray(a.bin[:d['buffers'][0]['byteLength']])
    def acc(x,kind):
        x=np.ascontiguousarray(x,dtype='<f4')
        buf.extend(bytes(-len(buf)%4));v=len(d['bufferViews'])
        d['bufferViews'].append({'buffer':0,'byteOffset':len(buf),'byteLength':x.nbytes});buf.extend(x.tobytes())
        i=len(d['accessors']);d['accessors'].append({'bufferView':v,'componentType':5126,'count':len(x),'type':kind,'min':np.atleast_1d(x.min(axis=0)).tolist(),'max':np.atleast_1d(x.max(axis=0)).tolist()});return i
    ids=[a.byname[n] for n in ('Hermione_Gryffindor_Robe_and_Hood','Hermione_Corded_Lapels_and_Pick_Stitch')]
    for n in ids:
        mesh=d['meshes'][a.nodes[n]['mesh']]
        assert not mesh.get('weights') and all(not p.get('targets') for p in mesh['primitives'])
        mesh.setdefault('extras',{})['targetNames']=['RobeAir','RobeLeft','RobeRight']
        mesh['weights']=[0.,0.,0.]
        for p in mesh['primitives']:
            pos=a.acc(p['attributes']['POSITION']).astype(float);nor=a.acc(p['attributes']['NORMAL']).astype(float)
            p['targets']=[]
            for k in range(3):
                # The inverse-transpose transports each existing split normal and
                # keeps the hem, lining and dark piping lit consistently.
                grad=np.stack([(delta(pos+v,k)-delta(pos-v,k))/.0002 for v in .0001*np.eye(3)],axis=2)
                new=np.einsum('nij,ni->nj',np.linalg.inv(grad+np.eye(3)),nor)
                new/=np.maximum(np.linalg.norm(new,axis=1)[:,None],1e-10)
                p['targets'].append({'POSITION':acc(delta(pos,k),'VEC3'),'NORMAL':acc(new-nor,'VEC3')})
    for name in ('Run','Walk','Cast','Sequence'):
        clip=a.actions[name]
        duration=max(float(a.acc(s['input']).max()) for s in clip['samplers']);steps=round(duration*48);times=np.arange(steps+1)/48
        legs=[];wrist=[]
        for t in times:
            mat,_=a.at(name,t);coords=lambda b:mat(a.byname[b])[:3,3]
            legs.append((coords('FootL')[2]-coords('FootR')[2])/.57)
            wrist.append((coords('HandR')-coords('Hips'))[0])
        # Wrap through the seam of the cycling motions; hold the lead-in at rest
        # for the performed one-shot and the continuous take.
        delay=4
        hist=np.arange(len(times))[:,None]-np.arange(delay,delay+5)
        if name in ('Walk','Run'):hist=hist%steps
        else:hist=np.clip(hist,0,steps)
        l=np.mean(np.asarray(legs)[hist],axis=1);arm=np.mean(np.asarray(wrist)[hist],axis=1)
        weights=[]
        for i,t in enumerate(times):
            move,cast=progression(name,t*24)
            swing=np.clip(l[i],-1.,1.)*move*.90
            air=move*(.78+.13*abs(l[i]))
            if cast:
                gate=smooth((cast-5)/9)*(1-smooth((cast-62)/12))
                swing+=np.clip((arm[i]+.24)*4.,-.9,.9)*gate
                air+=.19*gate
            weights.extend((min(1.,air),max(0.,swing),max(0.,-swing)))
        tacc=acc(times,'SCALAR');wacc=acc(weights,'SCALAR')
        idx=len(clip['samplers']);clip['samplers'].append({'input':tacc,'output':wacc,'interpolation':'LINEAR'})
        for n in ids:clip['channels'].append({'sampler':idx,'target':{'node':n,'path':'weights'}})
    write_glb(d,buf,out)
