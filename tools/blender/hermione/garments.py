"""Fitted school uniform, velvet facings, hand-sewn shield, pleats and corded Oxford shoes."""
import numpy as np
from geometry import Threads,unit
from finishing import details,tie_knot,tailor_sleeves,trim_sole
TAU=np.pi*2
def smooth(x):
    t=np.clip(x,0,1)
    return t*t*(3-2*t)

def make(b):
    for n in list(b.a.byname):
        if n.startswith(('Atelier •','Pathfinder_Trousers_')):b.drop(n)
    outfit=b.s.primitives(b.s.byname['Outfit_robe']);body=[];robe=[];lower=[]
    def lower_binding(v):
        x,y=v[:,0],v[:,1];g=np.clip((.97-y)*1.12,0,.64);s=smooth(.5+x/.20)
        js,w=b.skin(len(v),'Hips');js[:,1]=b.joint['ThighL'];js[:,2]=b.joint['ThighR']
        w[:,0]=1-g;w[:,1]=s*g;w[:,2]=(1-s)*g
        return js,w
    def spine(v):
        v=np.asarray(v);f=smooth((v[:,1]-.945)/.19)
        j,w=b.skin(len(v),'Hips');j[:,1]=b.joint['Chest'];w[:,1]=f;w[:,0]=1-f
        return j,w
    def robe_bind(v):
        j,w=spine(v);low=v[:,1]<.94
        a,c=lower_binding(v[low]);j[low]=a;w[low]=c
        return j,w
    for p in outfit:
        name=b.s.doc['materials'][p['material']]['name']
        d,f=b.data(b.s,p);v=d['POSITION']/.966;d['POSITION']=v
        if name!='Fabric_trousers':tailor_sleeves(b,v,d['JOINTS_0'],d['WEIGHTS_0'])
        if name=='Fabric_trousers':
            # Disconnected pleated skirt panel originally weighted rigidly to the pelvis;
            # its hem should travel with the two advancing thighs.
            mask=(d['JOINTS_0'][:,0]==b.joint['Hips'])&(v[:,1]<.985)
            j,w=lower_binding(v[mask]);d['JOINTS_0'][mask]=j;d['WEIGHTS_0'][mask]=w
            lower.append(b.prim(d,f,b.smat(p['material'])))
            continue
        if name in ('Fabric_robe','Fabric_lining','Fabric_edge','Fabric_hood'):
            # A set-in sleeve tapers into the shoulder instead of forming a peak.
            arm=np.where(v[:,0]>0,b.joint['ArmL'],b.joint['ArmR'])
            arm_weight=np.sum(d['WEIGHTS_0']*(d['JOINTS_0']==arm[:,None]),axis=1)
            outer=smooth((np.abs(v[:,0])-.157)/.065)*smooth((v[:,1]-1.32)/.08)*arm_weight
            v[:,1]-=.020*outer
            # Deeper stacked folds in the loose skirt of the gown, tapered to the placket.
            radius=np.sqrt(v[:,0]**2+(v[:,2]+.015)**2)
            a=np.arctan2(v[:,0],v[:,2]+.015);y=v[:,1]
            wave=(.007*np.cos(12*a+.012*y)+.0035*np.cos(7*a-2*y))*smooth((1.08-y)/.53)*smooth((np.abs(a)-.88)/.51)
            nx=v[:,0]/np.maximum(.01,radius);nz=(v[:,2]+.015)/np.maximum(.01,radius)
            v[:,0]+=nx*wave;v[:,2]+=nz*wave
            cut=(y<.885)&(d['WEIGHTS_0'][:,0]>.1)&(np.abs(v[:,0])<.28)
            j,w=lower_binding(v[cut]);d['JOINTS_0'][cut]=j;d['WEIGHTS_0'][cut]=w
            robe.append(b.prim(d,f,b.smat(p['material'])))
        else:
            body.append(b.prim(d,f,b.smat(p['material'])))
    b.mesh('Hermione_Pleated_Skirt_and_Stockings',lower,'pants')
    b.mesh('Hermione_VNeck_Shirt_and_House_Tie',body,'top')
    b.mesh('Hermione_Gryffindor_Robe_and_Hood',robe,'top')
    # Two-sided satin roll and a close line of pick stitches at the velvet facing.
    red=b.mat('Hermione | claret silk piping',(.181,.024,.037),.57);gold=b.mat('Hermione | antique gold thread',(.48,.30,.105),.53,.18)
    nearblack=b.mat('Hermione | graphite pick stitch',(.048,.046,.058),.79)
    dims=np.array([[.395,.289,.189,.94],[.400,.29,.191,.94],[.442,.284,.186,.91],[.56,.263,.173,.87],[.70,.241,.160,.78],[.85,.218,.152,.72],[1.0,.189,.141,.67],[1.146,.186,.145,.64],[1.268,.201,.154,.65],[1.351,.204,.132,.68],[1.390,.18,.104,.68],[1.422,.122,.085,.64],[1.454,.078,.065,.62]])
    def pos(y,a,extra):
        rx=np.interp(y,dims[:,0],dims[:,1]);rz=np.interp(y,dims[:,0],dims[:,2])
        wave=.004*(.6*np.cos(11*a+.8*y)+.33*np.cos(7*a-1.3*y)+.16*np.cos(17*a))
        s=(rx+wave+extra)*np.sin(a);z=-.015+(rz+wave+extra)*np.cos(a)
        fold=(.007*np.cos(12*a+.012*y)+.0035*np.cos(7*a-2*y))*smooth((1.08-y)/.53)*smooth((np.abs(a)-.88)/.51)
        rr=np.sqrt(s*s+(z+.015)**2)
        return np.stack([s+s/rr*fold,y,z+(z+.015)/rr*fold],axis=1)
    trims=Threads();seams=Threads()
    for sign in [-1,1]:
        ys=np.linspace(.4,1.445,82);az=np.interp(ys,dims[:,0],dims[:,3])
        trims.tube(pos(ys,sign*(az+.037),.0052),.0018,.0012)
        for y in np.arange(.408,1.403,.0061):
            ys=np.array([y,y+.0032]);az=np.interp(ys,dims[:,0],dims[:,3]);seams.tube(pos(ys,sign*(az+.059),.0063),.00048)
        # Bottom hem is sewn, with a second row running around each side.
        ang=np.linspace(.955,np.pi,120)*sign
        for h in [.403,.412]:
            seams.tube(pos(np.full_like(ang,h),ang,.006),.0007,.00045)
    b.mesh('Hermione_Corded_Lapels_and_Pick_Stitch',[trims.prim(b,red,robe_bind),seams.prim(b,nearblack,robe_bind)],'top')
    # A cord border, concentric ring and embossed mane follow the small cloth shield.
    emblem=Threads()
    edge=[(-.020,.024),(.018,.024),(.019,.004),(.015,-.010),(.008,-.017),(0,-.024),(-.011,-.017),(-.019,-.009),(-.020,.024)]
    def badge(path,offset=0):
        pts=np.asarray(path)
        return np.column_stack([.137+pts[:,0],1.312+pts[:,1],.1039+.0018-abs(pts[:,0])*.13+offset])
    for s in [1,.91]:emblem.tube(badge(np.array(edge)*s),.00066)
    for i in range(14):
        a=.23+TAU*i/14
        xx=.004+np.cos(a)*.0042;yy=.011+np.sin(a)*.0042
        emblem.tube(badge([(xx,yy),(xx+np.cos(a)*.002,yy+np.sin(a)*.0024)],.001),.00051)
    for yy in np.linspace(-.004,.002,5):
        emblem.tube(badge([(-.0015,yy),(.0038,yy+.003)],.0016),.00041)
    b.mesh('Hermione_Embroidered_Lion_Shield',[emblem.prim(b,gold,spine)],'top')
    details(b,spine);tie_knot(b,spine)
    for side,sign in [('L',1),('R',-1)]:shoe(b,side,sign)

