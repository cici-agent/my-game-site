import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function walkHeights(character) {
  const url = new URL(`../assets/3d/magic/characters/${character}.glb`, import.meta.url);
  const bytes = readFileSync(url);
  const jsonEnd = 20 + bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.toString('utf8', 20, jsonEnd));
  const bufferStart = jsonEnd + 8;
  function column(index, axis) {
    const a = gltf.accessors[index];
    assert.equal(a.componentType, 5126);
    const view = gltf.bufferViews[a.bufferView];
    const stride = view.byteStride ?? (a.type === 'SCALAR' ? 4 : 12);
    const offset = bufferStart + (view.byteOffset ?? 0) + (a.byteOffset ?? 0) + axis * 4;
    return Array.from({ length: a.count }, (_, i) => bytes.readFloatLE(offset + i * stride));
  }
  const walk = gltf.animations.find(a => a.name === 'Walk');
  const hips = gltf.nodes.findIndex(n => n.name === 'Hips');
  const track = walk.channels.find(c => c.target.node === hips && c.target.path === 'translation');
  const sampler = walk.samplers[track.sampler];
  assert.equal(sampler.interpolation ?? 'LINEAR', 'LINEAR');
  const times = column(sampler.input, 0);
  const heights = column(sampler.output, 1);
  assert.ok(Math.abs(heights[0] - heights.at(-1)) < .0001, 'Hips must meet at loop seam');
  // Compare at the authored 24 fps across both 24 Hz and 96 Hz exports.
  const count = Math.round(times.at(-1) * 24);
  let i = 0;
  return Array.from({ length: count }, (_, frame) => {
    const t = frame / count * times.at(-1);
    while (i + 2 < times.length && times[i + 1] < t) i++;
    const u = (t - times[i]) / (times[i + 1] - times[i]);
    return heights[i] + (heights[i + 1] - heights[i]) * u;
  });
}

for (const name of ['harry', 'hermione', 'ron', 'harry-pathfinder', 'hermione-scholar', 'ron-weasley']) {
  test(`${name} transfers weight smoothly through both heels and the loop seam`, () => {
    const heights = walkHeights(name);
    const extent = Math.max(...heights) - Math.min(...heights);
    assert.ok(extent > .015, 'Preserve body weight transfer');
    const steps = heights.map((y, i) => heights[(i + 1) % heights.length] - y);
    const largestDrop = Math.max(...steps.map(step => -step));
    const largestChange = Math.max(...steps.map((step, i) =>
      Math.abs(step - steps[(i + steps.length - 1) % steps.length])));
    // The old hitch used over half the total vertical travel in a single frame.
    assert.ok(largestDrop / extent < .34, 'Heel strike should distribute the descent across frames');
    assert.ok(largestChange / extent < .30, 'Direction should change gradually, including at wraparound');
  });
}
