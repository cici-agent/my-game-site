import * as THREE from 'three';

const manifestUrl = '/assets/chapter-one/materials/manifest.json';
let manifestPromise;
const imageTextures = new Map();
const loadManifest = () => manifestPromise ??= fetch(manifestUrl).then(response => {
  if (!response.ok) throw new Error(`Environment material manifest: ${response.status}`);
  return response.json();
}).catch(error => { manifestPromise = null; throw error; });
const loadTexture = url => {
  if (!imageTextures.has(url)) imageTextures.set(url, new THREE.TextureLoader().loadAsync(url).catch(error => { imageTextures.delete(url); throw error; }));
  return imageTextures.get(url);
};

// The caller passes only its environment group, never the whole scene. Character
// GLBs, NPCs and spell effects are siblings and cannot acquire these materials.
// The injectable readers allow disposal races to be verified without a browser.
export function bindEnvironmentMaterials(group, readers = {}) {
  let disposed = false;
  const replacements = new Map(), textures = new Set(), assignments = [];
  const marked = [];
  group.traverse(object => {
    if (!object.visible || !object.isMesh || Array.isArray(object.material)) return;
    const descriptor = object.userData.environmentSurface ?? object.material?.userData.environmentSurface;
    if (descriptor && object.material?.isMeshStandardMaterial) marked.push({ object, descriptor, original: object.material });
  });
  group.userData.materialState = marked.length ? 'loading' : 'unmarked';
  const ready = (async () => {
    if (!marked.length) return { applied: 0 };
    const manifest = await (readers.loadManifest ?? loadManifest)();
    const kinds = [...new Set(marked.map(m => m.descriptor.kind))], packs = new Map();
    await Promise.all(kinds.map(async kind => {
      const specification = manifest.materials[kind];
      if (!specification) throw new Error(`Missing environment material: ${kind}`);
      const pack = await Promise.all(['albedo', 'normal', 'roughness'].map(key => {
        const url = specification.maps[key].url;
        return (readers.loadTexture ?? loadTexture)(url);
      }));
      packs.set(kind, pack);
    }));
    if (disposed) return { applied: 0, disposed: true };
    for (const { object, descriptor, original } of marked) {
      const key = original.uuid + ':' + JSON.stringify(descriptor);
      if (!replacements.has(key)) {
        const material = original.clone(), maps = packs.get(descriptor.kind).map((source, index) => {
          const texture = source.clone(); texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          texture.colorSpace = index === 0 ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          texture.repeat.fromArray(descriptor.repeat ?? [1, 1]); texture.anisotropy = 4; texture.needsUpdate = true; textures.add(texture); return texture;
        });
        material.map = maps[0]; material.normalMap = maps[1]; material.roughnessMap = maps[2]; material.bumpMap = null;
        material.normalScale.setScalar(descriptor.kind === 'wood' ? .35 : descriptor.kind === 'brick' ? .65 : .48);
        material.roughness = descriptor.kind === 'wood' ? .86 : .94;
        // Keep a slight per-stone variation without multiplying the photograph
        // by the old dark proxy material a second time.
        material.color.lerp(new THREE.Color(0xffffff), descriptor.keepTint ? .65 : .91);
        material.needsUpdate = true; material.name = `environment:${descriptor.kind}`;
        replacements.set(key, material);
      }
      object.material = replacements.get(key); assignments.push({ object, original });
    }
    group.userData.materialState = 'ready'; group.userData.pbrSurfaces = marked.length;
    return { applied: marked.length, kinds };
  })().catch(error => { if (!disposed) { group.userData.materialState = 'failed'; group.userData.materialError = error.message; readers.onError?.(error); } return { applied: 0, error }; });
  return { ready, dispose() {
    if (disposed) return; disposed = true;
    assignments.forEach(({ object, original }) => { object.material = original; });
    replacements.forEach(material => material.dispose()); textures.forEach(texture => texture.dispose());
    assignments.length = 0; replacements.clear(); textures.clear();
  } };
}
