"""Layer the cropped copper crown with curved sections of Ron's strand photograph."""
import numpy as np
from geometry import unit
from ron_hair import line_at,scalp

def add(b,bind,rng):
    source=next(p for p in b.s.primitives(b.s.byname['Portrait']) if b.s.doc['materials'][p['material']]['name']=='ron_combed_hair')
    mat=b.smat(source['material']);mt=b.doc['materials'][mat]
    mt['name']='Ron | layered photographic copper strands';mt['alphaCutoff']=.46
    mt['pbrMetallicRoughness']['baseColorFactor']=[.59,.45,.39,1]
    xyz=[];normal=[];uv=[];faces=[];flex=[]
    for side in (-1,1):
        for j in range(85):
            beta=-2.0+(j+rng.uniform(-.40,.40))*3.44/84
            u=np.linspace(0,1,30)
            distance=rng.uniform(.035,.23)+(rng.uniform(1.27,1.63))*u
            lateral=side*distance
            phase=beta-.23*(1-np.cos(1.76*distance))-.11*np.sin(2.6*beta+2.4*distance)*distance
            # Slightly off-centre part tilted towards the temple. Groups leave
            # the part with a small wave before fanning out towards the ears.
            x0=np.sin(lateral);y0=np.cos(lateral)*np.cos(phase)
            rz=.265;dx=x0*np.cos(rz)-y0*np.sin(rz);dy=x0*np.sin(rz)+y0*np.cos(rz);dz=np.cos(lateral)*np.sin(phase)
            a=np.arctan2(dx,dz);th=np.arccos(np.clip(dy,-1,1))
            mask=np.flatnonzero((th<line_at(a)-rng.uniform(.115,.265))&(dy>-.34))
            if len(mask)<5:continue
            spans=np.split(mask,np.flatnonzero(np.diff(mask)>1)+1);mask=max(spans,key=len)
            if len(mask)<5:continue
            n=len(mask);u=np.linspace(0,1,n);a=a[mask];th=th[mask]
            lof=.00035+.00124*np.sin(np.pi*u)**.9+.00050*np.sin(1.9*np.pi*u+beta)**2
            p,rad=scalp(a,th,lof)
            axis=unit(np.gradient(p,axis=0));ax=unit(np.cross(axis,rad))
            width=rng.uniform(.00167,.00338);profile=(.10+.90*np.sin(np.pi*(.018+.965*u))**.64)*(1-.92*u**7)
            start=len(xyz);col=np.linspace(-1,1,5)
            for k,t in enumerate(u):
                lateral=col*width*profile[k]
                pts=p[k]+ax[k]*lateral[:,None]+rad[k]*(.00075*(1-col**2)*profile[k])[:,None]
                ns=unit(rad[k]+ax[k]*(col*.16)[:,None])
                xyz.extend(pts);normal.extend(ns);uv.extend(np.stack([(1+col)/2,np.full(5,t)],-1));flex.extend([t**2.3*.56]*5)
                if k:
                    for z in range(4):
                        v=start+(k-1)*5+z;faces.extend(((v,v+6,v+5),(v,v+1,v+6)))
    v=np.asarray(xyz);j,w=bind(v);p=b.prim(dict(POSITION=v,NORMAL=normal,TEXCOORD_0=uv,JOINTS_0=j,WEIGHTS_0=w),faces,mat)
    f=np.array(flex);lr=np.tanh(v[:,0]/.04);left=np.c_[.0023*f,.00038*lr*f,.00046*lr*f]
    recoil=np.c_[.00035*lr*f,.0012*f,-.0026*f]
    p['targets']=[dict(POSITION=b.accessor(d,'VEC3')) for d in [left,-left,recoil]]
    return p
