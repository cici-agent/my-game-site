"""Write the character's active glTF geometry, clips, images and binary ranges."""
from glb import Asset, write_glb

def remap(objects, references, key):
    # references are pairs of (owning dictionary/list, property/index).
    refs=list(references)
    take=sorted({o[k] for o,k in refs})
    ids={old:i for i,old in enumerate(take)}
    for o,k in refs:o[k]=ids[o[k]]
    objects[key]=[objects[key][i] for i in take]
def properties(items,keys):
    return [(o,k) for o in items for k in keys if k in o]
def material_textures(obj):
    for k,v in obj.items():
        if isinstance(v,dict):
            if k.endswith('Texture') and 'index' in v:yield v,'index'
            else:yield from material_textures(v)

def pack(source,output):
    a=Asset(source);d=a.doc
    # Detached equipment is left in the construction file so departments can
    # operate independently. Only meshes reached by a scene belong to the delivery.
    stack=[i for s in d['scenes'] for i in s['nodes']];active=set()
    while stack:
        n=stack.pop()
        if n not in active:active.add(n);stack.extend(d['nodes'][n].get('children',[]))
    for i,node in enumerate(d['nodes']):
        if i not in active:
            node.pop('mesh',None)
        if 'mesh' not in node:node.pop('skin',None)
    remap(d,properties(d['nodes'],['mesh']),'meshes')
    for clip in d['animations']:
        clip['channels']=[c for c in clip['channels'] if c['target']['node'] in active and (c['target']['path']!='weights' or 'mesh' in d['nodes'][c['target']['node']])]
        remap(clip,properties(clip['channels'],['sampler']),'samplers')
    prim=[p for m in d['meshes'] for p in m['primitives']]
    remap(d,properties(prim,['material']),'materials')
    ts=[entry for m in d['materials'] for entry in material_textures(m)]
    remap(d,ts,'textures')
    remap(d,properties(d['textures'],['sampler']),'samplers')
    remap(d,properties(d['textures'],['source']),'images')
    refs=properties(prim,['indices'])+properties(d['skins'],['inverseBindMatrices'])
    for p in prim:
        for at in [p['attributes'],*p.get('targets',[])]:refs.extend((at,k) for k in at)
    for anim in d['animations']:refs.extend(properties(anim['samplers'],['input','output']))
    remap(d,refs,'accessors')
    refs=properties(d['images'],['bufferView'])+properties(d['accessors'],['bufferView'])
    for acc in d['accessors']:
        if 'sparse' in acc:refs.extend(properties([acc['sparse']['values'],acc['sparse']['indices']],['bufferView']))
    remap(d,refs,'bufferViews')
    buf=bytearray()
    for v in d['bufferViews']:
        lo=v.get('byteOffset',0);data=a.bin[lo:lo+v['byteLength']]
        buf.extend(bytes(-len(buf)%4));v['byteOffset']=len(buf);buf.extend(data)
    d['asset']['generator']='Academy character workshop • Hermione Granger'
    write_glb(d,buf,output)
