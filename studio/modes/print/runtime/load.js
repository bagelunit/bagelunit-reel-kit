/* Susanoo Reel Kit print · load
   The one script a print page includes. It queues the engine core, the prop kits and the boot in a fixed order (each file sees
   the ones before it). The boot loads reel.json, build/words.json (or estimates from script.txt), timeline.js, then every scene. */
[
  'runtime/lib.js', 'runtime/ui.js', 'runtime/media.js', 'runtime/words.js', 'runtime/lipsync.js', 'runtime/captions.js',
  'runtime/acting.js', 'runtime/presenter.js', 'runtime/stickerhost.js', 'runtime/halftone.js',   // stickerhost: local add-on
  'parts/fx.js', 'parts/devices.js', 'parts/cards.js', 'parts/charts.js', 'parts/mechanics.js',
  'runtime/engine.js',
].forEach(file => {
  const tag = document.createElement('script');
  tag.src = '/mode/' + file;
  tag.async = false;                                   // injected scripts run in insertion order
  document.head.appendChild(tag);
});
