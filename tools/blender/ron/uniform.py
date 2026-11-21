"""Fit Ron's own school wardrobe onto the high-detail student rig in its neutral scale."""
import argparse
import sys
from pathlib import Path
import numpy as np

# Installed in game/tools/blender/ron, alongside the shared academy geometry library.
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'hermione'))
from geometry import Builder, Threads
from finishing import shell, tailor_sleeves
from cloth import smooth
from ron_shoes import make_shoe
from ron_cloth import make as animate_robe

TAU=2*np.pi
ROBE_DIMS=np.array([[.395,.289,.189,.94],[.400,.29,.191,.94],[.442,.284,.186,.91],
    [.56,.263,.173,.87],[.70,.241,.160,.78],[.85,.218,.152,.72],[1.,.189,.141,.67],
    [1.146,.186,.145,.64],[1.268,.201,.154,.65],[1.351,.204,.132,.68],[1.390,.18,.104,.68],
    [1.422,.122,.085,.64],[1.454,.078,.065,.62]])


def robe_folds(v):
    x,y,z=v.T
    a=np.arctan2(x,z+.015)
    amount=smooth((1.10-y)/.56)*smooth((abs(a)-.83)/.48)
    rhythm=.007*np.cos(12*a+.33*y)+.004*np.cos(7*a-2.6*y)
    radius=np.maximum(.0001,np.hypot(x,z+.015))
    # Set the tail slightly further behind his calves and carry each side vent outwards.
    flank=smooth((abs(a)-.68)/.22)*smooth((1.59-abs(a))/.40)*smooth((.91-y)/.19)
    back=smooth((-z-.07)/.08)*smooth((.59-y)/.19)
    seat=.013*np.exp(-((y-.85)/.13)**2)*np.sin(a)**4
    return np.stack((x/radius*(rhythm+.020)*amount+np.sign(x)*(.024*flank+seat),
                     -.004*np.cos(4*a)*amount,
                     (z+.015)/radius*(rhythm+.019)*amount+.015*flank-.048*back),axis=1)


def lapel(y,a,gap):
    x,z=[np.interp(y,ROBE_DIMS[:,0],ROBE_DIMS[:,i]) for i in (1,2)]
    wave=.004*(.6*np.cos(11*a+.8*y)+.33*np.cos(7*a-1.3*y)+.16*np.cos(17*a))
    v=np.stack(((x+wave+gap)*np.sin(a),y,-.015+(z+wave+gap)*np.cos(a)),axis=-1)
    return v+robe_folds(v)


class Fit:
    def __init__(self,b): self.b=b
    def spine(self,v):
        f=smooth((v[:,1]-.945)/.19)
        j,w=self.b.skin(len(v),'Hips')
        j[:,1]=self.b.joint['Chest'];w[:,0]=1-f;w[:,1]=f
        return j,w
    def robe(self,v):
        j,w=self.spine(v);low=v[:,1]<.945
        x,y=v[low,0],v[low,1]
        g=.88*smooth((.951-y)/.45)
        side=smooth(.5+x/.23)
        j[low,0]=self.b.joint['Hips']
        j[low,1]=self.b.joint['ThighL'];j[low,2]=self.b.joint['ThighR']
        w[low,0]=1-g;w[low,1]=g*side;w[low,2]=g*(1-side)
        return j,w


def robe_details(b,fit,m):
    cord,stitches,pockets=Threads(),Threads(),Threads()
    for s in [-1,1]:
        ys=np.linspace(.399,1.447,78)
        angle=np.interp(ys,ROBE_DIMS[:,0],ROBE_DIMS[:,3])
        cord.tube(lapel(ys,s*(angle+.032),.0051),.0019,.0013)
        for h in np.arange(.409,1.413,.009):
            ys=np.array([h,h+.0049]);angle=np.interp(ys,ROBE_DIMS[:,0],ROBE_DIMS[:,3])
            stitches.tube(lapel(ys,s*(angle+.061),.0055),.00052,.00040,5)
        a=s*np.linspace(.96,np.pi,116)
        for h in [.402,.411]:
            stitches.tube(lapel(np.full_like(a,h),a,.0045),.00085,.00057)
        ys=np.linspace(.888,1.022,23);aa=s*np.linspace(1.32,1.16,23)
        pockets.tube(lapel(ys,aa,.0035),.0030,.0015)
        for i in (0,3,6,9,12,15,18,21):
            stitches.tube(lapel(ys[i:i+2],aa[i:i+2],.0052),.00056,.00048)
    return b.mesh('Ron_Lapel_and_Hem',[cord.prim(b,m['wine'],fit.robe),stitches.prim(b,m['graphite'],fit.robe),
                      pockets.prim(b,m['welt-pocket'],fit.robe)],'top')


