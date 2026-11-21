"""Rebuild the detailed Hermione model from the academy's two existing students."""
import argparse
from pathlib import Path
from tempfile import TemporaryDirectory
import os
import cloth
import compact
import finish
import garments
import groom
import portrait
import vine
from geometry import Builder


def build(repo, output):
    characters = repo/'assets/3d/magic/characters'
    harry, hermione = characters/'harry-pathfinder.glb', characters/'hermione.glb'
    if output in (harry, hermione):
        raise ValueError('Choose a separate destination for the new student.')
    output.parent.mkdir(parents=True, exist_ok=True)
    # Keep intermediate articulated meshes out of the game assets. Publish only
    # the complete packed model, including when rebuilding the existing look.
    with TemporaryDirectory(dir=output.parent) as tmp:
        stage = Path(tmp)
        portrait.build(harry, stage/'face.glb', repo, stage)
        meshes = Builder(stage/'face.glb', hermione)
        garments.make(meshes)
        groom.make(meshes)
        meshes.save(stage/'dressed.glb')
        cloth.build(stage/'dressed.glb', stage/'cloth.glb')
        vine.build(stage/'cloth.glb', stage/'wand.glb')
        finish.build(stage/'wand.glb', hermione, stage/'scaled.glb')
        compact.pack(stage/'scaled.glb', stage/'character.glb')
        os.replace(stage/'character.glb', output)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[3])
    parser.add_argument('--output', type=Path, help='Destination GLB. Defaults to the game model path.')
    args = parser.parse_args()
    root = args.repo.resolve()
    output = args.output or root/'assets/3d/magic/characters/hermione-scholar.glb'
    build(root, output.resolve())
