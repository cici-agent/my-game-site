"""Rebuild Ron's detailed school look, including his native run and spell clips."""
import argparse
import os
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

sys.path.append(str(Path(__file__).resolve().parent.parent / 'hermione'))
import compact
import finish
import head
import uniform
import willow
from geometry import Builder


def build(repo, output):
    characters = repo / 'assets/3d/magic/characters'
    source = characters / 'harry-pathfinder.glb'
    ron = characters / 'ron.glb'
    if output in (source, ron):
        raise ValueError('Choose a destination distinct from the source students.')
    output.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=output.parent) as tmp:
        stage = Path(tmp)
        head.build(source, ron, stage/'head.glb', repo/'art/textures/characters')
        uniform.build(stage/'head.glb', ron, stage/'uniform.glb')
        equipped = Builder(stage/'uniform.glb', ron)
        willow.make(equipped)
        equipped.save(stage/'equipped.glb')
        finish.build(stage/'equipped.glb', ron, stage/'scaled.glb',
                     character='ron', outfit='keeper', name='Ron Weasley')
        compact.pack(stage/'scaled.glb', stage/'character.glb', character='Ron Weasley')
        os.replace(stage/'character.glb', output)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[3])
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    repo = args.repo.resolve()
    output = args.output or repo/'assets/3d/magic/characters/ron-weasley.glb'
    build(repo, output.resolve())