def hood_and_crest(b,fit,m):
    a=np.linspace(-1.57,1.57,67)[None,:];t=np.linspace(0,1,28)[:,None]
    c,s=np.cos(a),np.sin(a)
    pleat=np.sin(np.pi*t)*(.006*np.sin(7*a+3*t)+.004*np.cos(12*a-1.5*t))
    yy=1.433-.061*t-.164*(t**1.67)*c**2.7-.015*(1-c)+.004*np.sin(2.4*a)*t
    zz=-.017-(.057+.127*(1-np.exp(-4.6*t))+.017*np.sin(np.pi*t)*c+pleat)*c
    hood=np.stack(((.069+.115*t)*s+.002*np.sin(3*a)*t,yy,zz),axis=-1)
    fold=hood[-1]-hood[-4];fold/=np.maximum(np.linalg.norm(fold,axis=1)[:,None],1e-9)
    lip=np.stack((hood[-4]+[0,0,-.0014],hood[-1]+[0,-.0003,-.0015],hood[-1]+fold*.0023+[0,.0004,.001]))
    cords,stitch=Threads(),Threads()
    cords.tube(hood[-1],.0023,.0019)
    stitch.tube(hood[:,33]+[0,0,-.0011],.00125,.00078)
    for k in [14,52]:
        stitch.tube(hood[:,k]+[0,0,-.0010],.00083,.0006)
    # The inner shoulder yoke closes the space between the neck and the hood.
    neck=np.stack((.046*np.sin(a[0]),1.446-.013*(1-c[0]),-.012-.040*c[0]),axis=1)
    yoke=(1-t[:,:,None])*neck[None,:,:]+t[:,:,None]*hood[0][None,:,:]
    b.mesh('Ron_Lined_Hood',[shell(b,yoke,m['Fabric_robe'],fit.spine,True),shell(b,hood,m['Fabric_robe'],fit.spine,True),
           shell(b,lip,m['Fabric_lining'],fit.spine,True),cords.prim(b,m['wine'],fit.spine),
           stitch.prim(b,m['graphite'],fit.spine)],'top')
    # The original heraldic plate is a split-rampant lion: catch the raised silhouette
    # with old gold couching, short directional mane stitches and a knotted eye.
    border,mane=Threads(),Threads()
    outline=np.array([[-.021,.025],[.019,.025],[.020,.004],[.016,-.010],[.008,-.017],
                      [0,-.026],[-.012,-.018],[-.020,-.009],[-.021,.025]])
    def badge(xy,offset=0):
        xy=np.asarray(xy)
        return np.column_stack((.137+xy[:,0],1.312+xy[:,1],.1040-abs(xy[:,0])*.13+offset))
    for scale in [.99,.89]:border.tube(badge(outline*scale),.0007,.00048)
    for h in np.linspace(-.008,.004,8):
        mane.tube(badge([[-.004,h],[.003,h+.004]],.00075),.00046,.00035)
    for aa in np.linspace(.38,5.47,13):
        c=np.array([.0035,.0122]);u=np.array([np.cos(aa),np.sin(aa)])
        mane.tube(badge([c+.0036*u,c+.0064*u],.00095),.00049,.00038)
    border.tube(badge([[-.007,.007],[-.011,.014],[-.009,.018],[-.0075,.017]],.0008),.00063)
    b.mesh('Ron_Embroidered_Crest',[border.prim(b,m['braid'],fit.spine),mane.prim(b,m['gold'],fit.spine)],'top')


