# Depth examples: lit-room shots

Twenty-eight finished shots in the depth look. Each file is a complete shot: copy it into a reel's `shots/` folder, add a cut for
it in `cuts.js`, then change its words and labels to fit your line. All of them use the set builders in
`modes/depth/parts/rooms.js` (b09–b13 and b21 use the workbench, `k.rooms.bench`) and Bix from `parts/buddy.js`. Read a file's header comment first: it lists the line it
fits and the cue words it listens for. Every cue has a fallback, so a shot still plays if your script never says that word.

| File | The picture | Fits a line like | Cue words |
|---|---|---|---|
| `b01-board-brief.js` | Two cards fly onto a corkboard and pin themselves, a red string links them, Bix points from a crate | "Tell it what you sell and who your ideal customer is." | sell · customer |
| `b02-map-picks.js` | A little town on a table: six pins drop, a magnifying glass sweeps, the right three get a ring and a ✓, the rest grey out | "It finds leads, researches them and picks the best fits." | finds · researches · fits |
| `b03-machine-out.js` | Cards ride a belt into the sage press, Bix pulls the lever, the gauge swings, envelopes ride out to an OUTBOX, one letter lifts toward the lens | "Then it turns that research into personal emails." | turns · personal |
| `b04-dashboard.js` | A bright live board fills the frame: four stat cards land and count up, LIVE pulses, the stage strip fills, a fresh card pushes in; Bix points from the corner | "And it comes with a live dashboard for your whole pipeline." | live · pipeline |
| `b05-tanks-flow.js` | Glass tanks joined by pipes; tokens flow from NEW to TALKING to BOOKED while Bix works a lever | "It manages your whole sales pipeline." | manages |
| `b06-calendar.js` | A week planner: two meeting cards pop into slots stamped PROPOSED, a pencil hovers over each | "and works toward booking meetings." | booking |
| `b07-night-desk.js` | Bix types at a desk while days race past the window and a 24/7 neon lights up | "all running 24/7 on your computer." | 24/7 |
| `b08-shop-crowd.js` | A shop at night: the neon word lights, the OPEN sign flips, small Bixes walk in through the lit door and hop | "Its only job is to get you customers." | customers |
| `b09-wake-tap.js` | A mallet slams the desk and the laptop stays dark; Bix taps one key and the screen wakes with a light sweep and a spark trail | "Hitting it harder won't help. One light tap wakes it up." | harder · tap |
| `b10-lid-lift.js` | A gadget case on the workbench: glass and cover lift apart, a copper grid draws on, rows flare, then columns | "Under the glass there's a grid: rows one way, columns the other." | glass · rows · columns |
| `b11-one-then-all.js` | Close on one bulb of a light board; it lights, the camera pulls back as the rest light in a ripple, a scan bar sweeps | "It checks one spot. Then every spot, many times a second." | one · every · second |
| `b12-pull-lines.js` | A magnet lowers over a tray of tokens; curved field lines draw up to it, the tokens ride the lines; a badge counts the gap down | "As it gets close, it pulls the charge up toward it." | close · pulls |
| `b13-crater-lock.js` | A field of breathing bars on the bench: a crater opens where Bix points, lock-on brackets snap tight, a FOUND tag pops | "Where you touch, the numbers dip, and it locks onto that spot." | dip · locks |
| `b14-rain-pings.js` | A shopfront in the rain: drops hit the window on a schedule, each one a ring and a PINGS tick; Bix flinches | "Rain hits the glass and every drop looks like a tap." | rain · tap |
| `b15-follow-card.js` | An alternative ending: Bix presses Follow on a big profile card (ripples, "Following ✓"), a paper plane flies at the lens | "Hit follow, and I'll send it straight to you." | follow · send |
| `b16-route-tiles.js` | High over the table town: a route on the main street cracks into numbered tiles that lift, take score colours and land | "It splits your route into pieces and scores each one." | pieces · each |
| `b17-car-pings.js` | Toy cars drive the streets; each pings, a speed chip streams into a live AVG card; badge counts | "Every car sends its speed, and it adds them up live." | speed · live |
| `b18-past-slabs.js` | A 3D chart floats over the town: past days rise as slabs, a curve draws, today lights up and beams to its block | "It remembers every past Tuesday, so it knows 6 pm gets busy." | past · busy |
| `b19-queue-ripple.js` | A queue of toy cars: the front brakes, the red stop travels backward car by car with a ring on the road; QUEUE counts | "One car brakes, and the jam ripples back down the road." | brakes · back |
| `b20-glow-network.js` | The town dims; nodes lift off every block, links draw outward hop by hop, messages run along them | "Behind the scenes it's one big network, passing messages along." | network · messages |
| `b21-stack-tower.js` | Numbered blocks lift off the bench, arc and stack into a tower, the total card pops, the badge sums them | "Add every piece together: 34 minutes." | together · minutes |
| `b22-beacon-rings.js` | A parcel on a stoop with a round tag that pulses a ring on every word; a dashed range circle sweeps the pavement | "The tag pings every few seconds, and anything nearby can hear it." | nearby |
| `b23-sealed-note.js` | A note rises from the laptop, folds, a padlock snaps on, it flies out of the window to a cloud with a trail | "Your note gets locked before it leaves, then it flies to the cloud." | locked · flies |
| `b24-pull-back.js` | Close on one glowing block, then a spiral pull-back as thousands of dots light out across the table and floor; badge rolls into millions | "It's not one device. It's millions of them." | millions · helping |
| `b25-close-in.js` | Bix walks toward a lost bag: soft rings turn into sharp pulses with a riding time counter, the glow collapses to "4 m", an arrow lights on a handheld | "Close up, it switches to exact pulses and points you right to it." | exact · metres · points |
| `b26-tap-reveal.js` | The studio table: a hand taps a dark phone (a ring ripples, the screen wakes), then the phone goes x-ray and three callouts pin to the battery, board and camera | "One tap wakes the phone, and inside you can see every part." | tap · inside |
| `b27-city-route.js` | The model city from an aerial spline pass: cars drive, a route draws itself between two pins, a courier car and the destination get callouts | "Then a route finds the fastest way to your door." | route · door |
| `b28-takeoff.js` | The airport at dusk from across the runway: the jet rolls and climbs out over the city with a contrail, the camera follows it, callouts on the jet and the tower | "And the plane takes off right over the city." | off · city |

## Making one yours

- **Words on things** (sign text, card titles, screen rows, tray labels) are plain strings near the top of `build()`.
  Change them to your topic. Keep signs to one or two short words.
- **Timing** comes from `shot.at('word', fallback)`. Point it at a word your voice really says in that shot.
- **The camera** is `view()`. Return the name of one of the set's views (`'wide'`, `'screen'`, `'line'` …) or your own
  `{ from, to, look0, look1, fov, ap, focus }` in set coordinates (metres, floor at y 0, the back wall at z ≈ -3.2).
- **Colours**: each room takes a `wall` family: the kit's warm plasters clay, sage, butter, oat, denim, moss (or the deep night
  ones: indigo, teal, slate, plum, night, wine, ocean, midnight, olive). Change the wall from one shot to the next so cuts
  read as new places.
- **Bix** wears the kit look (`{ ...k.LOOK }`: denim overalls, red cap) in every shot; dress him differently per topic if you like.
