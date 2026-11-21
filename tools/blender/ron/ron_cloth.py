"""Animate the free robe panels and their sewn trim on the existing academy clips."""
import numpy as np
from cloth import delta as academy_delta, progression, smooth


def delta(points,key):
    offset=academy_delta(points,key)
    if key==0:
        # The back hem lifts and fans out as his heel recovers in a sprint.
        tail=smooth((.73-points[:,1])/.33)*smooth((-points[:,2]-.025)/.13)
        offset[:,1]+=.075*tail
        offset[:,2]-=.078*tail
    return offset


def make(b, nodes):
    # Builder is still in memory. Read each newly written accessor using its view offset.
    def positions(primitive, key):
        item = b.doc['accessors'][primitive['attributes'][key]]
        view = b.doc['bufferViews'][item['bufferView']]
        return np.frombuffer(b.bin, '<f4', item['count']*3, view['byteOffset']).reshape(-1,3).copy()
    for n in nodes:
        mesh=b.doc['meshes'][b.doc['nodes'][n]['mesh']]
        mesh.update(weights=[0.,0.,0.],extras={'targetNames':['RobeAir','RobeLeft','RobeRight']})
        for p in mesh['primitives']:
            v,norm=positions(p,'POSITION'),positions(p,'NORMAL')
            p['targets']=[]
            for k in range(3):
                grad=np.stack([(delta(v+h,k)-delta(v-h,k))/.0002 for h in .0001*np.eye(3)],axis=2)
                normal=np.einsum('nij,ni->nj', np.linalg.inv(grad+np.eye(3)),norm)
                normal/=np.maximum(np.linalg.norm(normal,axis=1)[:,None],1e-10)
                p['targets'].append({'POSITION':b.accessor(delta(v,k),'VEC3'),
                                     'NORMAL':b.accessor(normal-norm,'VEC3')})
    for name in ('Walk','Run','Cast','Sequence'):
        clip=b.a.actions[name]
        duration=max(float(b.a.acc(s['input']).max()) for s in clip['samplers'])
        steps=round(duration*48); times=np.linspace(0,duration,steps+1)
        legs=[];wrist=[]
        for t in times:
            mat,_=b.a.at(name,t)
            def point(s): return mat(b.a.byname[s])[:3,3]
            legs.append((point('FootL')[2]-point('FootR')[2])/.57)
            wrist.append((point('HandR')-point('Hips'))[0])
        hist=np.arange(len(times))[:,None]-np.arange(4,9)
        hist=hist%steps if name in ('Walk','Run') else np.clip(hist,0,steps)
        delayed=np.asarray(legs)[hist].mean(axis=1); hand=np.asarray(wrist)[hist].mean(axis=1)
        weights=[]
        for i,t in enumerate(times):
            move,cast=progression(name,t*24);swing=np.clip(delayed[i],-1.,1.)*move*.90
            air=move*(.78+.13*abs(delayed[i]))
            if name=='Sequence':
                # The continuous take accelerates before the first full run
                # stride. Open the panels as the real recovering heel rises.
                burst=smooth((t*24-81)/7)*(1-smooth((t*24-148)/13))
                air=max(air,.89*burst)
            if cast:
                gate=smooth((cast-5)/9)*(1-smooth((cast-62)/12))
                swing+=np.clip((hand[i]+.24)*4.,-.9,.9)*gate;air+=.19*gate
            weights.extend((min(1.,air),max(0.,swing),max(0.,-swing)))
        sampler=len(clip['samplers'])
        clip['samplers'].append(dict(input=b.accessor(times,'SCALAR'),output=b.accessor(weights,'SCALAR'),interpolation='LINEAR'))
        clip['channels'].extend(dict(sampler=sampler,target=dict(node=n,path='weights')) for n in nodes)
