// b27 · the fastest way across town. Fits "Then a route finds the fastest way to your door."
// The model city at dusk from an aerial pass (a spline move with a little roll). Cars drive the grid; on the first cue a
// glowing route draws itself along the streets from a teal pin to a red pin, a courier car is labelled as it drives, and
// on the second cue the destination pin gets its label with the time. Bix waves from the plaza under the clock tower.
// Cue words: route · door (fallbacks: 20 % and 62 % of the shot). Names in FROM / TO, the time in ETA.
const FROM = 'You', TO = 'Your door', ETA = '8 min';

export default {
  build(k, shot) {
    const S = (shot.s = {}), { THREE } = k;
    const set = (shot.set = k.rooms.city(shot.root, { mood: 'dusk', trafficLanes: 12 }));
    S.tRoute = shot.at('route', 0.2); S.tDoor = shot.at('door', 0.62);
    S.route = set.route([[-3, 1.6], [-3, 0], [0, 0], [0, -3], [3, -3], [3, -4.4]], S.tRoute, Math.max(0.8, S.tDoor - S.tRoute - 0.2));
    S.bix = k.buddy({ ...k.LOOK, scale: 0.34 }, shot.root); S.bix.root.position.copy(set.spot('landmark')).setY(0).add(new THREE.Vector3(0.62, 0, 0.62)); S.bix.root.rotation.y = 0.4;
    k.label('from', S.route.start, FROM, { at: S.tRoute + 0.05, side: 'left', dy: -110 });
    k.label('courier', (t) => set.cars.carAt(t, 9, 0).clone().setY(0.18), 'Courier', { at: S.tRoute + 0.5, until: S.tDoor - 0.1, sub: 'on the way', dy: 120 });
    k.label('to', S.route.end, TO, { at: S.tDoor, sub: ETA, side: 'left', dy: -150 });
    k.sound(S.tRoute, 'swoosh', -9); k.sound(S.tDoor, 'pop', -6); k.punch(S.tDoor + 0.05, 0.4);
  },

  frame(k, t, shot) {
    const S = shot.s; shot.set.frame(t);
    const b = S.bix; b.idle(t, 1.7); b.wave(t, S.tDoor - 0.1);
  },

  view: (k, t, shot) => shot.set.views.aerial,
};
