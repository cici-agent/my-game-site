from io import BytesIO
import numpy as np
from PIL import Image
from geometry import Threads,unit
from part import line_at,flow_phase,fibre_path
TAU=2*np.pi

def cap_point(a,t,depth=0):
    a,t=np.broadcast_arrays(a,t);c=np.cos(a);s=np.sin(a)
    theta=t*line_at(a)
    n=unit(np.stack([s*np.sin(theta)/.089,np.cos(theta)/.107,c*np.sin(theta)/.113],axis=-1))
    flow,d=flow_phase(a,t)
    micro=.0008*np.sin(92*flow+2.7*d)+.0011*np.sin(33*flow-.9*d)
    lift=.0026*np.sin(np.clip(abs(d)/.30,0,1)*np.pi*.65)*np.maximum(0,np.cos(theta))**.6
    end=np.clip((t-.92)/.08,0,1)*np.maximum(0,c)
    p=np.stack([.0895*s*np.sin(theta),1.616+.107*np.cos(theta),-.009+.113*c*np.sin(theta)],axis=-1)
    p-=n*(.0041*end*end)[...,None]
    return p+n*(micro+lift+depth)[...,None],n

def base_material(b):
    W,H=1408,744;x,y=np.meshgrid(np.arange(W)/W,np.arange(H)/H)
    a=(x-.5)*TAU;t=y;u,d=flow_phase(a,t)
    v=(.125*np.sin(327*u+3.2*d+1.8*np.sin(27*u+2*d))+
       .09*np.sin(651*u+5*d+1.4*np.sin(49*u+.7*d))+
       .065*np.sin(1013*u+2.8*d)+.072*np.sin(61*u-1.5*d))
    rng=np.random.default_rng(883);v+=rng.normal(0,.02,v.shape)
    # A narrow warm trace of scalp can be glimpsed through the roots at the part.
    part=np.exp(-(d/.022)**2)*np.clip(1-(abs(u-.29)/.93)**4,0,1)
    rgb=np.clip(np.array([91,59,42])[None,None,:]*(1+v[...,None])+part[...,None]*np.array([25,15,10]),0,255).astype(np.uint8)
    data=BytesIO();Image.fromarray(rgb).save(data,format='JPEG',quality=95,subsampling=0)
    img=b.append('images',{'name':'Hermione hand-combed chestnut scalp','bufferView':b.view(data.getvalue()),'mimeType':'image/jpeg'})
    tex=b.append('textures',{'source':img});mat=b.mat('Hermione | continuous parted chestnut crown',(1,1,1),.86)
    b.doc['materials'][mat]['pbrMetallicRoughness']['baseColorTexture']={'index':tex}
    return mat
def build_cap(b,bind,shape):
    a=np.linspace(-np.pi,np.pi,151);t=np.linspace(.00001,1,53)
    aa,tt=np.meshgrid(a,t);p,n=cap_point(aa,tt);xyz=p.reshape(-1,3);j,w=bind(xyz);tri=[]
    for k in range(len(t)-1):
        for i in range(len(a)-1):
            q=k*len(a)+i;tri.extend(((q,q+len(a),q+1),(q+1,q+len(a),q+len(a)+1)))
    mat=base_material(b);attrs={'POSITION':xyz,'NORMAL':n.reshape(-1,3),'TEXCOORD_0':np.stack([aa/TAU+.5,tt],-1).reshape(-1,2),'JOINTS_0':j,'WEIGHTS_0':w}
    cap=b.prim(attrs,np.array(tri),mat);shape(cap,xyz);pieces=[cap]
    # Fine, swept, progressively tapered fibres soften the leading edge; transparent cards
    # are avoided on the forehead because their cutoff gives a squared silhouette at close range.
    curves=[Threads() for _ in range(3)];rng=np.random.default_rng(379)
    for sgn in [-1,1]:
        for k in range(360):
            # A single strand bows from the lengthwise part, then wraps around its temple.
            beta=-1.92+(k+rng.uniform(-.43,.43))/359*3.02
            u=np.linspace(0,1,30);start=rng.uniform(.012,.30);end=rng.uniform(1.04,1.42)
            d=sgn*(start+(end-start)*u);aa,tt=fibre_path(beta,d,sgn)
            good=np.flatnonzero(tt<1.008+rng.uniform(-.004,.013))
            if len(good)<4:continue
            aa,tt,u=aa[good],tt[good],np.linspace(0,1,len(good))
            pp,n=cap_point(aa,tt,.0005+.00084*np.sin(np.pi*u));taper=np.maximum(.025,np.sin(np.pi*(.025+.975*u))**.60)
            wid=rng.uniform(.00029,.00079)
            curves[k%3].tube(pp,wid*taper,wid*.5*taper,5,n)
        for i in range(85):
            # Very fine, irregular, side-parted baby hairs disappear softly into the skin.
            az=sgn*(i+rng.uniform(-.4,.4))/85*1.48-.04
            u=np.linspace(0,1,14);t=.89+u*rng.uniform(.119,.165)
            aa=az+sgn*(.075*np.sin(u*1.78)+.024*np.sin(u*2.6+az))
            pp,n=cap_point(aa,t,.0005*np.sin(np.pi*u))
            wid=.00036*(1-.97*u)
            curves[i%3].tube(pp,wid,wid*.62,5,n)
    mats=[b.mat('Hermione | brushed crown '+str(i),color,.81) for i,color in enumerate([(.079,.042,.023),(.123,.067,.036),(.166,.088,.052)])]
    for curve,mat in zip(curves,mats):
        p=curve.prim(b,mat,bind);shape(p,curve.v);pieces.append(p)
    return pieces
