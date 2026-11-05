// b17 · everything moving reports in. Fits "Every car on the road sends its speed, and it adds them up live."
// Toy cars drive the streets of the table town. From the first cue each car pings (a ring) and a little speed chip lifts off
// it and streams into a card that averages them; the PINGS badge counts. Bix watches from the corner. Cue words: speed ·
// live (fallbacks: 25 %, 70 %). Speeds in SPEEDS.
const SPEEDS = [42, 18, 35, 9, 27, 31];

export default {
  build(k, shot) {
    const S = (shot.s = {}), { kit, THREE } = k, set = (shot.set = k.rooms.mapTable(shot.root, { wall: 'sage' }));
    S.tPing = shot.at('speed', 0.25); S.tLive = shot.at('live', 0.7);
    const TOP = 0.86, carCols = [0xd9653b, 0x2f8f83, 0xe3a21a, 0x6b5bb8, 0x3f6390, 0xc2557a];
    // lanes: [x0, z0, x1, z1] along the streets of the map (world coords on the table)
    const lanes = [[-1.25, -0.2, 1.25, -0.2], [1.25, -0.8, -1.25, -0.8], [-0.6, 0.45, -0.6, -1.45], [0.6, -1.45, 0.6, 0.45], [-1.25, 0.4, 1.25, 0.4], [0, 0.45, 0, -1.45]];
    S.cars = lanes.map((ln, i) => {
      const g = kit.group(shot.root); g.scale.setScalar(1.7); kit.put(kit.box(0.12, 0.05, 0.07, kit.paint(carCols[i], { map: null, rough: 0.4 }), 0.015), 0, 0.04, 0, g);
      kit.put(kit.box(0.06, 0.035, 0.06, kit.paint(0xeaf2f6, { map: null, rough: 0.2 }), 0.01), -0.01, 0.08, 0, g);
      const ring = kit.put(new THREE.Mesh(new THREE.RingGeometry(0.06, 0.075, 32), kit.lit(1.6, 1.1, 0.5, { transparent: true })), 0, 0.01, 0, g); ring.rotation.x = -Math.PI / 2;
      const chip = kit.put(kit.sheet(0.2, 0.07, new THREE.MeshBasicMaterial({ map: kit.label(`${SPEEDS[i]} km/h`, { w: 320, h: 112, size: 54, bw: 6 }), transparent: true })), 0, 0, 0, shot.root);
      return { g, ln, ring, chip, ph: i * 0.17, tp: S.tPing + i * 0.16 };
    });
    S.card = kit.put(kit.sheet(0.62, 0.3, new THREE.MeshBasicMaterial({ map: kit.label('', { w: 620, h: 300 }), transparent: true })), 0.2, 1.3, -1.25, shot.root);
    S.cardKey = ''; S.TOP = TOP;
    S.bix = k.buddy({ ...k.LOOK, scale: 0.34 }, shot.root); S.bix.root.position.set(-1.15, TOP, 0.3); S.bix.root.rotation.y = 0.6; S.bix.shadow.visible = false;
    shot.badge = ['PINGS', (t) => S.cars.filter((c) => t >= c.tp).length];
    k.sound(S.tPing, 'tick', -8); k.sound(S.tLive, 'pop', -6);
  },

  frame(k, t, shot) {
    const S = shot.s, b = S.bix, { THREE } = k;
    shot.set.frame(t, k.camera);
    b.idle(t, 3.6); b.blink(t, [shot.t0 + 0.9]); b.point(t, S.tPing, 'right', 1.0);
    let landed = 0, sum = 0;
    S.cars.forEach((c, i) => {
      const [x0, z0, x1, z1] = c.ln, f = (((t - shot.t0) * 0.12 + c.ph) % 1);
      c.g.position.set(k.lerp(x0, x1, f), S.TOP, k.lerp(z0, z1, f)); c.g.rotation.y = Math.atan2(-(z1 - z0), x1 - x0);
      const pu = (t - c.tp) / 0.5; c.ring.visible = pu > 0 && pu < 1; c.ring.scale.setScalar(1 + pu * 3); c.ring.material.opacity = 1 - Math.max(0, pu);
      const fly = k.ease.both(k.clamp((t - c.tp - 0.15) / 0.7));
      c.chip.visible = t > c.tp && fly < 1;
      const from = c.g.position.clone().add(new THREE.Vector3(0, 0.2, 0)), to = S.card.position;
      c.chip.position.lerpVectors(from, to, fly); c.chip.position.y += 0.25 * Math.sin(Math.PI * fly); c.chip.quaternion.copy(k.camera.quaternion); c.chip.scale.setScalar(1 - 0.5 * fly);
      if (fly >= 1) { landed++; sum += SPEEDS[i]; }
    });
    S.card.visible = t > S.tPing; S.card.quaternion.copy(k.camera.quaternion); S.card.scale.setScalar(k.grow(t - S.tPing, 3, 0.5) * (1 + 0.06 * k.jolt(t - S.tLive, 3, 0.5)));
    const key = landed + (t > S.tLive ? 'L' : '');
    if (key !== S.cardKey) { S.cardKey = key; S.card.material.map.paint((g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#FBF7EE'; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 26); g.fill(); g.strokeStyle = '#17161A'; g.lineWidth = 8; g.stroke(); g.fillStyle = '#6f6a62'; g.font = '800 40px Inter'; g.fillText(t > S.tLive ? 'AVG SPEED · LIVE' : 'AVG SPEED', 36, 76); g.fillStyle = '#17161A'; g.font = "800 140px 'Playfair Display'"; g.fillText(landed ? `${Math.round(sum / landed)}` : '–', 36, 236); g.font = '800 44px Inter'; g.fillText('km/h', 260, 230); }); }
  },

  view() { return { from: [-0.15, 5.3, 1.75], to: [0.12, 5.15, 1.6], look0: [0, 0.86, -0.55], look1: [0, 0.86, -0.5], fov: 44, ap: 0.0008 }; },   // high, looking down: the streets read (the low 'table' view hides them behind the front row)
};
