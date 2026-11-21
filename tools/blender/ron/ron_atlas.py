"""Register the Weasley portrait to the articulated eyes and mouth of the shared rig."""
import json
import numpy as np
from PIL import Image, ImageFilter
from atlas import old_eyes, ramp, weights

# These points are on the photographed wet margins, measured on the original
# 724px Weasley portrait. The landmark detector places some points on skin.
EYES = {
    'R': (240.5, 326.5, [324,317,312,308,306.6,306.9,307.7,311,316,322,331.3],
          [324,328,331.5,334.3,335.3,335.2,334.6,333.7,331.8,330.7,331.3]),
    'L': (431.7, 516.5, [333.5,322,315,310,307.3,306.7,308.4,311.8,315.2,320.1,325.2],
          [333.5,333.6,332.5,334.3,335.1,335.8,335.6,334.5,332.3,329.6,325.2])
}
RIG_MOUTH = [540.,540.,537.2,536.1,537.2,537.1,534.9,535.9,538.2,538.1]
RON_MOUTH = [559.,560.,559.,557.1,556.,557.1,556.,555.5,557.4,557.6]

def read_points(textures):
    faces=json.loads((textures/'face_landmarks.json').read_text())['faces']
    data={name:np.asarray(faces[name],float)[:468].copy() for name in ('harry','ron')}
    data['ron'][:,0]-=2*724
    return data

