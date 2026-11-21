"""Build Ron's detailed head on the shared articulated student. Requires Pillow and NumPy."""
import argparse
from pathlib import Path
import sys
from tempfile import TemporaryDirectory

def build(source,ordinary,output,textures):
    textures=Path(textures).resolve()
    repo=textures.parents[2]
    shared=repo/'tools/blender/hermione'
    if str(shared) not in sys.path:sys.path.append(str(shared))
    import ron_portrait, ron_hair
    from geometry import Builder
    output=Path(output).resolve()
    output.parent.mkdir(parents=True,exist_ok=True)
    if output in (Path(source).resolve(),Path(ordinary).resolve()):raise ValueError('Use a separate output for the head stage.')
    with TemporaryDirectory(dir=output.parent) as tmp:
        stage=Path(tmp)
        ron_portrait.build(source,stage/'face.glb',textures,repo/'tools/blender/face_topology/canonical_face_model.obj',stage)
        builder=Builder(stage/'face.glb',ordinary)
        ron_hair.make(builder);builder.save(stage/'character.glb')
        (stage/'character.glb').replace(output)

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for arg in ('source','ordinary','output'):p.add_argument(arg,type=Path)
    p.add_argument('--textures',type=Path,default=Path(__file__).resolve().parents[3]/'art/textures/characters')
    opts=p.parse_args();build(opts.source,opts.ordinary,opts.output,opts.textures)
