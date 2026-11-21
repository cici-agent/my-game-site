"""Ron’s open-laced school derbies. The sole retains the calibrated heel and toe contacts."""
import numpy as np
from geometry import Threads
from finishing import shell


def make_shoe(b, side, materials):
    sign = 1 if side == 'L' else -1
    center = sign * .109
    def bind(v): return b.skin(len(v), 'Foot' + side)
    parts = []
    old_name = 'Pathfinder_Boot_' + side
    for primitive in b.a.primitives(b.a.byname[old_name]):
        name = b.a.doc['materials'][primitive['material']]['name']
        if name not in ('Atelier / sole', 'Atelier / edge'): continue
        data, triangles = b.data(b.a, primitive)
        keep = data['POSITION'][triangles, 1].max(axis=1) < .042
        if not np.any(keep): continue
        indices, faces = np.unique(triangles[keep], return_inverse=True)
        parts.append(b.prim({k: v[indices] for k, v in data.items()}, faces.reshape(-1, 3),
                            materials['sole' if name.endswith('sole') else 'welt']))
    # Last widths, front and back lengths are measured from the individual foot.
    last = np.array([[.026,.060,.065,.151,.134], [.035,.060,.065,.151,.132],
          [.046,.059,.065,.148,.128], [.059,.057,.059,.141,.121],
          [.071,.056,.052,.130,.115], [.082,.053,.045,.114,.105],
          [.092,.050,.029,.106,.096], [.106,.048,.013,.093,.081],
          [.123,.046,.001,.072,.065], [.145,.043,-.002,.059,.057]])
    def surface(angle, y, outset=0):
        a,y=np.broadcast_arrays(angle,y)
        width,pivot,toe,heel=[np.interp(y,last[:,0],last[:,i]) for i in range(1,5)]
        s,c=np.sin(a),np.cos(a)
        x=center+(width+outset)*np.sign(s)*abs(s)**.85*(1+.09*c)
        z=pivot+(np.where(c>0,toe,heel)+outset)*np.sign(c)*abs(c)**.89
        return np.stack((x,y,z),axis=-1)
    a=np.linspace(0,2*np.pi,73)
    top=.118+.019*np.cos(a)**2*(np.cos(a)>0)
    y=.027+np.linspace(0,1,29)[:,None]*(top[None,:]-.027)
    parts.append(shell(b,surface(a[None,:],y),materials['leather'],bind))
    edges,stitch,laces,eyelets=Threads(),Threads(),Threads(),Threads()
    edges.tube(surface(a,top,.001),.0017,.0013)
    # Each quarter is a separate leather facing with an open edge and a narrow tongue between.
    for s in [-1,1]:
        v=np.linspace(0,1,18)[:,None]
        u=np.linspace(0,1,25)[None,:]
        y0=.068+.018*(1-u)**2; y1=.118+.004*(1-u)
        y=y0+(y1-y0)*v
        aa=s*(.29+.19*(1-v)+u*(1.40+.21*v))
        parts.append(shell(b,surface(aa,y,.0018), materials['quarter'],bind,s<0))
        paths=[surface(aa[:,0],y[:,0],.0022),surface(aa[0],y[0],.0022)]
        for p in paths:
            edges.tube(p,.00093)
            for k in range(0,len(p)-1,2):
                stitch.tube(p[k:k+2]+[0,.0006,.0002],.00040,sides=5)
    for i,h in enumerate([.083,.091,.099,.107,.115]):
        angle=.46-.11*(h-.083)/.032
        for s in [-1,1]:
            c=surface(s*angle,h,.0027)
            th=np.linspace(0,2*np.pi,17)
            eyelets.tube(c+np.stack((.0024*np.cos(th),.0018*np.sin(th),.0007*np.sin(th)),axis=1),.00056)
            if i==4: continue
            aa=np.linspace(-s*angle,s*(angle-.018),19)
            yy=np.linspace(h,h+.008,len(aa))
            laces.tube(surface(aa,yy,.0031+.0011*np.sin(np.linspace(0,np.pi,len(aa)))+(i%2)*.0002),
                       .00118,.00095)
    # A soft crease behind the toe cap, plus a row of brogue perforations in dark leather.
    a=np.linspace(-1.24,1.24,57)
    stitch.tube(surface(a,.054+.010*np.cos(a),.0007),.00070,.00045)
    for q in np.linspace(-1.08,1.08,27):
        aa=np.array([q-.009,q+.009])
        edges.tube(surface(aa,.054+.010*np.cos(aa)-.0024,.0007),.00053,.0003,sides=5)
    aa=np.linspace(-2.66,-3.62,24)
    stitch.tube(surface(aa,.082+.026*np.cos((aa+np.pi)*2.2),.0009),.00075)
    for thread,material in ((edges,'edge'),(stitch,'stitch'),(laces,'lace'),(eyelets,'eyelet')):
        parts.append(thread.prim(b,materials[material],bind))
    # Slim rounded last and a low school heel. Preserve the calibrated floor
    # height of the original sole while leaving room for the trouser break.
    for p in parts:
        acc=b.doc['accessors'][p['attributes']['POSITION']]
        view=b.doc['bufferViews'][acc['bufferView']]
        v=np.frombuffer(b.bin,'<f4',acc['count']*3,view['byteOffset']).reshape(-1,3)
        y=v[:,1].copy()
        v[:,0]=center+(v[:,0]-center)*(.902-.025*np.clip(y/.10,0,1))
        v[:,2]-=.016*np.clip((v[:,2]-.060)/.16,0,1)
        v[:,2]+=.005*np.clip((-v[:,2]-.028)/.043,0,1)
        v[:,1]=.0035+(y-.0035)*(.77+.15*np.clip((y-.03)/.10,0,1))
        v[:,1]-=.00255*(1-np.clip((y-.022)/.032,0,1))
        acc['min']=v.min(0).tolist();acc['max']=v.max(0).tolist()
    b.mesh('Ron_Derby_'+side,parts,'shoes',node=b.a.byname[old_name])
