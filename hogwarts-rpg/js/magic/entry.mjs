if (document.body.hasAttribute('data-wardrobe-page')) {
  const {openWardrobe} = await import('./wardrobe-studio.mjs');
  openWardrobe({variant:'harry', onClose:()=>location.assign('/')});
} else {
  await import('./chapter-app.mjs');
}
