# 3D Print Generator

A browser app that turns parameters into **print-ready 3D models**. Everything is real geometry
in millimetres, built with a solid-modelling kernel, and exported as watertight STL / 3MF.

Open it and you land on a **model picker** — choose what you want to print, set it up, export it.
The generators so far:

- **Name tag** — lettering on a plate, with five ready-made school-tag shapes and an optional
  grade-and-section line under the name.
- **Lettering keychain** — a word as the keychain itself: solid welded letters, or letters on a
  backing that follows their outline. Reads across or stacked.
- **Key clicker** — a row of keyboard keys on a keychain. Spell anything, press them, they click.
- **Building miniature** — a scale model building at 1:144 or 1:100, designed in feet and inches: real floor
  slabs, 8-to-10 ft storeys, rooms laid out by plan and a stair core through every floor. Five
  building types to pick from — apartment block, office slab, commercial ribbon, curtain wall,
  modern — and nine ready-made modern city buildings to start from. It prints as a stack of
  storeys you lift apart to see inside. It can be an L that fits the
  inside corner of a shelf, have brick, stone, siding, board-and-batten or precast-panel walls, and
  carry a helipad, roof garden, plant, water tank or solar panels on its roof — or no roof at all.
- **Mobile suit hangar** — a maintenance-bay diorama for a Gunpla kit, sized for 1/144 or
  1/100. The parts move: a shutter door slides open in a dovetail track, a swing bridge turns
  out from the catwalk on a pin, and a lattice gantry tower slides along a floor rail with a
  crane arm that swings round on top. Walls plug into the base and nothing needs supports.
- **MS cage** — a maintenance cage for a Gunpla kit: a base, two pillars and truss beams,
  maintenance arms at up to six levels that swing in on hinge pins, and a waist support with a
  cradle. Bases carry dovetail keys on one side and sockets on the other, so cages press
  together into a row.
- **Image to SVG** — drop in a logo, a signature or an icon, trace it to clean vector outlines,
  download the **SVG**, and print it as a plaque, a silhouette or a stencil.
- **Pattern** — perforations, tilings, hatching and Voronoi cells, as a **DXF sketch for
  Fusion 360** at 1 unit = 1 mm, and as a printable panel to test the spacing first.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # geometry + export test suite
