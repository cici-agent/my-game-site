"""Build the public student character kit from the same files used in the game."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import os
from tempfile import NamedTemporaryFile

root = Path(__file__).resolve().parents[2]
motion = root/'tools/blender/motion'
characters = root/'assets/3d/magic/characters'
target = root/'character-studio/student-kit.zip'
files = {
    'student_motion.py': motion/'student_motion.py',
    'student-motion.npz': motion/'student-motion.npz',
    '使用说明.md': motion/'使用说明.md',
    'model-license.txt': target.parent/'model-license.txt',
}
for p in sorted((motion/'standard-vrma').iterdir()):
    if p.is_file() and p.suffix in {'.vrma', '.md'}:
        files['standard-vrma/'+p.name] = p
for name in ['character-motion.js','portrait-expression.js','wand-gesture.js']:
    files['runtime/'+name] = root/'js/magic'/name
for name in ['hermione','ron']:
    files['examples/'+name+'.glb'] = characters/(name+'.glb')
with NamedTemporaryFile(dir=target.parent, suffix='.zip') as tmp:
    with ZipFile(tmp.name,'w',compression=ZIP_DEFLATED,compresslevel=6) as archive:
        for name,source in files.items():
            archive.write(source,name)
    with ZipFile(tmp.name) as archive:
        for name,source in files.items():
            if archive.read(name) != source.read_bytes():
                raise ValueError('Mismatched kit member '+name)
    # Write the verified archive alongside the old version for an atomic swap.
    from shutil import copyfile
    stage = target.with_suffix('.zip.next')
    copyfile(tmp.name,stage)
    os.replace(stage,target)