def school_tie(b,fit,m):
    a=np.linspace(0,TAU,41);rows=[]
    for y,r,h,z in [(1.386,.008,.003,.098),(1.397,.011,.0036,.095),
                    (1.407,.009,.004,.092),(1.413,.010,.0047,.090),
                    (1.420,.013,.005,.0875),(1.430,.015,.0052,.084),
                    (1.435,.0122,.0046,.0802),(1.438,.0086,.004,.077)]:
        x=-.0027+r*np.sin(a)+.0008*np.sin((y-1.38)*75)
        rows.append(np.stack((x,np.full_like(a,y),z+h*np.cos(a)-.00165*np.maximum(np.cos(a),0)*
                              np.exp(-((x+.0026)/.0025)**2)),axis=1))
    gold=Threads();aa=np.linspace(-1.58,1.58,32)
    for y,z,rad in [(1.4230,.0868,.0134),(1.4261,.0857,.0145)]:
        gold.tube(np.stack((-.0024+rad*np.sin(aa),y+.0021*np.sin(aa),z+.0051*np.cos(aa)-.0015*np.sin(aa)),axis=1),
                  .00065,.00041)
    b.mesh('Ron_Four_In_Hand_Knot',[shell(b,rows,m['Fabric_tie'],fit.spine),gold.prim(b,m['gold'],fit.spine)],'top')