npm run typecheck
npm run build && npm run preview
```

## How it works

The sidebar is generated from each generator's **parameter schema** — nothing in the UI knows
about name tags or counters. Adding a generator means adding one module that declares its
parameters and a `build()` returning named parts; the controls, validation display, URL
permalink, presets and exports all come for free.

Controls sit in **groups**, and groups sit in **tabs** the generator names. That is the one piece
of layout the UI cannot infer: only the generator knows that Windows, Facade and Roof are the same
question asked three ways. Declare no tabs and there is exactly one, so the bar hides itself and
the sidebar is the plain list it always was — but every generator here declares them, because
eleven groups in one scroll is a scroll and not a form. Tabs must never *hide* a problem, so a tab
holding a flagged control wears a dot, red for an error and amber for a warning, and a tab whose
every control is currently switched off by a `visibleIf` drops out of the bar rather than opening
onto nothing.

Every parameter change updates the URL, so a configuration is a shareable link. Named **presets**
and **templates** are saved in the browser.

The two are not the same thing, and the difference is the point. A **preset** is a whole
configuration: it starts from defaults and replaces everything, text included. A **template** is
the *look* — style, font, sizes, colours, the keyring — with the content deliberately left out, so
applying one merges it over what you have and **the word you just typed survives**. Save a look
off one name, apply it to the next twenty, never retype either.

What counts as content is declared, not hardcoded, so the UI still knows nothing about any
particular generator: a parameter is content if it says it is, and free text says so by default.
That one rule covers the name, the grade and section, the pet's name, the keys to spell and the
word on the keychain, and a generator that needs a different answer sets `content` itself.

The model picker is driven the same way. A generator declares a `tagline`, `highlights` and an
inline-SVG `art` alongside its parameters, and the picker renders whatever it finds — so adding a
generator is still exactly one module, and it appears on the front page for free.

```
src/core/       kernel, text-to-solid, image-to-outline, pattern, params, exporters (DOM-free)
src/generators/ nametag/, keychain/, keyclicker/, building/, shelf/, drawer/, hangar/, mscage/, imagetrace/, pattern/
src/ui/         viewer, schema-driven panel, picker, image decode + store, app shell
```

The picker and the editor are one page: an empty URL hash is the picker, a hash carrying a
generator id is the editor. Both are pushed to history, so Back works and a shared link opens
straight into a configured model.

`src/core/**` and `src/generators/**` must stay DOM-free and worker-importable, so the kernel can
move off the main thread without touching anything above it.

### Some decisions worth knowing about

**Dimensions are measured off the screen, not off the generator.** The **Dimensions** button draws
the overall size on the model, and what it measures is the bounding box of the *visible* meshes —
which is what lets one implementation serve every generator and every view at once. In Whole it
measures the assembled model, in Parts the packed plate, and because hiding a part in the parts
panel is the same thing as making it invisible to the viewer, switching the others off measures
that one part on its own. Nothing in it knows what a building or a drawing is.

The three dimensions hang off three *different* offsets, and that is not tidiness: a name tag is
51 × 20 × 3.6 mm, and with depth and height on the same corner their two labels land on top of
each other and neither number can be read. The labels are canvas sprites re-scaled every frame
against the camera distance, so they stay the same size on screen — one sized in world units is
unreadable exactly when you have zoomed out to see the whole model. The placement is pure
arithmetic in `src/ui/dimensions.ts` and tested there, because a WebGL context is a terrible place
to find out that the height dimension is measuring the depth.

**Kernel: `manifold-3d`, only.** It guarantees manifold output, which is the whole requirement
for a printable file, and ships a 2D kernel (Clipper2) whose `offset` is the entire fillet story
here. Three.js is used *only* for display and never touches exported geometry.

**Every part is either 2.5D-prismatic or axisymmetric.** Manifold has no 3D fillet, so prismatic
parts get exact fillets from `offset(+r).offset(-r)` on the 2D section before extruding, and
round parts from `revolve()` of an already-rounded profile. Don't break that rule to "just round
a corner" — there is no fillet engine to fall back on.

**When a prism has to be soft from every angle, `softPrism` is the one dimension up.** A 2D
fillet only reaches the edges that run *along* the extrusion; the rim where the end caps meet the
sides stays square, and on an object whose whole point is that it looks moulded rather than milled
that rim is most of what you see. `softPrism` is the same erode-dilate pair applied as a sweep:
erode the section once by `r`, then for each slice a distance x in from an end, dilate that core
by sqrt(r² − x²) — the ball's radius where it crosses that slice — and extrude the slice's own
thickness. Stepped by **angle** rather than by x, so the slices stay even where the sphere turns
hardest, and each takes the *smaller* of its two radii so the result is inscribed in the true
surface rather than proud of it. Two things it will bite you on: `r` has to be under half the
section's thinnest limb or the erosion deletes that limb and the dilation never brings it back
(callers have to clamp it); and the slices must **lap**, because butted exactly they meet
on a shared plane with no volume either side and the part comes back as a stack of loose discs.
Grow them inward, where the neighbour is always the fatter one, so the union is unchanged and only
the contact becomes real.

**And leave the face it prints on square.** An edge rounded where the part meets the bed curves
out of it — a zero-degree overhang running right round the footprint. Give the profile a skirt
below its bottom line, let the ball round the skirt's edges instead, and slice the skirt off
flush. The skirt has to be *flush* with the profile, front and back: run wider, it puts a step in
the side just above the bed, and the ball dutifully rounds that instead of leaving the wall
straight.

**Overlap anything you add.** Landing a feature exactly on a face is a knife-edge coplanar
contact, and floating-point transforms turn that into a hairline gap — leaving the feature as a
separate shell that renders perfectly, passes every volume and manifoldness check, and prints as
loose debris. Several features hit this during development — most recently a keycap guide post
left standing on a seat it only touched, and a keycap top thin enough for the legend recess to cut
straight through it and sever the stem. `npm test` decomposes every part and asserts the piece
count: one for every body, and exactly one per glyph for lettering, with a floor on each piece's
volume so a shaken-loose sliver cannot pass.

**But overlap in the direction you meant.** A cutter that overshoots at *both* ends silently eats
whatever is on the far side. The keycap stem sockets did exactly that: they reached 0.5 mm past
the top of the boss as well as past its open bottom, which was invisible only because the legend
recess happened to reserve enough top face to absorb it. Take the recess away — a raised legend —
and the socket opened straight through the dish, leaving a stem-shaped hole in the cap's face.
Overshoot the end you need clear, and stop the cutter dead inside the material at the other.

**Cut the shaping operations last.** Booleans do not commute, and a union added after a cut simply
fills the cut back in. The keycap dished its top face and *then* unioned the stem on — and every
stem is a boss that rises to the full cap height, because that is what roofs its socket. The boss
plugged the middle of the scoop straight back up to the top plane, leaving a flat disc across the
face with the legend perched on it. It looked like a deliberate feature, which is why it survived
so long. Add the material first, take the shape out of it afterwards.

**A dish has to be sized by its far corner.** A spherical scoop on a square face is sized by where
it meets the top plane, and using half the face WIDTH puts that meeting circle inscribed in the
square: the four corners never get touched and stay standing at full height, with a hard circular
rim between them and the scoop. Size it to the outermost point of the footprint — the rounded
corner — and the scoop runs off every edge.

**`scaleTop` must be a pair, never a number.** `Manifold.extrude`'s type says `Vec2 | number`,
but the JS binding reads a scalar as a Vec2 and gets garbage out of it: the solid collapses to a
near-point instead of tapering — no error, and a perfectly valid manifold at the end of it. It was
silently shrinking a window cutter for some time before anyone noticed. Use `taperedExtrude()`
from `core/kernel/primitives` and the question never comes up.

**A hand-built cutter interpolates between the rings you give it.** A wavy split cut through
a bowl is a mesh whose top is two rings of vertices plus a fan to the centre. Built with only the
outer ring and that fan, the surface is LINEAR in radius, so the cut lands at the bowl's wall
partway between the wave and the centre vertex — a 6 mm wave arriving as 4 mm, sitting lower than
asked, and no error anywhere. Two rings at the same height make it exact at the wall whatever
radius the cutter is given.

**A warp can turn a solid inside out.** `Manifold.warp` applies whatever map you
give it without checking its handedness, so a map with a negative Jacobian determinant
silently inverts every solid it touches. Wrapping decals onto a round wall through the
natural-looking frame — arc to the right, outward toward the viewer, height up — which is
LEFT-handed at a surface seen from outside, determinant -r/s. The results reported clean
statuses, positive-looking geometry in the preview, and negative volumes; booleans against
them quietly did the opposite of what was asked. Check the sign, or check the volume.

**A scale model is mostly made of things too thin to print.** The building generator takes real
feet and inches and divides by the scale exactly once, which is the only way the numbers stay
honest — but at 1:144 a 5 in stud partition is 0.88 mm, a 9 in slab is 1.59 mm, and a 4 in
partition is 0.71 mm, which a 0.4 mm nozzle cannot lay at all. So every thickness is scaled and
then *floored* at two extrusions (walls) or three layers (slabs), and the readouts report the real
thickness the printed wall actually represents — 0.8 mm coming back as "reads as a 4.5 in wall".
The alternative is a model that silently stops being to scale in the one dimension nobody measures.

**An image reaches the kernel as an id, never as pixels.** A picture cannot go in a URL, and every
other configuration in this app survives a reload because it *is* the URL. So the value of an image
parameter is a content hash of the decoded bitmap; the bitmap lives in an `ImageRegistry` and
reaches `build()` through `ctx.image(id)`, exactly the way a font reaches it through `ctx.font(id)`.
That keeps permalinks, presets and the build cache key small, makes dropping the same file in twice
a no-op, and confines decoding — the one step that genuinely needs a canvas — to `src/ui`, where the
DOM already lives. IndexedDB holds the pixels so a reload finds them again; a link opened on another
machine reports a missing picture rather than a broken build.


**Text bypasses opentype.js's shaper.** `Font.getPaths()` routes through GSUB and throws outright
on lookup types opentype 2.0 does not implement — which fires on 3 of the 5 bundled faces,
including Inter. Glyphs are laid out with `charToGlyph` plus the kern table instead. Three further
opentype quirks are handled in `flatten.ts`: it negates Y, it drops the `Z` command for fill
paths, and `CrossSection`'s default `Positive` fill rule is wrong for glyph outlines (must be
`NonZero`, or counters fill in and script faces punch spurious holes).

## Printing

Defaults target a **0.4 mm nozzle, 0.2 mm layer, 256 × 256 bed**, editable under *Printer* — except
the building miniature, which designs to a fixed 256 × 256 plate and so offers no bed controls.
**Export layout** decides what the file holds, and the two answers are genuinely different things:

- **Flat to print** (default) — every part rotated into its declared print orientation, dropped to
  z = 0 and packed on the plate. What you see under *Parts* is what you print.
- **Assembled** — every part where it belongs in the finished model, still as **separate bodies**.
  A building comes out as a stack of storeys at their real heights that you can lift apart again,
  not a welded lump. For renders, for sending someone the object, or for arranging yourself in a
  slicer. Files get an `-assembled` suffix so the two never get mixed up, and an STL bundle's
  readme says so on the first line.

The viewer opens on **Whole** — the first thing anyone wants to see is the thing they are making,
and *Parts* answers "how does this print", which is a question you ask second. The wiring between
the two controls runs **one way only**. Picking an export layout shows you that layout, so you can
see the file before you download it; picking a *preview* changes nothing about the file, because
looking at the assembled model and then pressing STL must not quietly hand you something you cannot
print. One consequence worth knowing — a model too big for one plate blocks the **flat** export but
not the assembled one, since an assembled file was never going on a bed.

- **3MF** is the recommended export: one file, named parts, explicit millimetres, per-part
  colour. (Whether slicers actually honour per-object `displaycolor` is unverified — treat the
  colour as cosmetic. The geometry is correct regardless.)
- **STL** is one file per part, zipped with a readme when there is more than one. Parts are never
  merged into a single STL, because a slicer would read touching bodies as one solid with
  internal walls.

### Name tag: school tags and second lines

Five **templates** — Classic, Cloud, Scallop, Bubble, Capsule — each set the plate shape, the
raised frame and the hanging hole in one pick. They are a *parameter*, not a preset, which matters
in practice: switching template keeps the name you already typed and the sizes you already set,
where applying a preset would reset the lot. Sizes, colours, fonts and the hole dimensions stay
yours in every template; pick **Custom** to get the individual shape and border controls back.

The **second line** is the grade-and-section line under the name — "Grade 2 Jade", "Prep Blue".
Compose it from a grade and a section, or type a free line (a room number, a phone number). It
gets its own font and size, because a script name over a plain second line is the usual
combination, and a script face at 5 mm is exactly where the thin joins stop printing.

**Direction** stacks the lettering one letter per line, reading downward, for a tag that hangs on
a door or a strap. Rows step by the cap height rather than by each glyph's own extent, so the
column is evenly spaced whatever letters it is given, and a space holds its row open instead of
closing the name up.

Four things the lobed shapes do that a rectangle does not:

- Auto-sizing divides the text box by the fraction of the bounding box each shape can actually be
  written in. Those fractions are **measured**, not estimated — sizing a cloud off the rectangle
  hiding under its puffs comes out nearly square, and sizing it off the puff peaks puts the
  lettering in a valley. `npm test` re-measures them against the real geometry, so a claim cannot
  quietly drift away from the shape it describes.
- The padding is divided along with the text, because it is measured inside the writable area;
  the frame is added outside it, because it is a uniform offset from the outline and grows the
  plate one for one.
- A shape can declare a **minimum proportion**. A cloud that has grown as tall as it is wide —
  which a name over a second line will do to it — has no room left for puffs worth the name and
  comes out a lumpy square, so it is widened instead. Widening costs margin either side of the
  lettering; a squarer plate costs the shape.
- A shape can declare where its writable area **sits**, not just how big it is. The cloud is not
  symmetric top to bottom: the lettering lives low in the body, under the puffs, and the hanging
  hole lives up in the tallest puff. Because neither has to give way to the other, a hole at the
  top costs the cloud no extra height at all.

**Cloud** is a list of circles **measured off a drawing**, not generated from a rule. Every
attempt at a rule landed somewhere between a caterpillar and a wavy slab, because what reads as a
cloud is exactly what a formula smooths away: the two ends are different sizes, the tall dome is
off centre, and the scallops along the bottom are nearly tangent, so the notches between them are
deep. The circles lay the drawing out at 1.675 : 1.

A tag is usually wider than that, and the shape has two ways to give: the drawing may be stretched
up to 1.3×, and past that its middle — the dome and the scallop row — repeats while the two ends
stay exactly as measured. Stretch is spent first because it is the gentler distortion; repeat far
enough and the row is a caterpillar again. The repeat grows by half on each side, so the tallest
dome stays over the middle of the plate. Growing to one side only walks it off centre, and the
hanging hole then lands over a notch with nothing to be cut out of.

The **Scallop** template hangs from a tab added above the plate rather than a hole taken out of
it, because a scalloped edge has no flat run to put a hole in.

The **Classic** and **Capsule** templates frame themselves with an inset rounded rectangle rather
than by tracing the plate, because on those outlines a traced frame is just a smaller copy of the
plate and reads as a shadow. That rectangle is inset from the *bounding box*, which is only the
same thing as inset from the plate when the plate is itself a rounded rectangle — on the capsule's
round ends the rectangle's corners fall outside it. Nothing downstream clips the ring before it is
unioned on, so it used to run out past the edge as a square ledge. It is intersected with the
plate now: still a rectangle down the long sides, following the plate around the ends.

The **Cloud** and **Bubble** templates put their hanging hole *inside* the raised frame rather
than between the frame and the edge. Their frame traces the silhouette the whole way round, so a
hole at the usual distance from the edge would land on the rim and take a bite out of it — and a
rim with a gap in it reads as a mistake. The hole is only ever pushed inward; raise **Hole edge
offset** past that and your setting stands.

### Lettering keychain: the word has to hold itself together

A word as the object. Three styles, and the only real difference between them is what stops the
letters falling apart:

| | What holds it together | Colours |
|---|---|---|
| **Solid** | nothing — the letters have to reach each other | one |
| **Outlined** | a backing offset out from the word | two |
| **Double outline** | the same, twice, with a halo in between | three |

**Direction** is the same idea as the name tag's stacked mode: across by default, or one letter
per row reading downward for something that hangs off a zip. The keyring eye follows it — "before
the first letter" is the left end when the word reads across and the top of the column when it
reads down.

**Letters are welded by measured contact, never by eye.** The solid style pulls each letter along
the run until it genuinely overlaps the one before it, then a little further, and "genuinely" is
found by bisection on a real intersection test. The bounding-box answer is wrong in exactly the
cases that matter: "AV" have overlapping boxes long before the glyphs touch, because the A's foot
and the V's arm are at opposite ends of the cap height, so a box test reports the pair welded and
prints two letters. A letter that cannot reach contact without being swallowed stops at the cap
and is named in a warning.

**The same overlap means different things in the two directions.** Across, two letters meet at the
edges of two narrow strokes and want a real bite. Stacked, a whole cap-width band lands on another
whole cap-width band, so the same bite is an enormous weld — and it eats the row: driven a
millimetre into the "G" above it, a "Y" loses the valley between its arms and the column stops
reading as letters. Vertical gets a fraction of the number.

**A glyph is not always one piece.** The dot on an "i" or a "j" is its own contour with clear air
under it, and no amount of tightening the letters against *each other* ever reaches it, because
the gap is inside one glyph. The first two names tried here, "Amelia" and "Julia", both shed their
tittle. Every glyph's floating islands are now strutted back to its body first — widened to the
full width of the overlap where there is one, so a dot merges into its stem the way a letterform
is normally drawn rather than hanging off a visible wire.

**Everything above is a claim, so the piece count is asserted.** `npm test` decomposes every
exported part and counts the bodies: one for a solid keychain, one for a backing, one per glyph
for raised lettering. The build makes the same count in 2D and refuses — an *error*, not a
warning — when a configuration would come off the plate as two pieces, naming the letters that
are not attached.

**Weld fillet, and what it costs.** Rounding the notch where two letters cross is not decoration:
that notch runs the full depth of the part and is exactly where a keychain snaps. But the same
closing that bridges a gap also fills any counter narrower than it, so a small "o" quietly becomes
a blob. Rather than guess a safe radius — how much room a counter has is a fact about the font and
the text size, not about the code — the enclosed holes are counted before and after, and you are
told how many were lost.

**The bar is the answer when the weld is not.** It runs under the baseline and pokes just above
it, rather than hanging off the bottom of the bounding box: a word with a descender in it has its
box floor a fifth of a cap height below where the other letters stop, and a bar hung off that
floor holds hands with the "g" and nothing else. Stacked, it is a spine up the middle of the
column, which is the one line every centred glyph is guaranteed to cross somewhere.

**The eye finds its own attachment, and the joint is sized by area.** Nothing is assumed about
where the body starts, how thick it is, or what shape its edge has, because on a solid keychain
the eye has to meet a *letter* and a letter is mostly not there — an "A" has material at the far
left only down at the baseline, a "T" only up at the cap line. All three are measured instead: the
neck hangs at the height whose band picks up the most material, it is sized to the material it
finds there, and it is then driven in until it has eaten a set **area** out of the body.

Stopping a fixed distance past first contact is the obvious rule, and it is the one that shipped
first. It is wrong, because first contact against a convex edge is a *tangent point*: the shared
material is a thin lens that tapers to nothing at both ends, and the further the edge curves away
the less of it there is. Every backed preset joined on about 8.8 mm² that way except "Joshua",
whose "J" hooks left — it came away with **1.13 mm²**, which is one piece by every check the
exporter makes and a joint you could break with a fingernail. Sizing by area fixed it at 8.9.

Sizing the *neck* matters for the same reason. A backing is a blob and will take any neck offered;
a bare letter is a stroke, and a one-letter "J" is a hook about a fifth as thick as the neck the
eye would like. Hang a 6 mm neck off a 2.5 mm hook and the joint can never reach a full-height
bite however deep it is driven — there is not that much letter. Matching the neck to the stroke
makes the target reachable and stops the eye arriving on a stalk fatter than the letter holding
it. When even that cannot find a joint, the build says so rather than exporting it quietly.

`npm test` sweeps this across every bundled face — six words chosen for the shapes that give a
neck trouble, three styles, both ends, both directions — and fails if any of them reports a weak
joint or comes off the plate in more than one body.

**Print flat, lettering upward, no supports.** On the backed styles the backing, halo and letters
are separate coloured bodies of one object in one group, so a filament change at each step height
gives two or three colours off a single extruder.

**Initial: a name across a big letter.** One fat-serif capital (Ultra by default) with the name
in a script standing up across its face — the initial is the name's own first letter unless you
give another. The name is free to run off the letter's edges, and that decides how it is built:
set *on* the initial, everything past the edge would be an overhang over thin air, so instead the
name is extruded from the bed and has the initial cut out of it. Past the edge it is a solid column
of its own colour; across the letter it simply stands taller. One flat print, no supports, and a
filament change at the top of the initial colours exactly the name. The overlap between the two is
what holds it together, so the same piece count applies — slide the name off the letter and the
build refuses it. A dot out past the edge has nothing under it and is tied to its stem; a dot over
the letter sits on it. The eye can hang off the **top-left corner**, the tab such a letter is
usually hung from. The small text sits across the middle, flush along the top, or along the foot, with nudges and a tilt on top of that; it and the big letter each take their own font and height.

### Key clicker: read this before printing

A row of keycaps on a bar, with a keyring loop. Five kinds of part: the **body**, a **bottom
cover**, one **keycap** per letter, one **legend** per keycap, and — in printed-dome mode —
the **domes**.

**Pick your switch first, because it changes everything else.**

| | What you buy | Click quality |
|---|---|---|
| **Cherry MX or clone** | one switch per key | the real thing; 14.0 mm cutout, 1.5 mm plate |
| **Kailh Choc v1** | one switch per key | the same, in about half the height |
| **Printed snap dome** | nothing | a softer tick, and experimental — see below |

The MX and Choc cutouts are the published plate standards and are **not** adjustable. Getting them
wrong by a couple of tenths is the difference between a switch that clips home and one that falls
out in a pocket, so **Fit clearance** is the only thing that trims them — and it wants to stay
near 0.1 mm. The usual 0.25 mm that suits a sliding fit is far too loose here, and the app says so.

**The legend style decides which way up the keycap prints**, so pick it before you slice.

- **Raised** (the default) puts letters you can feel on top of the cap, as its own coloured body
  in the same group — the same trick the name tag uses. They stand on the face that would
  otherwise go on the bed, so the cap **prints the right way up, legend upward**, and that is how
  the preview lays it out. The skirt is then hollow over the plate and the stem hangs inside it:
  **turn supports on.**
- **Two-colour inlay** and **Engraved** cut the letter *into* the top face instead, so the cap
  **prints upside down**, top face on the bed. That is the better print by some distance: the stem
  grows off the bed instead of starting in mid-air, the top face is pressed flat against the
  plate, and **nothing needs support**. The inlay is then simply the first few layers, which is
  exactly what a filament change at layer N gives you — two-colour legends with one extruder.
- Either way the letter follows a dished top rather than floating over it, and the app flips the
  cap and its legend together. They share a group, so plate layout keeps them as one object.
- **The body prints plate-side down**, open side up. The cutouts then need no bridging.

**Assembly:** clip the switches into the plate from underneath, press the caps on, press the
bottom cover into its rebate until the bead snaps under. The cover comes back off with a
fingernail in either end notch when a switch needs changing.

**About the printed dome.** It is a shallow cone that buckles through centre and springs back —
the same principle as the metal dome in a membrane keyboard, and it is genuinely axisymmetric, so
it comes out of `revolve()` exactly. Whether it *keeps* springing back is the open question. Height
over wall thickness is what decides it; roughly 2–3 is the usable band and the app warns outside
that. Print in PETG, not PLA — and print one key first.

### Building miniature: it is a building, not a picture of one

**Five building types**, plus a plain one for houses and sheds. Each is a real architectural
language, and what separates them is which facade *elements* exist — never how they are drawn:

| Type | What it has |
| --- | --- |
| **Apartment block** | recessed balconies with solid balustrades, stair tower over the roof, open ground floor under the front |
| **Office slab** | ribbon glazing with mullion piers, a floor band at every slab line |
| **Commercial ribbon** | ribbons wrapping a chamfered corner, projecting spandrels, whole ground floor on columns behind a glazed shopfront, framed blank billboard up one end |
| **Curtain wall** | full-height glazed stripes, projecting stone base course, entrance canopy on posts, louvred parapet |
| **Modern** | punched windows divided into panes, glazed shop bays across the ground floor under a thin canopy slab |

Those are a **table of traits**, not four code paths — `styles.ts` is a dozen booleans per type and
`facade.ts` only knows how to build each element. Keeping it a table matters because the types
share nearly everything, and the moment they are four separate builders the shared parts drift.
The same table drives the sidebar: a type that gains balconies gains the balcony sliders in the
same edit, because `visibleIf` asks the traits rather than naming types by hand. **Windows**
defaults to *match the building type* and resolves to punched or ribbon from it — the type picks
the kind of opening, never how big it is. Sizes stay yours.

**Two traits are yours to override**, the way Windows is: *Ground floor* (same as above, shop bays — square or arched — columns under the front or all round, a stone base) and *Window panes* (divided by mullions and a transom, or one open light). The ground floor and the glazing are where real buildings differ most, so the type only suggests them. The nine *Modern:* presets — garage block, notched-corner tower, slim tower, stepped panel tower, arcade tower, shop block, arched townhouse, glazed-stripe tower, L-shaped tower — are built from these and the other controls, after the white city kits sold for model railways. A *guard rail* roof (posts, a top rail and a curb, cut from one thin wall so it cannot come off post by post) is available to every type.

**Shelf corner.** *Plan shape: shelf corner* makes the building an L: one wing along the back wall
of a shelf, one along the side wall, and the courtyard between them facing the room. The faces you
can see are a list (`faces()` in `shape.ts`) rather than "front, back, left, right", so windows,
mullions, columns and the wall finish all run round the six faces of the L with no special case;
the two against the shelf are marked blank and get nothing. Anything that stands proud by design —
a floor band, a base course, the eaves — is trimmed flush with the shelf planes in one cut at the
end, so the model actually goes into the corner. The core sits in the shelf corner where the wings
meet, the one place nobody can see into; each wing is then planned as an ordinary rectangle. A
pitched roof is two roofs, one per wing, run into each other — their union is the real thing, a
valley down the courtyard corner, with nothing special done at the join. It is built for the
left-hand corner and mirrored for the right.

**Wall finish** cuts joints into the face: running-bond brick, coursed ashlar, lap siding, board
and batten, or precast panels jointed on the window bays. A real brick course is 2⅔ in — 0.47 mm at
1:144, two layers with a sixteenth of a millimetre of mortar between them — so joints are floored
at two layers across and one nozzle wide, the pattern is enlarged until each brick is at least
twice its joint, and the app says by how much (2.6× at 1:144) and which scale shows it true (1:48).
The joints stop short of the lip outside the storey tongue, so a finish cannot break into the groove
of the storey above.

**On the roof**: a helipad over the core (in place of the plant room, the pad sits where the stair
comes up), a roof garden with planters and trees, air-handling units on a curb, a timber water tank
on a five-legged stand, or tilted rows of solar panels. Each goes on the open part of the deck —
inside the parapet, in front of a penthouse, clear of the plant room — prints with nothing past 45°
except the tank platform's bridge, and comes out as its own part so it can take its own colour.
*Roof: none* leaves the top storey open, with nothing keyed onto its wall head.

Everything you type is a **real-world dimension**. Storey heights and room sizes are in feet, wall
and slab thicknesses in inches, and `derive()` divides by the scale exactly once. At the default
1:144 a foot is 2.12 mm, so a 9 ft 6 in storey is 20.1 mm and a 48 × 32 ft building is 102 × 68 mm.

**Scale is a list, not a number**: 1:48, 1:72, 1:87 (HO), 1:100, 1:144, 1:160 (N), 1:200, plus
Custom for anything else. A scale is a convention you work *in* — other people's figures, cars and
trees have to stand next to it — so typing 1:137 gets you a model that matches nothing. The same
list is read by the dropdown and by the advice, which is why a warning can say "1:144 would fit it
on one plate" instead of inventing a scale you cannot select.

The scale is checked rather than trusted. `npm test` builds a storey with every facade feature off
— which is a slab plus a rectangular wall ring, and so has a **closed-form volume** — and asserts
the kernel's answer matches to under a part per million at 1:48, 1:87, 1:100, 1:144 and 1:200. It
then measures the built mesh back: a bar driven through the model leaves exactly the two walls it
passed through, and they come out 10.00 real inches. Model millimetres divide back to the exact
feet that were typed, and each scale is restated the way a modeller would check it — twelve real
feet make one model inch at 1:144, one real metre makes ten millimetres at 1:100.

**The plate is fixed at 256 × 256 mm** and is not a setting. A building is the one thing here whose
size is dictated from the other end — you choose a real building and a scale, and the millimetres
are whatever falls out — so the plate has to be the fixed point the scale advice is measured
against. "1:144 would fit it on one plate" means nothing if the plate is also a variable.

It is the one control that changes every dimension at once, in both directions. **Downwards**: at
1:200 a 5 in partition is 0.63 mm and gets clamped to 0.80 mm, so the model quietly stops being to
scale — the readout says so. **Upwards**: at 1:100 nothing is clamped and a 5 in partition is a
true 1.27 mm, but the same building is 44% bigger and two of its four pieces fall off a 256 mm
plate. `validate()` predicts that with the same shelf arithmetic `packPlate` uses, because comparing
areas says four 146 × 98 mm storeys fit a 256 mm bed with room to spare, and the packer — correctly
— gets two on and leaves two off.

**Floor to floor is not ceiling height.** The slab comes out of it, and the app says so: 9 ft 6 in
floor-to-floor over a 9 in slab is 8 ft 9 in clear. Below 8 ft you get a warning, because that is
below habitable height nearly everywhere.

**One plan serves every storey**, and that is deliberate. In a real building the structure lines up
floor to floor and the stair lands in the same place each time; a plan reshuffled per level would
put the stairwell somewhere new on every slab. The ground floor may differ in exactly one way — it
can be an open lobby — and even then it takes its core *from the full plan* rather than deriving
one, or the ground-floor shaft would sit where the stair above it does not come down.

Three plan types. **Rooms** subdivides the floor plate, always cutting the largest room next so you
get rooms rather than one hall and a row of cupboards. **Corridor** runs a spine down the long axis
with a row of rooms each side and the core closing one end. **Open** leaves the plate clear. A core
is pinwheeled: four cuts that tile the plate around the shaft *and* enclose it, so the shaft needs
no walls of its own and no leaf is ever a non-rectangle.

**The order of the booleans is the design.** Windows are cut from the shell **before** partitions
are unioned on — a partition landing on a window would otherwise have its tie into the exterior wall
cut away and be left standing loose; cut first and it bridges the back of the opening, which is what
you see through real glass. A **balcony recess** is the opposite case and goes in *after* the
partitions, because it is 6 ft deep and they would fill it straight back in; that cut cannot strand
anything, since every partition is welded to the slab along its whole length. The stair is unioned
on **last**, because a doorway in a shaft wall reaches past that wall and would bite a tread.

**Anything standing on the outside of a wall is a loose piece waiting to happen**, and this is where
the four types cost the most care. Mullions are *holes in the ribbon cutter*, not bars added back
afterwards — added back, a mullion that happened to land on the entrance was welded to nothing.
Canopy posts come with an apron, because they land outside the footprint where there is no slab
under them. Columns under an open ground floor are dropped when they fall outside the outline,
which on a chamfered plan is every bay near a corner — but they are set out from the column's own
face, not the wall centreline, because a column is thicker than the wall it stands in for and one
centred on that line hangs half its width outside the building. Set out the other way, *every*
column on every face was refused and the open ground floor came out as a bare slab with six storeys
standing on nothing. Alignment pins are placed per *storey*,
because the corner they were set out from is not on the building once it is chamfered, and is not
there at all on a floor that stands on columns. Each of those was four perfectly manifold
millimetres of plastic floating beside the model, and `npm test` now asserts one positive shell per
part for every type on both the ground and an upper floor.

**Closing an opening means not cutting it through.** *Glaze the windows* and *Hang the doors* do
not drop a pane into the hole afterwards — a pane that exactly fills its opening meets the jambs on
four coincident planes, which is the loose-shell failure above, and it is a separate body waiting to
rattle out. Instead the cutter stops short of the inner face, leaving a thin pane of the wall's own
material at the back of a reveal. That cannot come away from a wall it has always been part of, it
braces the opening, and it takes the ribbon-window warning with it: the wall over the opening is no
longer bridging thin air. Both are bounded by what the wall can spare. A 5 in partition at 1:144 is
0.88 mm, and half of that split two ways is a tool mark rather than a reveal, so the door takes its
whole reveal on one face and the app says which compromise it made; below that, the doorway stays
open and the app says that too.

**What the model actually stands on.** An open ground floor is the one place a miniature building
balances on sticks, so two things hold it up rather than one. The column's minimum is a
*slenderness*, not just a real-world size — nothing leaves thinner than an eighth of its own clear
height, which turns a 14 ft ground storey's 2.8 mm post into 3.5 mm, reported the way every other
clamp here is ("reads as a 1 ft 8 in column rather than 1 ft 4 in"). And the commercial type gets a
**glazed shopfront set back behind the columns**, which is what a shop has under it and also what
turns eighteen cantilevers into a braced frame. Ask for it *open* instead and the app warns that
nothing is bracing them.

**The billboard is a frame, and the face inside it is left blank.** A raised border standing proud
of a recessed panel, built one storey at a time because a storey is what prints — the stiles run the
full height of every segment so the stack butts into one continuous frame, and the rails close it
only where the run actually ends; above four floors the run breaks into a big board and a smaller
one over it. The face is deliberately empty: lettering at 1:144 is a quarter-millimetre of relief,
which is mush off the printer, and a blank board takes a decal, a paper print or paint. Two things
it has to clear to exist at all — the spandrel band, or that band runs across its face at every
floor line, and the *chamfer*, because a board set out from the bounding corner hangs over a corner
that is no longer on the building.

**Flat roofs come four ways**: bare deck, deck with a parapet, parapet with a **rooftop penthouse**,
and the plant room over the core. The penthouse is not the plant room with different numbers — the
plant room goes where the lift and stair come out, while the penthouse is a storey in its own right,
set back inside the parapet, holding the back of the roof and leaving the front a terrace, vented
through its walls by two crossing slots rather than a ring of 1 mm fins.

**Pitched roofs are an intersection of half-spaces**, not a loft — Manifold has no loft, and a
hand-built ridge-and-hip mesh is the kind of code that works on a square plan and comes out inverted
on a long thin one. Four tilted boxes intersected with the eave prism is exact at any pitch; a gable
is the same construction with the two end planes left out, which is what a gable is.

**Printing.** One part per storey by default, each slab-down with no supports. Stack them in order
and you can lift the building apart to see the rooms. *One solid piece* seals it instead.

**The storeys key together with a tongue and groove**, not with four pegs. A peg is capped at the
wall's own thickness — 1.2 mm at 1:144 — so it stops the stack sliding and can do nothing else. A
rib run round the whole wall head into a groove in the underside of the slab above meets along
hundreds of millimetres instead: the pieces find each other on the way down and cannot rack. Pins
are still there for the two places a tongue cannot go, and the fallback is automatic and stated: an
**open ground floor** has no wall head at its top, only columns, so a rib there would be a loose
ring of plastic; and the top storey of a **pitched-roof** building carries a wedge whose underside,
over the wall line, can be thinner than the groove is deep. A wall or slab too thin for the joint at
all falls back to pins and says why. The groove is cut **last**, after the facade — a spandrel band
bites half the wall thickness and is unioned on at step 8, which would fill the outer half of a
groove cut any earlier: a joint that reads perfectly in the viewport and will not go together in
the hand. `npm test` asserts every part comes out
as a single positive shell — a hollow roof's sealed cavity shows up in `decompose()` as a
**negative-volume** piece, which is fine; a second positive piece would be a wall that came away.

### More than one plate is not a failure

The plate packer used to answer one question — *does this fit a 256 mm bed?* — and drop whatever did
not. That is the right answer for a nametag and the wrong one for anything with big pieces: a
building's storeys at 1:100 are about 150 × 100 mm each, so only two share a 256 mm bed whatever the
packer does. Dropping the rest would leave the preview missing floors and the export a building
with no roof, with nothing to say so but an error message about a bed.

`packPlates` runs the same shelf packer again on whatever would not fit, until nothing is left. Two
things follow from that, and they are worth keeping straight:

- **Leftover is not overflow.** A part that ran out of *this* plate starts the next one. A part wider
  than the bed itself can never land anywhere, so it is refused — and that, only that, is what makes
  `fits` false and blocks the print.
- **Each plate is centred on its own origin.** Sliding plate 2 to the right of plate 1 is a drawing
  decision, and it belongs to whoever draws the beds. The viewer offsets a *copy* of each part's
  vertices; the export reads the originals, so plate 2 lands on the middle of its own bed rather than
  280 mm off the side of plate 1's.

Exports follow the plates: the STL zip grows a `plate-1/`, `plate-2/` folder each, and the 3MF becomes
a zip of one 3MF per plate. A 3MF *is* a plate — a slicer opening one expects what is inside to sit on
the bed — so the alternative, one file with the second plate shifted sideways, would be flagged as
off-bed by every slicer and taken apart by hand by every user.

### Image to SVG: what the four stages are each undoing

Threshold, walk the pixel cracks, straighten, then round. Each stage exists to undo damage the
previous one could not avoid, and the ORDER is the whole design.

**Crack following, not chain coding.** The outline is walked along the boundaries *between* pixels
rather than through their centres. That boundary is closed by construction, lands on exact
integers, and — the reason it matters here — gives a one-pixel-wide stroke a rectangle with real
area, where a centre-line trace would produce a there-and-back line that Clipper2 collapses to
nothing.

**Holes come out for free, from winding alone.** Every crack is emitted with ink on its left, so
outer boundaries wind one way and the counters inside them the other, and the whole lot goes to
Clipper2 under the **NonZero** fill rule. No containment analysis, no nesting pass. This is
deliberately the same bargain the font pipeline strikes with glyph outlines, and the traced rings
even share its flattener — so a curve traced off a photo is subdivided to the same millimetre
tolerance as a letterform, and the SVG and the printed part cannot disagree about which side of a
contour is solid.

**Simplify BEFORE smoothing.** Reversing those two rounds the pixel staircase into scalloped edges
and then locks them in — the failure mode of every naive vectoriser. Douglas–Peucker (the *Detail*
control) is what removes the staircase; smoothing only ever rounds what survived it.

**Smoothing cannot tell a corner from a staircase, so it is told.** The jag left by a coarse
*Detail* and the deliberate right angle of a logo are both 90° turns. Turns sharper than
*Keep corners above* stay sharp, which is why a square stays square at full smoothing.

**A diagonal touch is the one genuinely ambiguous pixel pattern**, and it is resolved toward
printability: two ink pixels meeting corner to corner are welded into one body by default, because
the alternative is a zero-width contact that slices into two loose pieces. The despeckle filter
reads diagonals the same way — otherwise a diagonal stroke is culled a pixel at a time as "specks"
while the tracer is busy welding it together.

**The SVG is millimetres, and it is the same geometry.** One `<path>` with `fill-rule="nonzero"`,
`width`/`height` in mm alongside a unitless `viewBox`, so it opens at true size in Inkscape or a
laser cutter and still scales in a browser. Splitting the rings into separate elements would paint
every counter back in as a solid shape.

**The mask preview is the control.** The sidebar draws what the current settings will *actually*
trace, not a thumbnail of the source — a threshold slider without one is a slider you drag until
the 3D view stops looking wrong. The generator supplies that preview through its schema, the same
way it supplies `visibleIf`, so the panel still knows nothing about thresholds.

**Four ways to make it real**, and each has its own printability trap, which the app warns about
rather than silently producing: a **silhouette** of several blobs prints as several loose parts; a
**cut-through stencil** leaves every counter — the middle of an O — with nothing holding it; an
**engraving** deeper than the plate cuts straight through; and anything with strokes under one
nozzle width will not print at all. A hanging hole grows the plate rather than eating its margin,
and on a bare silhouette it arrives on a lug pushed *into* the artwork, never tangent to it.

**Images are downscaled to 768px on the way in.** Past roughly that, extra pixels stop adding shape
and start adding JPEG ringing for the despeckle filter to take straight back out — and every one of
them would otherwise be walked again on every slider drag.

### Pattern: one number that means the same thing in every family

The controls are **Pitch** and **Web**, and they mean the same thing whichever of the
seventeen patterns is selected: pitch is centre to centre, web is the material left between
neighbours *at their closest approach*. Holding that steady is most of the work in here.

**The web comes off the tile, not out of the pitch.** Tiles are generated at full size and inset
by half the web each. Scaling a tile about its centre instead gives the same answer for a hexagon
and the wrong one for every brick — a 40×10 brick scaled to leave 1mm at the ends leaves 0.25mm
at the sides, and the control silently stops meaning anything.

**A staggered grid moves its rows, not just its columns.** On a staggered perforation the nearest
neighbour is diagonal, so the rows close up to `pitch · √3/2` to keep that diagonal distance at the
pitch. Keeping the straight grid's row spacing would leave a staggered sheet with thicker walls
than asked for and less open area than the readout claims. Done properly it packs `2/√3` — about
15% — more open area into the same sheet at the same wall, which is exactly what the test asserts.

**The sloped families compute their row spacing.** A row of 45° chevron arms stacked one pitch
apart *vertically* is only `pitch/√2` apart *perpendicular*, so the strokes run into each other
while the control still says the gap is open. Chevron and wave each divide their vertical pitch by
the cosine of their own steepest slope. That is the whole reason one number survives across ribs,
chevron, wave, cross-hatch and knurl.

**Winding is a live trap here, not a detail.** Cross-hatch and knurl are two stroke sets that
deliberately overlap at every crossing. Under the NonZero fill rule two rings of *opposite*
winding cancel, so had the two sets been built in different directions the result would be a
diamond punched out at every junction — which reads as a deliberate pattern rather than as a bug,
and would sail through review. Every ring is normalised counter-clockwise before the kernel sees
it, and a test asserts that a square sitting on a crossing comes back solid.

**Herringbone only closes up at 2:1.** With bricks of length L and width W it tiles on the lattice
(3W, W) and (−W, W), whose cell area is 4W² and holds exactly two bricks — which is only true when
L = 2W. So the length is the control and the width follows. Every tiling's claim to *tile* is
checked by area rather than by eye: the union of the tiles has to equal their areas added up (no
overlaps) and has to fill an interior window completely (no gaps). A herringbone that is subtly
wrong still looks like a herringbone in a screenshot.

**Voronoi counts cells on the panel.** Seeds are scattered over a disc that covers the panel's
corners, and for a rectangle that disc is about 1.6× the panel — so asking for 70 cells and
counting 42 is what taking the number at face value gets you, and a user would reasonably read
that as the control being broken. The count is scaled by the area ratio. The arrangement is fully
seeded, so **Variation** is a number you can share and get the same panel back; a pattern that
came back different after a reload would break the promise every other control in this app keeps.
Relaxation is Lloyd's algorithm, which is a variance-reduction step by construction — so the test
for the *Evenness* control measures the spread of cell areas and asserts it falls.

**A pitch that is too fine is refused before it is built, not after.** A 1mm pitch across a 300mm
panel is about 180,000 tiles. The count is estimated from the area first and the build stops with
a message; finding out by generating them means allocating them all first.

**What the modes cost.** Cutting through is a grille, and the app checks what is *left* — if the
web does not all join up you get told how many loose pieces it would print as, which is what
Invert does to a tiling. Raised gives the pattern its own coloured body in the same group as the
panel, for a filament swap. Fluting is Ribs with the Raised mode: a 2D sketch cannot carry a round
groove profile, and this kernel has no loft to give it one.

### Taking it into Fusion 360

The **DXF** button writes R12 (AC1009) with closed `POLYLINE` entities at **1 unit = 1 mm**, on
two layers — the pattern, and the panel outline. In Fusion: *Insert → DXF*, pick the sketch plane,
and extrude, cut or emboss straight off the profiles.

R12 with `POLYLINE`/`VERTEX`/`SEQEND` rather than anything newer, because that combination is the
one every CAD package reads without argument. `LWPOLYLINE` is smaller and would be a lie in a file
stamped AC1009, and a newer stamp drags in `CLASSES` and `OBJECTS` sections this has no business
inventing. The **closed flag matters**: without bit 1 on group code 70 every ring arrives as an
open profile and nothing can be extruded at all.

Everything is flattened to straight segments. A DXF `ARC` or `SPLINE` would be tidier in the
sketch, but by that point Clipper2 has already resolved the geometry into polygons and re-fitting
arcs would be guessing at curves the kernel no longer has. The rings come straight off the *same*
sections the printed solids came from, so the sketch you extrude in Fusion and the part that comes
off the printer cannot disagree.

DXF carries no unit of its own — the numbers are bare. `$INSUNITS` says millimetres for readers
that look, and the file is written in millimetres either way, so an importer that ignores it and
assumes mm still lands on the right size. The SVG button hands out the same profiles for laser
cutters and drawing tools.

## Fonts

Five bundled faces (OFL / Apache-2.0, licences in `public/fonts/`), chosen because heavy weights
with closed counters are what survive printing at small sizes. You can also load your own
`.ttf` / `.otf` / `.woff` — parsed entirely in your browser, never uploaded. WOFF2 is not
supported (it needs an external decompressor).

Uploaded fonts are less predictable than the bundled ones; watch for the thin-stroke warning,
which measures whether any stroke is narrower than one nozzle width.
