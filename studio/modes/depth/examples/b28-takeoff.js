// b28 · wheels up. Fits "And the plane takes off right over the city."
// The airport at the north edge of the model city, seen from beside the runway at dusk. The jet waits at the threshold;
// on the first cue it rolls, rotates and climbs out over the east of the city, drawing a contrail, with a callout riding
// it. The control tower's beacon blinks and gets its own label; on the second cue the city label lands. Bix cheers on the apron.
// Cue words: off · city (fallbacks: 18 % and 66 % of the shot). The flight label in FLIGHT.
const FLIGHT = ['Flight 409', 'departing 6:40'];

export default {
  build(k, shot) {
    const S = (shot.s = {}), { THREE } = k;
    const set = (shot.set = k.rooms.city(shot.root, { mood: 'dusk', trafficLanes: 8 }));
    S.tOff = shot.at('off', 0.18); S.tCity = shot.at('city', 0.66);
    set.takeoffAt = S.tOff; set.takeoffLen = Math.max(2.2, shot.t1 - S.tOff + 0.4);
    S.bix = k.buddy({ ...k.LOOK, scale: 0.3 }, shot.root); S.bix.root.position.set(-1.1, 0, -7.25); S.bix.root.rotation.y = -0.2;
    k.label('flight', set.jet.g, FLIGHT[0], { at: S.tOff + 0.35, sub: FLIGHT[1], side: 'left', dy: -170 });
    k.label('tower', set.spot('tower'), 'Tower', { at: shot.t0 + 0.4, side: 'right', dy: -120, until: S.tCity - 0.1 });
    k.label('city', set.spot('landmark'), 'The city', { at: S.tCity, side: 'right', dy: 60 });
    k.sound(S.tOff, 'riser', -8); k.sound(S.tOff + 0.9, 'whoosh', -10); k.sound(S.tCity, 'pop', -7);
  },

  frame(k, t, shot) {
    const S = shot.s; shot.set.frame(t);
    const b = S.bix; b.idle(t, 2.6); b.cheer(t, S.tOff + 0.6); b.hop(t - S.tOff - 0.7, 0.08);
  },

  // from beyond the runway's far side, looking back at the terminal and the city. The lens drifts along a spline while the
  // look point follows the jet itself (frame() runs before view(), so the jet is already where it is at t)
  view: (k, t, shot) => {
    const j = shot.set.jet.g.position, lead = 0.6 * k.clamp((t - shot.s.tOff) / 1.2);
    return { path: [[-6.2, 0.9, -13.4], [-4.6, 1.05, -13.2], [-2.6, 1.3, -12.8]], look: [j.x + lead, Math.max(0.35, j.y * 0.85 + 0.12), j.z + 0.15], fov: 44, ap: 0.0008, roll: [0, 3] };
  },
};