def shoe(b,side,s):
    original=b.a.primitives(b.a.byname['Pathfinder_Boot_'+side]);pieces=[]
    rubber=b.mat('Hermione | cut leather sole',(.021,.017,.016),.85);welt=b.mat('Hermione | burnished welt',(.059,.036,.024),.57)
    leather=b.mat('Hermione | polished oxford leather',(.025,.016,.014),.37)
    lace=b.mat('Hermione | fine waxed laces',(.045,.030,.025),.70);brass=b.mat('Hermione | dark brass eyelets',(.14,.085,.041),.43,.54)
    stitches=b.mat('Hermione | brown shoe stitching',(.126,.078,.048),.72)
    def bind(v):return b.skin(len(v),'Foot'+side)
    for p in original:
        m=b.a.doc['materials'][p['material']]['name']
        if m not in ['Atelier / sole','Atelier / edge']:continue
        d,f=b.data(b.a,p);keep=(d['POSITION'][f,1].max(axis=1)<.042)
        if not np.any(keep):continue
        ix,ind=np.unique(f[keep],return_inverse=True);pieces.append(b.prim({k:v[ix] for k,v in d.items()},ind.reshape(-1,3),rubber if m.endswith('sole') else welt))
    xc=s*.109
    pr=np.array([[.029,.061,.065,.153,.13],[.039,.059,.065,.153,.128],[.054,.058,.061,.150,.123],[.065,.056,.055,.143,.119],[.076,.054,.046,.130,.11],[.09,.051,.032,.112,.101],[.108,.048,.014,.092,.08],[.125,.045,.002,.074,.062],[.145,.041,-.003,.060,.059]])
    def shoe_at(a,y,d=0):
        w,zc,front,back=[np.interp(y,pr[:,0],pr[:,k]) for k in range(1,5)]
        c=np.cos(a);sn=np.sin(a)
        return np.stack([xc+(w+d)*(1+.12*c)*np.sign(sn)*np.abs(sn)**.82,y,zc+(np.where(c>0,front,back)+d)*np.sign(c)*np.abs(c)**.9],axis=-1)
    a=np.linspace(0,TAU,73)
    top=.129-.024*(1-np.cos(a))*.5
    q=np.linspace(0,1,28);aa=np.broadcast_to(a,(len(q),len(a)));yy=.029+(top[None,:]-.029)*q[:,None]
    v=shoe_at(aa,yy);norm=unit(np.cross(np.gradient(v,axis=1),np.gradient(v,axis=0)));tris=[]
    for i in range(len(q)-1):
        for j in range(len(a)-1):
            k=i*len(a)+j;tris.extend(((k,k+1,k+len(a)),(k+1,k+1+len(a),k+len(a))))
    xyz=v.reshape(-1,3);js,w=bind(xyz)
    pieces.append(b.prim(dict(POSITION=xyz,NORMAL=norm.reshape(-1,3),JOINTS_0=js,WEIGHTS_0=w),np.array(tris),leather))
    lines=Threads();eye=Threads();seam=Threads()
    lines.tube(shoe_at(a,top,.0005),.00173,.00135)
    # Parallel waxed laces over closed quarters; the arched portion sits on the vamp.
    for y in [.081,.090,.099,.108,.117]:
        for side_sign in [-1,1]:
            aa=np.linspace(0,TAU,14);center=shoe_at(side_sign*.44,y,.0012)
            eye.tube(center+np.column_stack([.0023*np.cos(aa),.0019*np.sin(aa),.0009*np.sin(aa)]),.00062)
        aa=np.linspace(-.43,.43,15);ys=np.linspace(y-.002,y+.002,15)
        lines.tube(shoe_at(aa,ys,.0021+np.cos(aa*2)*.0005),.00122,.001)
    for g in [-1,1]:
        a=np.linspace(.49,1.52,32)*g;seam.tube(shoe_at(a,.117-np.linspace(0,.052,len(a)),.0011),.00076)
    a=np.linspace(-1.08,1.08,41);seam.tube(shoe_at(a,.058+.008*np.cos(a),.00075),.00062)
    pieces.extend([lines.prim(b,lace,bind),eye.prim(b,brass,bind),seam.prim(b,stitches,bind)])
    trim_sole(b,pieces,xc)
    b.mesh('Hermione_Oxford_'+side,pieces,'shoes',node=b.a.byname['Pathfinder_Boot_'+side])
