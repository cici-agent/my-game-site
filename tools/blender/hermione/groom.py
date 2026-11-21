"""Chestnut hair groom with a photographic hairline, broad waves and fine corkscrews."""
import numpy as np
from geometry import Threads,unit
from hairline import build_cap
TAU=np.pi*2
TARGETS=('HairSwingLeft','HairSwingRight','HairSettle')

def fitted(v):
    p=v/.966
    # Hair rests behind the shoulder blades at the back, and on the lapels in front.
    p[:,1]-=.009
    weights=np.clip((1.50-p[:,1])/.107,0,1)
    front=np.clip((p[:,2]+.036)/.12,0,1)
    p[:,2]+=.045*weights*(2*front-1)
    return p

def make(b):
    for name in ('HF_Occipital_Crop','HF_Tousled_Fringe_And_Crown'):b.drop(name)
    def bind(v):
        js,w=b.skin(len(v),'Head');t=np.clip((1.525-v[:,1])/.166,0,1)
        w[:,1]=.28*t*t*(3-2*t);w[:,0]=1-w[:,1];js[:,1]=b.joint['Chest']
        return js,w
    def with_shapes(p,v):
        # Harmonic swing falls off through the roots, strongest in the loose tips.
        v=np.array(v);t=np.clip((1.565-v[:,1])/.168,0,1)**1.6;s=np.sign(v[:,0]);q=np.clip((v[:,2]+.16)/.25,0,1)
        left=np.stack([.012*t*(.80+.2*q),.0015*s*t,.002*s*t],axis=1)
        right=np.stack([-.012*t*(.80+.2*q),-.0015*s*t,-.002*s*t],axis=1)
        settle=np.stack([.0025*s*t,.004*t,-.018*t],axis=1)
        p['targets']=[{'POSITION':b.accessor(x,'VEC3')} for x in (left,right,settle)]
    primitives=build_cap(b,bind,with_shapes)
    for original in b.s.primitives(b.s.byname['Portrait']):
        name=b.s.doc['materials'][original['material']]['name']
        if name not in ['hermione_wavy_fibers','hermione_combed_hair']:continue
        d,f=b.data(b.s,original);d['POSITION']=fitted(d['POSITION']);d['JOINTS_0'],d['WEIGHTS_0']=bind(d['POSITION'])
        if name=='hermione_combed_hair':
            pos=d['POSITION'];phi=np.arctan2(pos[:,0],pos[:,2]+.009)
            # Keep the original flowing lower strands and replace the blunt crown cards.
            low=1.569+.041*np.clip((np.abs(phi)-.82)/.77,0,1)
            keep=np.all(pos[f,1]<low[f],axis=1);keep_ids,remap=np.unique(f[keep],return_inverse=True)
            d={k:v[keep_ids] for k,v in d.items()};f=remap.reshape(-1,3)
        mat=b.smat(original['material']);prim=b.prim(d,f,mat);with_shapes(prim,d['POSITION']);primitives.append(prim)
    shades=[(.040,.018,.009),(.066,.028,.013),(.097,.040,.017),(.129,.059,.030)]
    mats=[b.mat('Hermione | chestnut curl '+str(i),c,.62+.05*(3-i)) for i,c in enumerate(shades)]
    curves=[Threads() for _ in mats];rng=np.random.default_rng(45239)
    # The points follow a continuous sweep from the temple across the back to the other temple.
    # Groups of locks share the large S-wave; some separate slightly and curl back at their tips.
    for i in range(79):
        a=.86+(TAU-1.72)*(i+rng.uniform(-.35,.35))/78;side=np.sign(np.sin(a));back=max(0.,-np.cos(a))
        theta=rng.uniform(.79,1.37);phase=3*a+rng.uniform(-.45,.45)
        t=np.linspace(0,1,44);turns=rng.uniform(1.30,1.94);ang=TAU*turns*t+phase
        lateral=np.array([np.sin(a),0,np.cos(a)]);tan=np.array([np.cos(a),0,-np.sin(a)])
        theta0=theta+(1.62-theta)*np.minimum(t*3.1,1)
        fade=np.clip(t*3.8,0,1);amplitude=fade*(.010+rng.uniform(0,.007))
        spread=.023*np.sin(np.pi*t)**.7+.012*t
        basis=np.column_stack([.088*np.sin(a)*np.sin(theta0),1.615+.103*np.cos(theta0),-.009+.112*np.cos(a)*np.sin(theta0)])
        down=rng.uniform(.205,.242)+.031*back
        basis[:,1]-=t*down+(.003*np.cos(ang)*fade)
        basis+=lateral[None,:]*(spread+amplitude*np.sin(ang))[:,None]
        basis+=tan[None,:]*(amplitude*.60*np.cos(ang))[:,None]
        # Keep front pieces over the bust and rear pieces outside the hood.
        shoulder=np.clip((1.514-basis[:,1])/.122,0,1); front=np.clip((np.cos(a)+.25)/.85,0,1)
        basis[:,2]+=(.045*front-.023*(1-front))*shoulder
        if i%6==0:basis[:,1]-=.012*t*t
        taper=(1-.965*t**2.8)*(.58+.42*np.sin(np.pi*(.08+.85*t))**.6)
        # Bundle colour gradients and a few separated fibres produce legible texture at run distance.
        hue=rng.choice([0,1,2],p=[.32,.55,.13]);width=rng.uniform(.0026,.0041)
        curves[hue].tube(basis,width*taper,width*.65*taper,7,lateral)
        for j in range(4):
            strand=basis.copy()
            strand+=((j-1.5)*width*.41*taper)[:,None]*tan[None,:]+((.0015+.0005*np.sin(ang+j))*taper)[:,None]*lateral[None,:]
            curves[int(np.clip(hue+[-1,1,0,1][j],0,3))].tube(strand,.00040*taper,.00032*taper,5,lateral)
    for i,c in enumerate(curves):
        p=c.prim(b,mats[i],bind);with_shapes(p,c.v);primitives.append(p)
    idx=b.mesh('Hermione_Chestnut_Crown_and_Curls',primitives,targets=TARGETS)
    for name,clip in b.a.actions.items():
        n=round(max(float(b.a.acc(s['input'])[-1,0]) for s in clip['samplers'])*24)
        f=np.arange(n+1);times=f/24
        if name in ('Walk','Run','Idle'):
            amp={'Run':.87,'Walk':.50,'Idle':.14}[name]
            swing=amp*np.sin(TAU*f/n)
            settle=amp*(.30+.12*np.cos(2*TAU*f/n)) if name!='Idle' else .04*(1-np.cos(TAU*f/n))
        elif name=='Sequence':
            gain=np.interp(f,[0,32,56,85,100,146,164,189,211,234,249,270,291,312],[0,0,.42,.42,.84,.84,.42,.42,0,0,.40,.34,.92,0])
            swing=gain*np.sin(np.interp(f,[0,32,85,146,211,235,312],np.array([0,0,2.04,5.42,7.92,8.,9.17])*TAU));settle=gain*(.38+.12*np.cos(f*.51))
        else:
            swing=(.61 if name=='Cast' else .42)*np.sin(TAU*f/n*1.5)*np.sin(np.pi*f/n)**2
            settle=(.48 if name=='Cast' else .14)*np.sin(np.pi*f/n)**2
        vals=np.column_stack([np.maximum(swing,0),np.maximum(-swing,0),settle]);vals[-1]=vals[0]
        sample=len(clip['samplers']);clip['samplers'].append({'input':b.accessor(times,'SCALAR'),'output':b.accessor(vals,'SCALAR'),'interpolation':'LINEAR'});clip['channels'].append({'sampler':sample,'target':{'node':idx,'path':'weights'}})
