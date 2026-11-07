"""Prepare game-resolution skin tiles and seamless hair-fiber albedo strips.

Requires Pillow and NumPy. All reference image and registration inputs are local.
"""
from pathlib import Path
import json
import math
from PIL import Image, ImageFilter, ImageDraw
import numpy as np

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "art" / "textures" / "characters"
PLATE = Image.open(OUT / "face_reference.jpg").convert("RGB")
POINTS = json.loads((OUT / "face_landmarks.json").read_text())["faces"]
OUTLINE = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,
           152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109]
FIBER_COLORS = {"harry": (.033,.021,.016), "hermione": (.104,.055,.029), "ron": (.25,.099,.047)}
SKIN = {"harry": (.56,.325,.255), "hermione": (.59,.33,.245), "ron": (.60,.355,.287)}


def srgb(linear):
    return np.clip(255*(1.055*np.maximum(0,linear)**(1/2.4)-.055),0,255).astype("uint8")


for index,key in enumerate(("harry","hermione","ron")):
    width, height = PLATE.width // 3, PLATE.height
    crop = PLATE.crop((width*index,0,width*(index+1),height))
    pts = np.array(POINTS[key])[:, :2] - [index*width,0]
    # Fade the reference boundary into the ear and scalp tone, retaining central skin detail.
    mask = Image.new("L",crop.size)
    ImageDraw.Draw(mask).polygon([tuple(pts[i]) for i in OUTLINE],fill=255)
    mask = mask.filter(ImageFilter.MinFilter(21)).filter(ImageFilter.GaussianBlur(8))
    crop=Image.composite(crop,Image.new("RGB",crop.size,tuple(map(int,srgb(np.array(SKIN[key]))))),mask)
    if key=="harry":
        # Lightning scar sits just below the hairline on the character's right.
        x,y=pts[103]*.53 + pts[105]*.47
        line = [(x,y-16),(x+9,y-6),(x+3,y-4),(x+14,y+11),(x+8,y+1),(x+13,y)]
        overlay=Image.new("RGBA",crop.size)
        pen=ImageDraw.Draw(overlay)
        pen.line([(u+1,v+1) for u,v in line],fill=(241,188,163,135),width=3)
        pen.line(line,fill=(132,83,75,160),width=2)
        crop=Image.alpha_composite(crop.convert("RGBA"),overlay.filter(ImageFilter.GaussianBlur(.54))).convert("RGB")
    crop.save(OUT / (key+"_skin.jpg"),quality=91,optimize=True)

    # Baked, periodic melanin variation gives the individual ribbons fine longitudinal fibers.
    rng=np.random.default_rng(812+index)
    w,h=256,192
    y,x=np.mgrid[0:h,0:w]
    drift=1.65*np.sin(2*math.pi*y/(h*1.5)+.35*np.sin(x/w*2*math.pi))
    phase=2*math.pi*(x+drift)/w
    # Each column represents a different small clump with its own edge and
    # length. Gray-scale variations stay linear and are converted to sRGB once.
    fiber=.79+.18*np.cos(phase*6)+.12*np.sin(phase*11+.8)+.14*np.cos(phase*15-1.4)
    for f in range(17,94):
        fiber+=(.027+.015*rng.random())*np.sin(phase*f+rng.random()*2*math.pi)
    fiber+=.18*np.cos(phase)+.036*rng.normal(size=(h,w))
    base=np.array(FIBER_COLORS[key])[None,None,:]
    if key=="harry":
        base*=.70
    rgb=srgb(base*np.clip(fiber,.23,1.85)[:,:,None])
    along=y/(h-1)
    across=np.clip((x+1.9*np.sin(4*along+phase*2))/(w-1),0,1)
    middle=np.sin(np.pi*across).clip(0,1)
    strand=(.48+.27*np.sin(phase*39)+.19*np.cos(phase*62)+.12*np.sin(phase*91))
    length=.69+.25*middle**.45+.14*strand+.031*np.cos(phase*7)
    left=.021+.047*np.cos(15*along)+.04*(1-strand)
    right=.982-.045*np.sin(11*along)+.03*strand
    coverage=np.minimum(np.minimum((across-left)*34,(right-across)*34),(length-along)*45)
    coverage=np.minimum(coverage,1-((1-strand)*.40+(1-middle)**3*.25))
    rgba=np.dstack([rgb,np.uint8(255*np.clip(coverage,0,1))])
    Image.fromarray(rgba).save(OUT / (key+"_hair.png"),optimize=True)

    # A continuous photographic scalp texture carries fine strands across the crown.
    # Resample the hair band in each column so the scalp never picks up forehead or backdrop.
    source=np.asarray(PLATE.crop((width*index,0,width*(index+1),height)),dtype=float)
    config={"harry":(.127,.884,122,103),"hermione":(.126,.865,136,114),"ron":(.122,.915,186,131)}
    xa,xb,rmax,gmax=config[key]
    src_small=np.array(Image.fromarray(source.astype("uint8")).filter(ImageFilter.GaussianBlur(3)),dtype=float)
    w,h=512,256
    xmap=np.linspace(xa*width,xb*width,w).astype(int)
    first=[];last=[]
    for sx in xmap:
        pixels=src_small[:int(height*.44),sx]
        valid=(pixels[:,0]<rmax)&(pixels[:,1]<gmax)&(pixels[:,0]>(pixels[:,2]+5))
        indices=np.flatnonzero(valid)
        if len(indices):
            groups=np.split(indices,np.where(np.diff(indices)>8)[0]+1)
            group=max(groups,key=len)
            first.append(group[0]+1);last.append(max(group[0]+4,group[-1]-2))
        else:
            first.append(0);last.append(14)
    kernel=np.ones(9)/9
    ymin=np.convolve(np.pad(first,(4,4),mode="edge"),kernel,mode="valid")
    ymax=np.convolve(np.pad(last,(4,4),mode="edge"),kernel,mode="valid")
    sy=(ymin[None,:]+np.linspace(0,1,h)[:,None]*(ymax-ymin)[None,:]).astype(int)
    scalp=source[sy,xmap[None,:],:]
    Image.fromarray(scalp.astype("uint8")).save(OUT/(key+"_scalp.jpg"),quality=92,optimize=True)
