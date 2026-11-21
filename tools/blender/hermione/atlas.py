"""Register Hermione's own portrait to the expression rig, including the free lid and lip margins."""
import json
import numpy as np
from PIL import Image, ImageFilter

def read_landmarks(repo):
    data=json.loads((repo/'art/textures/characters/face_landmarks.json').read_text())['faces']
    result={name:np.asarray(data[name])[:468].copy() for name in ('harry','hermione')}
    result['hermione'][:,0]-=724
    return result

# The base rig uses these pixel coordinates on its registered 724px portrait.
old_eyes={'R': (237.5, 331.5, [340, 333.3, 326.2, 321.2, 319.4, 319.6, 321.2, 326.5, 332.5, 338.7, 343.5], [340, 340.7, 344.6, 348.2, 350.1, 350.2, 349.4, 347.0, 345.4, 345.1, 343.5]), 'L': (424.0, 519.0, [342.6, 336.5, 330.7, 324.5, 319.8, 317.8, 317.8, 320.2, 326.0, 332.1, 340.4], [342.6, 344.1, 344.5, 345.9, 347.7, 348.6, 348.5, 347.1, 344.6, 340.4, 340.4])}
eyes={'R':(218.,319.,[354,350,344,340,337,336,337,339,344,351,360],
                        [354,355,359,362,364,365.3,365.1,364,363,362,360]),
      'L':(417.,513.,[358,347,342,336,333.5,332.8,334,337,343,348,351.8],
                        [358,359,359,360.5,361.6,361.7,360.5,358.8,355.7,354.4,351.8])}
def ramp(t):
    t=np.clip(t,0,1);return t*t*(3-2*t)

def weights(a,b):
    x=a[:,None]-b[None,:]
    r=(x*x).sum(-1)
    return r*np.log(np.maximum(1e-16,r))*.5

