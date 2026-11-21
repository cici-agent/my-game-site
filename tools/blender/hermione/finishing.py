"""Tailoring details which stay readable from both gameplay and close-up views."""
import numpy as np
from geometry import Threads,unit

def shell(b,rows,mat,binder,invert=False):
    xyz=np.asarray(rows);m,n=xyz.shape[:2]
    normal=unit(np.cross(np.gradient(xyz,axis=1),np.gradient(xyz,axis=0)))
    v=xyz.reshape(-1,3);j,w=binder(v)
    f=[]
    for i in range(m-1):
        for k in range(n-1):
            a=i*n+k;f.extend(((a,a+1,a+n),(a+1,a+1+n,a+n)))
    f=np.asarray(f)
    if invert:normal=-normal;f=f[:,::-1]
    uv=np.stack(np.broadcast_arrays(np.linspace(0,1,n)[None,:],np.linspace(0,1,m)[:,None]),axis=-1)
    return b.prim(dict(POSITION=v,NORMAL=normal.reshape(-1,3),TEXCOORD_0=uv.reshape(-1,2),JOINTS_0=j,WEIGHTS_0=w),f,mat)
def details(b,spine):
    materials={m['name']:i for i,m in enumerate(b.doc['materials'])}
    # Hood gathers at the shoulders, droops at its centre back and turns out to reveal its facing.
    a=np.linspace(-1.43,1.43,69);t=np.linspace(0,1,27)[:,None]
    c=np.cos(a)[None,:];s=np.sin(a)[None,:]
    droop=np.maximum(c,0)**2.2
    xx=(.088+.096*t)*s+0*t
    yy=1.455-.067*t-(.178*t**1.6+.009*np.sin(np.pi*t))*droop-.016*(1-c)
    depth=.079+.099*(1-np.exp(-t*5.5))+.030*np.sin(np.pi*t)*droop
    pleats=.008*np.sin(5.5*a+2*t)*np.sin(np.pi*t)**.7+.0038*np.sin(11*a+1.7*t)*np.sin(np.pi*t)
    zz=-.021-(depth+pleats)*c
    hood=np.stack([xx,yy,zz],axis=-1)
    upper=hood[0].copy(); lip=hood[-1].copy()
    face=materials.get('Fabric_robe');lining=materials['Fabric_lining'];piping=materials['Hermione | claret silk piping']
    stitch=materials['Hermione | graphite pick stitch'];edgelines=Threads();seams=Threads()
    edgelines.tube(lip,.0028,.0023);edgelines.tube(upper,.0028)
    seams.tube(hood[:,len(a)//2]+[0,0,-.0012],.00095,.0006)
    for j in [13,55]:
        seams.tube(hood[:,j]+np.array([0,0,-.0012]),.00082)
    rolled=np.stack([hood[-4]+[0,0,-.0015],lip+[0,-.0005,-.0014],lip+[0,-.0018,.0008]])
    seams.tube(hood[-3]+[0,0,-.0018],.00064,.0005)
    b.mesh('Hermione_Lined_Cowl_and_Back_Yoke',[shell(b,hood,face,spine,True),shell(b,rolled,lining,spine,True),edgelines.prim(b,piping,spine),seams.prim(b,stitch,spine)],'top')
    # Knitted stockings extend through the topline of the shoes, even while the ankle plantarflexes.
    tights=materials['Fabric_trousers'];tau=2*np.pi
    stockings=[]
    for side,sg in [('L',1),('R',-1)]:
        angles=np.linspace(0,tau,49)
        rings=[]
        for y,r,depth,centerz in [(.061,.030,.034,.015),(.086,.034,.039,.008),(.114,.041,.045,.001),(.139,.041,.046,-.002),(.161,.041,.047,-.006),(.218,.044,.050,-.007)]:
            rings.append(np.column_stack([sg*.111+r*np.sin(angles),np.full_like(angles,y),centerz+depth*np.cos(angles)]))
        def sock_bind(v):
            j,w=b.skin(len(v),'Foot'+side);j[:,1]=b.joint['Shin'+side];strength=np.clip((v[:,1]-.069)/.115,0,1);w[:,1]=strength;w[:,0]=1-strength;return j,w
        stockings.append(shell(b,rings,tights,sock_bind))
    b.mesh('Hermione_Knitted_Ankles',stockings,'pants')

def tie_knot(b,spine):
    # A four-in-hand knot with a curved face and a dimple just below the fold.
    mats={m['name']:i for i,m in enumerate(b.doc['materials'])}
    a=np.linspace(0,np.pi*2,39);rows=[]
    for y,h,dep,cz in [(1.383,.009,.003,.098),(1.400,.0115,.0033,.095),(1.410,.009,.004,.091),
                      (1.417,.008,.0048,.088),(1.423,.010,.005,.086),(1.435,.015,.0055,.081),
                      (1.439,.014,.005,.078),(1.443,.009,.004,.075)]:
        center=.001*np.sin((y-1.386)*52)
        x=center+h*np.sin(a)
        rows.append(np.stack([x,np.full_like(a,y),cz+dep*np.cos(a)-.0018*np.exp(-((x+.0004)/.0027)**2)*np.maximum(np.cos(a),0)],axis=1))
    gold=Threads()
    for y0 in (1.397,1.4336):
        aa=np.linspace(-1.55,1.55,24);y=y0+.0019*np.sin(aa)
        r=.011 if y0<1.4 else .014;zx=.096 if y0<1.4 else .08125
        gold.tube(np.stack([r*np.sin(aa),y,zx+.005*np.cos(aa)-.003*np.sin(aa)],1),.00058,.00036)
    b.mesh('Hermione_Silk_Tie_Knot',[shell(b,rows,mats['Fabric_tie'],spine),gold.prim(b,mats['Fabric_gold'],spine)],'top')

def tailor_sleeves(b,v,joints,weights):
    # Reshape the sleeve in a plane normal to the arm. It follows the bent forearm,
    # keeping the sleeve opening clear of the wrist, irrespective of the arm's angle.
    bindmat=np.linalg.inv(b.a.acc(b.doc['skins'][0]['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1))
    for side in 'LR':
        ids=[b.joint[k+side] for k in ('Arm','Forearm','Hand')]
        strength=np.clip(sum((weights*(joints==j)).sum(1) for j in ids),0,1)
        if strength.max()<.001:continue
        p,e,h=[bindmat[j,:3,3] for j in ids]
        upper=e-p;low=h-e
        t1=np.clip(((v-p)@upper)/(upper@upper),0,1)
        t2=np.clip(((v-e)@low)/(low@low),0,1)
        q1=p+t1[:,None]*upper;q2=e+t2[:,None]*low
        lower=np.linalg.norm(v-q2,axis=1)<np.linalg.norm(v-q1,axis=1)
        center=np.where(lower[:,None],q2,q1);rel=v-center
        t=np.where(lower,1+t2,t1)
        phi=np.arctan2(rel[:,0],rel[:,2]);fold=.038*np.cos(5*phi+5.8*t)*np.exp(-((t-1.)/.45)**2)
        shrink=.115+.11*np.clip((t-1.2)/.8,0,1)+.045*np.exp(-((t-.01)/.27)**2)-fold
        v-=(strength*shrink)[:,None]*rel
        # Set-in cloth turns into the shoulder down a gently curving line.
        v[:,1]-=strength*.010*np.exp(-(t/.30)**2)*np.clip((abs(v[:,0])-.16)/.036,0,1)

def trim_sole(b,pieces,cx):
    for p in pieces:
        acc=b.doc['accessors'][p['attributes']['POSITION']];view=b.doc['bufferViews'][acc['bufferView']]
        v=np.frombuffer(b.bin,dtype='<f4',count=acc['count']*3,offset=view['byteOffset']).reshape(-1,3)
        y=v[:,1].copy();t=np.clip((y-.006)/.021,0,1);t=t*t*(3-2*t)
        v[:,0]=cx+(v[:,0]-cx)*(1-.155*t)
        v[:,2]-=.014*np.clip((v[:,2]-.096)/.112,0,1)*t
        v[:,1]=.0035+(y-.0035)*(.70+.12*np.clip((y-.067)/.065,0,1))
        acc['min']=v.min(0).tolist();acc['max']=v.max(0).tolist()