def register(textures,points,stage):
    src,dst=points['harry'][:,:2],points['ron'][:,:2]
    mouth=(src[:,0]>301)&(src[:,0]<463)&(abs(src[:,1]-538)<12)
    near_eye=((abs(src[:,0]-286)<58)|(abs(src[:,0]-472)<58))&(abs(src[:,1]-335)<23)
    keep=~(mouth|near_eye);s=list(src[keep]);d=list(dst[keep])
    for side in EYES:
        old,new=old_eyes[side],EYES[side]
        for row in (2,3):
            for j in (range(11) if row==2 else range(1,10)):
                s.append((np.interp(j,[0,10],old[:2]),old[row][j]))
                d.append((np.interp(j,[0,10],new[:2]),new[row][j]))
    for j,(h,r) in enumerate(zip(RIG_MOUTH,RON_MOUTH)):
        s.append((310+j*147/9,h));d.append((306+j*148/9,r))
    boundary=[(x,y) for x in (0,723) for y in (0,180,360,550,723)]+[(x,y) for x in (180,360,550) for y in (0,723)]
    s=np.array(s+boundary,dtype=float)/724;d=np.array(d+boundary,dtype=float)/724
    P=np.c_[np.ones(len(s)),s];K=np.block([[weights(s,s)+3e-7*np.eye(len(s)),P],[P.T,np.zeros((3,3))]])
    coef=np.linalg.solve(K,np.vstack([d-s,np.zeros((3,2))]))
    res=182;gy,gx=np.mgrid[:res,:res];uv=np.stack([gx,gy],-1).reshape(-1,2)/(res-1)
    ds=np.concatenate([weights(g,s)@coef[:-3]+np.c_[np.ones(len(g)),g]@coef[-3:] for g in np.array_split(uv,40)]).reshape(res,res,2)*724
    yy,xx=np.mgrid[:724,:724]
    pos=np.stack([xx,yy],-1)+np.stack([np.asarray(Image.fromarray(ds[:,:,k].astype('f')).resize((724,724),Image.Resampling.BICUBIC)) for k in (0,1)],-1)
    photo=np.asarray(Image.open(textures/'ron_skin.jpg').convert('RGB')).astype(float)
    pos=np.clip(pos,0,722.999);lo=pos.astype(int);x,y=lo.transpose(2,0,1);u,v=(pos-lo).transpose(2,0,1)
    rgb=((1-u)[:,:,None]*photo[y,x]+u[:,:,None]*photo[y,x+1])*(1-v)[:,:,None]+((1-u)[:,:,None]*photo[y+1,x]+u[:,:,None]*photo[y+1,x+1])*v[:,:,None]
    # Recessed mouth mesh supplies the dark line when the jaw opens. Keep the
    # photographed vermilion colour but clear the duplicate closed seam.
    raw=rgb.copy();lum=rgb@np.array([.22,.64,.14])
    for x in range(305,462):
        y=int(round(np.interp(x,np.linspace(310,457,10),RIG_MOUTH)))
        y0=y-4+np.argmin(lum[y-4:y+5,x])
        w=ramp((x-305)/9)*ramp((461-x)/9)
        for off in range(-6,7):
            v=(off+7)/14
            base=(1-v)*raw[y0-7,x]+v*raw[y0+7,x]
            lift=np.maximum(0,base-raw[y0+off,x])
            rgb[y0+off,x]+=w*ramp((7-abs(off))/3)*ramp((lift@np.array([.22,.64,.14]))/8)*lift
    # Sun freckles cluster on the nose bridge and cheekbones, mirrored only in
    # density. Variable soft margins preserve the student's source skin texture.
    rng=np.random.default_rng(3021980)
    clusters=[(249,434,40,21,99),(487,432,42,20,112),(375,422,37,12,85),(276,467,38,18,34),(491,468,29,18,38)]
    for cx,cy,sx,sy,n in clusters:
        for i in range(n):
            px=rng.normal(cx,sx);py=rng.normal(cy,sy)
            if not (155<px<585 and 374<py<500):continue
            size=rng.uniform(.55,1.72);elong=rng.uniform(.68,1.18)
            x0=int(px)-4;y0=int(py)-4
            fy,fx=np.mgrid[y0:y0+9,x0:x0+9];rr=((fx-px)/size)**2+((fy-py)/(size*elong))**2
            stain=np.exp(-rr*1.0)*rng.uniform(.044,.178)
            rgb[y0:y0+9,x0:x0+9]*=1-stain[:,:,None]*np.array([.64,.96,1.08])
    def image(a):return Image.fromarray(np.uint8(np.clip(a+.5,0,255)))
    registered=image(rgb);registered.save(stage/'ron-registered.png')
    luma=np.asarray(registered.convert('L'),float)/255
    fine=luma-np.asarray(registered.convert('L').filter(ImageFilter.GaussianBlur(1.3)),float)/255
    mask=ramp((yy-363)/38)*ramp((667-yy)/50)*ramp((xx-129)/51)*ramp((626-xx)/53)
    mask*=1-np.exp(-((xx-383)/89)**2-((yy-537)/28)**2)
    dy,dx=np.gradient(np.clip(fine,-.038,.038)*mask)
    normal=np.stack([-2.32*dx,2.32*dy,np.ones_like(dx)],-1);normal/=np.linalg.norm(normal,axis=-1,keepdims=True)
    image((normal*.5+.5)*255).save(stage/'ron-normal.png')
    smooth=np.asarray(registered.filter(ImageFilter.GaussianBlur(2.9)),float);lids=rgb.copy()
    for lo,hi,up,down in old_eyes.values():
        for x in range(int(lo),int(hi)+1):
            u=np.clip((x-lo)/(hi-lo),0,1);w=np.sin(np.pi*u)**.7
            edge=np.interp(u,np.linspace(0,1,len(up)),up)-.30*w;fold=edge-(24+6*np.sin(np.pi*u))*w
            for y in range(int(fold)-1,int(edge)+2):
                v=np.clip((y-fold)/max(1.,edge-fold),0,1)
                tone=smooth[int(edge-(13+7*(1-v))*w),x]*(.977+.021*(1-v))
                blend=ramp((v-.19)/.32)*ramp((1.026-v)/.040)*ramp(w/.45)
                lids[y,x]=(1-blend)*rgb[y,x]+blend*tone
    image(lids).save(stage/'ron-lid.png')