def warp_atlas(repo, atlas_dir, points):
    src,dst=points['harry'][:,:2],points['hermione'][:,:2]
    # The detector estimates an eye region. Use the visible wet margins and lip seam
    # for the mechanically closing pieces; pin the cheek and nose with registered landmarks.
    mouth=(src[:,0]>301)&(src[:,0]<463)&(abs(src[:,1]-538)<12)
    near_eye=((abs(src[:,0]-286)<58)|(abs(src[:,0]-472)<58))&(abs(src[:,1]-335)<23)
    keep=~(mouth|near_eye);s=list(src[keep]);d=list(dst[keep])
    for k in eyes:
        for si,di in zip(old_eyes[k][2:],eyes[k][2:]):
            for j in range(11):
                if j in (0,10) and si is old_eyes[k][3]:continue
                s.append((np.interp(j,[0,10],old_eyes[k][:2]),si[j]))
                d.append((np.interp(j,[0,10],eyes[k][:2]),di[j]))
    for j,(h,e) in enumerate(zip([540.,540.,537.2,536.1,537.2,537.1,534.9,535.9,538.2,538.1],
                                  [554,555,553.4,550.8,550.1,550.8,549.6,549.8,551,550.6])):
        s.append((310+j*147/9,h));d.append((294+j*156/9,e))
    for y in [0,180,360,550,723]:
        for x in [0,723]:
            s.append((x,y));d.append((x,y))
    for x in [180,360,550]:
        for y in [0,723]:
            s.append((x,y));d.append((x,y))
    s=np.array(s);d=np.array(d)
    s/=724;d/=724
    P=np.c_[np.ones(len(s)),s]
    T=np.block([[weights(s,s)+3e-7*np.eye(len(s)),P],[P.T,np.zeros((3,3))]])
    conf=np.linalg.solve(T,np.vstack([d-s,np.zeros((3,2))]))
    res=182;yy,xx=np.mgrid[0:res,0:res]
    grid=np.stack([xx,yy],-1).reshape(-1,2)/(res-1)
    dis=np.vstack([weights(g,s)@conf[:-3]+np.c_[np.ones(len(g)),g]@conf[-3:] for g in np.array_split(grid,40)])*724
    dis=dis.reshape(res,res,2)
    yy,xx=np.mgrid[:724,:724]
    pos=np.stack([xx,yy],-1)+np.stack([np.array(Image.fromarray(dis[:,:,k].astype('f')).resize((724,724),Image.Resampling.BICUBIC)) for k in range(2)],-1)
    # Use the same filtering for eye, lip, and skin so the three painted surfaces join.
    photo=np.asarray(Image.open(repo/'art/textures/characters/hermione_skin.jpg').convert('RGB')).astype(float)
    pos=np.clip(pos,0,722.9999);lo=pos.astype(int);fr=pos-lo;x,y=lo.transpose(2,0,1);u,v=fr.transpose(2,0,1)
    rgba=(photo[y,x]*(1-u)[:,:,None]+photo[y,x+1]*u[:,:,None])*(1-v)[:,:,None]+(photo[y+1,x]*(1-u)[:,:,None]+photo[y+1,x+1]*u[:,:,None])*v[:,:,None]
    # The lip seam on the photograph would remain visible when the jaw opens.
    # Lift its dark ink from the vermilion, reserving occlusion for the real slit.
    photo_registered=rgba.copy()
    luma=rgba@np.array([.22,.64,.14])
    for x in range(305,462):
        expected=np.interp(np.clip((x-310)/147,0,1),np.linspace(0,1,10),
                    [540,540,537.2,536.1,537.2,537.1,534.9,535.9,538.2,538.1])
        lo=int(expected)-4;hi=int(expected)+5
        y0=lo+np.argmin(luma[lo:hi,x])
        lateral=ramp((x-305)/9)*ramp((461-x)/9)
        for y in range(y0-7,y0+8):
            v=(y-y0+7)/14
            swatch=(1-v)*photo_registered[y0-7,x]+v*photo_registered[y0+7,x]
            dark=max(0.,(swatch-photo_registered[y,x])@np.array([.22,.64,.14]))
            lift=ramp((7.-abs(y-y0))/3.3)*lateral*ramp(dark/9)
            # Leave the underlying lip colour and fine creases away from the seam.
            rgba[y,x]+=np.maximum(0,swatch-photo_registered[y,x])*lift
    # At the outer corner only, the sparse lower lashes sit both on the fixed
    # photograph and on the lip of the moving lid. Reduce the redundant fixed
    # strokes without touching the mobile upper or the iris contrast.
    gently=np.asarray(Image.fromarray(np.uint8(np.clip(rgba+.5,0,255))).filter(ImageFilter.GaussianBlur(2.3))).astype(float)
    for side,(lo,hi,top,bottom) in old_eyes.items():
        for x in range(int(lo),int(hi)+1):
            u=np.clip((x-lo)/(hi-lo),0,1);outer=(1-u) if side=='R' else u
            lid_floor=np.interp(u,np.linspace(0,1,len(bottom)),bottom)
            for y in range(int(lid_floor),int(lid_floor)+12):
                below=y-lid_floor
                w=.72*ramp((outer-.56)/.29)*ramp(below/2.5)*ramp((11-below)/4)
                rgba[y,x]+=np.maximum(0,gently[y,x]-rgba[y,x])*w
    out=Image.fromarray(np.uint8(np.clip(rgba+.5,0,255)))
    out.save(atlas_dir/'hermione-registered.png',optimize=True)
    # Only optical micro-relief, excluding the lips and eyes to retain their glossy materials.
    lum=np.asarray(out.convert('L'),float)/255.
    detail=np.clip(lum-np.asarray(out.convert('L').filter(ImageFilter.GaussianBlur(1.4)),float)/255.,-.035,.035)
    mask=ramp((yy-365)/40)*ramp((675-yy)/55)*ramp((xx-138)/50)*ramp((621-xx)/50)
    mask*=1-np.exp(-((xx-383)/88.)**2-((yy-539)/29.)**2)
    dy,dx=np.gradient(detail*mask)
    norm=np.stack([-2.45*dx,2.45*dy,np.ones_like(dx)],-1);norm/=np.linalg.norm(norm,axis=-1,keepdims=True)
    Image.fromarray(np.uint8((norm*.5+.5)*255+.5)).save(atlas_dir/'hermione-normal.png',optimize=True)
    # Use skin from just above the eyelash when the lid slides across the iris.
    smooth=np.array(out.filter(ImageFilter.GaussianBlur(3.8)))
    lid=rgba.copy()
    for lo,hi,up,down in old_eyes.values():
        for x in range(int(lo),int(hi)+1):
            u=np.clip((x-lo)/(hi-lo),0,1);w=np.sin(np.pi*u)**.7
            edge=np.interp(u,np.linspace(0,1,len(up)),up)-.30*w
            fold=edge-(24+6*np.sin(np.pi*u))*w
            for y in range(int(fold)-1,int(edge)+2):
                v=np.clip((y-fold)/max(1.,edge-fold),0,1)
                color=smooth[int(edge-(15.+7.*(1-v))*w),x]
                # The source photograph has long upper lashes. Sample above them
                # for the mobile lid and keep a narrow, separate dark lash margin.
                color=color*(.966+.025*(1-v))
                weight=ramp((v-.19)/.32)*ramp((1.026-v)/.040)*ramp(w/.45)
                lid[y,x]=(1-weight)*rgba[y,x]+weight*color
    Image.fromarray(np.uint8(np.clip(lid+.5,0,255))).save(atlas_dir/'hermione-lid.png',optimize=True)