def dress(b):
    for name in list(b.a.byname):
        if name.startswith(('Atelier •','Pathfinder_Trousers_')): b.drop(name)
    ib=lambda a: np.linalg.inv(a.acc(a.doc['skins'][0]['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1))
    ratio=ib(b.s)[list(b.source_joints).index(b.joint['Hips']),1,3]/ib(b.a)[b.joint['Hips'],1,3]
    fit=Fit(b); groups={'pants':[],'shirt':[],'robe':[]}
    names={};arm_ids=[b.joint[n+s] for n in ('Arm','Forearm','Hand') for s in 'LR']
    for p in b.s.primitives(b.s.byname['Outfit_robe']):
        name=b.s.doc['materials'][p['material']]['name'];mid=b.smat(p['material']);names[name]=mid
        if name=='Fabric_hood': continue
        d,f=b.data(b.s,p);v=d['POSITION']/ratio;j,w=d['JOINTS_0'],d['WEIGHTS_0']
        arm=(w*np.isin(j,arm_ids)).sum(axis=1)
        if name in ('Fabric_trousers','Fabric_pantSeam'):
            x,y,z=v.T.copy(); ankle=smooth((.23-y)/.116)
            center=.109*np.sign(x)
            # The waistband sits under the ribbed jumper. Take it in eight
            # millimetres at each side so the lowered left cuff passes freely.
            waist=.008*smooth((y-.90)/.055)*smooth((abs(x)-.095)/.055)
            v[:,0]=center+(x-center)*(1+.11*ankle)-np.sign(x)*waist
            v[:,2]=z*(1+.10*ankle)
            v[:,1]-=.014*ankle+.0030*ankle*np.cos(np.arctan2(x-center,z)+.6*np.sign(x))
            # Matching blended weights across the sewn centre rise keep the two
            # trouser panels joined when a leg steps sideways.
            rise=y>.738
            wx=smooth(.5+x[rise]/.145)
            thigh=1-smooth((y[rise]-.764)/.16)
            near=smooth((y[rise]-.738)/.027)*(1-smooth((abs(x[rise])-.036)/.066))
            if np.any(near>0):
                old_hips=(w[rise]*(j[rise]==b.joint['Hips'])).sum(axis=1)
                old_l=(w[rise]*(j[rise]==b.joint['ThighL'])).sum(axis=1)
                old_r=(w[rise]*(j[rise]==b.joint['ThighR'])).sum(axis=1)
                w[rise]=0
                w[rise,0]=(1-near)*old_hips+near*(1-thigh)
                w[rise,1]=(1-near)*old_l+near*thigh*wx
                w[rise,2]=(1-near)*old_r+near*thigh*(1-wx)
                j[rise,0]=b.joint['Hips'];j[rise,1]=b.joint['ThighL'];j[rise,2]=b.joint['ThighR']
            group='pants'
        else:
            tailor_sleeves(b,v,j,w)
            # Discard the two original floating hood cords. Rebuild these edges
            # as connected, lined cloth underneath the neck.
            if name in ('Fabric_lining','Fabric_edge'):
                c=v[f].mean(axis=1)
                if name=='Fabric_lining':
                    f=f[~((c[:,1]>1.424)&(c[:,2]<.026))]
                else:
                    az=np.linspace(-np.pi*.59,np.pi*.59,201)
                    sag=np.maximum(0,(np.cos(az)+.28)/1.28)
                    ring=np.stack((.176*np.sin(az),1.375-.187*sag**4-.018*(1-sag),-.012-.135*np.cos(az)),axis=1)
                    near=np.min(np.sum((c[:,None,:]-ring[None,:,:])**2,axis=2),axis=1)<.007**2
                    f=f[~near]
            if name in ('Fabric_robe','Fabric_lining','Fabric_edge'):
                skirt=(v[:,1]<1.1)&(arm<.002)
                v[skirt]+=robe_folds(v[skirt])
                # A student carries the loose sleeve and cuff with the hand even
                # when it falls below the waist of the gown.
                low=(v[:,1]<.95)&(arm<.002)
                j[low],w[low]=fit.robe(v[low])
                top=smooth((abs(v[:,0])-.155)/.065)*smooth((v[:,1]-1.32)/.08)*arm
                v[:,1]-=.019*top
                group='robe'
            else:
                if name in ('Fabric_knit','Fabric_rib','Fabric_tie','Fabric_gold'):
                    cap=smooth((v[:,1]-1.29)/.065)*arm
                    v[:,1]-=.046*cap
                    v[:,0]-=.005*np.sign(v[:,0])*cap
                    v[:,2]*=1-.07*cap
                if name in ('Fabric_tie','Fabric_gold'):
                    tie=(abs(v[:,0])<.020)&(v[:,1]>1.27)&(v[:,1]<1.42)&(v[:,2]>.075)
                    v[tie,0]-=.0027+.0009*np.sin((v[tie,1]-1.27)*18)
                group='shirt'
        d['POSITION']=v;groups[group].append(b.prim(d,f,mid))
    b.mesh('Ron_School_Trousers',groups['pants'],'pants')
    b.mesh('Ron_VNeck_Shirt_and_Tie',groups['shirt'],'top')
    robe=b.mesh('Ron_Gryffindor_Robe',groups['robe'],'top')
    for key,color,rough,metal in [
        ('wine',(.205,.031,.047),.50,0),('graphite',(.066,.064,.073),.81,0),
        ('welt-pocket',(.026,.024,.034),.86,0),('braid',(.37,.214,.071),.54,.23),
        ('gold',(.57,.37,.14),.52,.16),('sole',(.018,.015,.014),.83,0),
        ('welt',(.058,.035,.022),.67,0),('leather',(.031,.021,.018),.43,0),
        ('quarter',(.035,.023,.020),.38,0),('lace',(.038,.029,.025),.76,0),
        ('edge',(.022,.017,.014),.58,0),('eyelet',(.120,.082,.05),.44,.52),
        ('stitch',(.115,.076,.052),.70,0)]:
        names[key]=b.mat('Ron | '+key,color,rough,metal)
    # Softer school cloth, slightly satin silk and a dull claret velvet facing.
    for name,rough in [('Fabric_tie',.62),('Fabric_lining',.73),('Fabric_shirt',.82)]:
        b.doc['materials'][names[name]]['pbrMetallicRoughness']['roughnessFactor']=rough
    trim=robe_details(b,fit,names)
    hood_and_crest(b,fit,names)
    school_tie(b,fit,names)
    for side in 'LR': make_shoe(b,side,names)
    animate_robe(b,[robe,trim])


def build(high_rig,ordinary,output):
    b=Builder(high_rig,ordinary)
    dress(b);b.save(output)


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('high_rig');p.add_argument('ordinary');p.add_argument('output')
    a=p.parse_args();build(a.high_rig,a.ordinary,a.output)
