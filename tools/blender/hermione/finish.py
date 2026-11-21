"""Calibrate a detailed character to their measured proportions and ground speed."""
import numpy as np
from glb import Asset, write_glb

def leg(a):
    m,_=a.at('Idle',0); points=[m(a.byname[n])[:3,3] for n in ('ThighL','ShinL','FootL')]
    return np.linalg.norm(np.diff(points,axis=0),axis=1).sum()
def build(src,ordinary,out, character='hermione', outfit='scholar', name='Hermione Granger'):
    a=Asset(src);reference=Asset(ordinary);doc=a.doc
    ratio=leg(reference)/leg(a)
    scene=doc['scenes'][doc['scene']]
    i=len(doc['nodes'])
    doc['nodes'].append({'name':name.replace(' ', '_'),'scale':[ratio]*3,'children':scene['nodes'],'extras':{'character':character,'outfit':outfit}})
    scene['nodes']=[i];scene['name']=name.split()[0]+' • Gryffindor'
    for n in ('Idle','Walk','Run'):
        a.actions[n].setdefault('extras',{})['groundSpeed']=reference.actions[n]['extras']['groundSpeed']
    a.actions['Cast'].setdefault('extras',{})['phases']=reference.actions['Cast']['extras']['phases']
    print('relative student stature',ratio,'movement m/s',a.actions['Walk']['extras']['groundSpeed']*1.2,a.actions['Run']['extras']['groundSpeed']*1.2)
    write_glb(doc,bytearray(a.bin[:doc['buffers'][0]['byteLength']]),out)
