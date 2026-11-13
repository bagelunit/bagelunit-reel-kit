# Deep Zoom - art direction

Cinematic macro photography meets a product render. Every scene is a real-feeling object or structure
lit in a near-black studio: glossy and translucent materials (ice, glass, water, metal), a soft key
light from the upper left, a cool rim light, specular highlights with a little bloom, a glossy floor
with a faint reflection, out-of-focus dust in front of and behind the subject, film grain and a
vignette. The camera moves slowly and with weight. The signature move is the dive: one continuous
camera move from an everyday object down through its crystal, its molecules, an atom, the nucleus and
the quarks, and back out again.

The look is adult, premium and documentary-grade. Think high-end science documentary or product
cinematography. It is never cartoony.

## Golden rules

1. **Nothing childish (owner rule, 2026-11-13).** No cute faces, mascots or characters. No bouncy,
   elastic or overshooting motion: every ease is smooth and weighty (sine, cubic, quart), and things
   settle, they never pop. No candy or saturated toy colours. No rounded or bubbly typography. No
   emoji-like icons, sparkles, stars or confetti. Prefer realistic materials, restrained motion,
   precise labels and a muted dark palette with the ice-blue accent.
2. **Bold documentary caps (owner rule, 2026-11-13).** All type is heavy upper case (Inter 900 for
   headlines and titles, 800 for labels, 700 for body lines), white, tightly tracked at large sizes,
   in short lines anchored to the picture. Emphasis is size and weight, never colour: `*words*` in
   asterisks become the bigger, heaviest line of the block. Never a thin light sans with one gold
   word. **Never draw an accent line or bar** in front of, under or beside a lower third, caption or
   title. Text builds in with a line wipe and a short slide, not a plain fade.
3. **Lead with a 3D subject.** Every scene shows an object, a structure or a field of molecules first;
   text is the caption to it. At most one headline per scene (7 words or fewer), plus up to 4 short
   labels (4 words or fewer) on fine leader lines.
4. **Always moving, never bouncy.** Every camera keeps a slow push and a yaw sweep across the scene
   (with parallax between foreground bokeh and the subject); objects turn or sway, molecules vibrate,
   lattices breathe, particles drift, light sweeps across glossy faces. Each scene opens with a short
   push-through and light sweep and closes with a soft light sweep (about 0.4 s), so cuts are not hard.
5. **Zoom one level at a time.** Object, material or crystal, molecule, atom, charges; land on the
   idea; zoom back out. Use `scale-dive` for the dive and `scale-dive` with `reverse: true` (or the
   custom `S.dive(..., { reverse: true })`) for the way back.
6. **Land on the word.** Every element arrives on its spoken word (`keyword` props or the label
   words). Something is on screen by 0.3 s; everything is settled about 1 s before the scene ends.
7. **Cite on screen.** Any scene that states a finding, number or date from a paper or report gets a
   `source` (`{ text, sub, keyword }`): a small dark panel with a bold SOURCE tag that appears on its
   keyword and stays to the end, in the corner that is free.
8. **Palette.** Blue-black studio (`#06080E`), text white `#EAF2F8`, secondary text `#B4C3D2`.
   Accents: ice blue `#7FD8FF` (kickers, leader dots, light paths, positive charge, the highlighted
   value), warm coral `#FF7A59` only for negative charge, heat, or the X and arrow on a thumbnail.
   Atoms use muted chemistry colours (oxygen a deep brick red, hydrogen pearl, carbon graphite).
9. **Truth on screen.** Every number, date and scale note comes from the video's research. Molecule
   geometry is real (water is bent at about 104.5 degrees; ice is a hexagonal lattice where every
   oxygen has four neighbours). Never draw a real person, a brand or a logo.

## Template guide

| Template | Use for |
|---|---|
| `hero-object` | The opening shot: one object the viewer could hold, with a lower-third title |
| `scale-dive` | Going down (or back up) through 2 to 6 scales, each label spoken in order |
| `crystal-lattice` | Ice or crystal structure; a surface turning liquid-like; a blade or sole on the surface |
| `molecule` | One molecule: shape, bond angle, partial charges, dipole |
| `particle-field` | Molecules as a crowd: rolling, vibrating, flowing, settling, scattering |
| `split-compare` | Two materials or states side by side |
| `big-number` | One headline figure (negative values supported) |
| `data-bars` | Comparing 2 to 6 values, including negative ones |
| `timeline` | 2 to 6 dated events |
| `title-card` | Chapter cards and the video intro |
| `quote-card` | A short quote or a line from a notebook (never an invented quote from a real person) |
| `cause-chain` | Processes: 2 to 5 steps linked by light paths |
| `thumbnail` | The video thumbnail: one still, rendered at 1280x720 from wide |

Alternate templates; avoid the same template twice in a row. A typical Quark Street arc:
`hero-object` (the everyday object) then `scale-dive` (down to the level that matters) then
`crystal-lattice` / `molecule` / `particle-field` (the mechanism) then `cause-chain` or `data-bars`
(the idea) then `scale-dive` with `reverse: true` (back to the object).

## Don'ts

- No flat cartoon shapes, outlines-only icons, doodles or mascots.
- No more than one headline; never put text over the subject's centre (labels sit at the side on
  leader lines).
- No fast cuts inside a scene, no shake, no strobe, no lens-flare stars.
- Do not colour atoms or bars in bright saturated hues; keep the accent for the one thing that matters.
- Do not use coral for anything other than negative charge, heat or a thumbnail mark, and do not
  colour single words for emphasis.
- No accent lines or bars next to text, no thin light type, no gold keyword.
