# 3D Print Generator

A browser app that turns parameters into **print-ready 3D models**. Everything is real geometry
in millimetres, built with a solid-modelling kernel, and exported as watertight STL / 3MF.

Open it and you land on a **model picker** — choose what you want to print, set it up, export it.
Eleven generators so far:

- **Name tag** — lettering on a plate, with five ready-made school-tag shapes and an optional
  grade-and-section line under the name.
- **Lettering keychain** — a word as the keychain itself: solid welded letters, or letters on a
  backing that follows their outline. Reads across or stacked.
- **Pet bowl** — a cat or dog food bowl with a wavy two-colour body, a name plaque and a
  non-slip foot. Each colour exports as its own part.
- **Table lamp** — a two-part table lamp built round a threaded E27 holder: a cone base the
  socket clamps to, and a fluted shade that either sits on it or hangs from the shade ring. Swirled
  mushroom or pleated empire, from the same surface. It checks the bulb you name clears the inside
  of the shade at every height.
- **Key clicker** — a row of keyboard keys on a keychain. Spell anything, press them, they click.
- **Building miniature** — a scale model building at 1:144 or 1:100, designed in feet and inches: real floor
  slabs, 8-to-10 ft storeys, rooms laid out by plan and a stair core through every floor. Four
  building types to pick from — apartment block, office slab, commercial ribbon, curtain wall —
  and it prints as a stack of storeys you lift apart to see inside.
- **Under-desk drawer** — one or two drawers that screw under a desktop with a push-to-open,
  push-to-close latch: a heart cam cut into the underside of the tray and a printed leaf spring in
  a shallow bay beneath it that rides the cam. The whole mechanism lives *under* the tray, so the
  tray runs the full depth of the box. Parts that slide on each other with one clearance control
  between them, plus a printed ejector spring. A bent paperclip is still an option for anyone who
  wants a shallower bay.
- **Push-lock drawer** — a re-creation of a published modular under-desk drawer: an island cam
  under the drawer, a sprung arm in the case floor, dovetail rails and a rubber-band throw. Stack them
  with printed screws, M3 bolts or dovetail keys, and put a relief pattern on the front you push.
- **Desk organizer** — a modular set of modules on a sliding dovetail: side by side on a desk plate,
  or stacked as shelves on a wall panel. The phone stand lifts off, and comes two ways: a low
  leaning slab that takes a MagSafe puck, with two tabs to stand the phone on and the middle left
  open so a cable plugs straight into the port. Each module has its own tab of settings and its
  own margin. Pen cup, open tray,
  shallow pen tray and card rack in any order, with the spacing between them yours to set. The
  plate can grow a ledge in front for a **pen groove** or a **shallow front tray**, and a **back
  wall** behind it carrying key hooks, a watch bar and a shelf for pocket change.
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
src/generators/ nametag/, keychain/, petbowl/, keyclicker/, building/, drawer/, pushdrawer/, organizer/,
                imagetrace/, pattern/
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
that one part on its own. Nothing in it knows what a lamp or a drawing is.

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
(callers clamp — see `standSoftR`); and the slices must **lap**, because butted exactly they meet
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

**A hand-built cutter interpolates between the rings you give it.** The pet bowl's wavy
split is a mesh whose top is two rings of vertices plus a fan to the centre. Built with only the
outer ring and that fan, the surface is LINEAR in radius, so the cut lands at the bowl's wall
partway between the wave and the centre vertex — a 6 mm wave arriving as 4 mm, sitting lower than
asked, and no error anywhere. Two rings at the same height make it exact at the wall whatever
radius the cutter is given.

**A warp can turn a solid inside out.** `Manifold.warp` applies whatever map you
give it without checking its handedness, so a map with a negative Jacobian determinant
silently inverts every solid it touches. The pet bowl wraps decals onto its wall through the
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

### Pet bowl: read this before printing

A cat or dog food bowl: a shell of revolution, a wavy two-colour split, a name
plaque, and a TPU foot ring. **Every colour is its own part**, which is the whole
point of the design — on a multi-material machine they are bodies of one object,
and on a single extruder you print the upper and lower shells separately and glue
them. The seam is on the outside skirt only, never through the dish, so a glued
bowl still holds water.

**The flare is the shape, and it goes the way you would not guess.** A pet bowl is widest
at its BASE and narrows up to the rim — that is what keeps it from tipping, and it means the outer
wall is an underhang the whole way when printed base-down, so none of it needs support. *Base
flare* sets it; the default leans about 14 degrees out. The INSIDE runs on its own angle in the
opposite direction, narrowing as it goes down, because a dish tied to the outer wall would widen
toward its floor: an undercut you can neither print rim-up nor get a cloth into. The rim is
rounded on both edges with a narrow flat between, and the dish floor meets the wall on a radius
rather than a corner that packs food.

**How the two-tone body is built.** The split is the surface
`z = waveZ + amp·cos(lobes·θ)` — a crest at the front, where the decoration
goes. Intersecting the shell with a solid below that surface gives the lower
colour; subtracting it gives the upper. The cutting solid is built vertex by
vertex, because the surface is neither prismatic nor axisymmetric and the kernel
has no primitive for it; `levelSet` costs a second and a third of a million
triangles for a shape described by one sine, and unioning angular wedges leaves
the wave visibly stepped unless there are hundreds of them.

**The split is held below the inside floor, always.** Push *Split height* past
that and it clamps and says so. Above it, the cut surfaces inside the dish and
the animal eats out of a two-tone bowl — and on a glued build, off a seam.

**Decals follow the cone.** The plaque, name, whiskers, bones, ears, leg arches,
carry slots and maker's mark are all authored flat in (arc length, height) — the
way you would lay a sticker out — then extruded radially and wrapped. A flat
plate tangent to a cone touches it along a single line, so wrapping is the only
way to get a panel that sits down on a tapered wall.

**Print rim-up, as laid out.** The wall leans outward the whole way, so slow the
outer perimeter down. *Base taper* is what sets that lean: the readout shows it
in degrees from vertical, warns past 40 and refuses past 50.

**The letters sit in the plaque, not on the wall.** Raised off the recess floor
but still below the surface around them — nothing stands proud of a curved wall
to be chipped off in a dishwasher, and a filament change at that layer gives the
name its own colour.

**The foot ring wants TPU.** It is a separate print in a separate material; in
anything rigid it is decoration, not grip. It is grouped with the bowl so it
previews where it belongs, under the base, rather than being packed beside it and
told a 256 mm bed is too small.

**Food safety is yours to judge.** Nothing here makes a printed bowl food-safe:
layer lines harbour bacteria, and most filament is neither certified nor
dishwasher-proof. Treat it as a holder for a stainless insert, or accept that it
is a consumable.

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

**Four building types**, plus a plain one for houses and sheds. Each is a real architectural
language, and what separates them is which facade *elements* exist — never how they are drawn:

| Type | What it has |
| --- | --- |
| **Apartment block** | recessed balconies with solid balustrades, stair tower over the roof, open ground floor under the front |
| **Office slab** | ribbon glazing with mullion piers, a floor band at every slab line |
| **Commercial ribbon** | ribbons wrapping a chamfered corner, projecting spandrels, whole ground floor on columns behind a glazed shopfront, framed blank billboard up one end |
| **Curtain wall** | full-height glazed stripes, projecting stone base course, entrance canopy on posts, louvred parapet |

Those are a **table of traits**, not four code paths — `styles.ts` is a dozen booleans per type and
`facade.ts` only knows how to build each element. Keeping it a table matters because the types
share nearly everything, and the moment they are four separate builders the shared parts drift.
The same table drives the sidebar: a type that gains balconies gains the balcony sliders in the
same edit, because `visibleIf` asks the traits rather than naming types by hand. **Windows**
defaults to *match the building type* and resolves to punched or ribbon from it — the type picks
the kind of opening, never how big it is. Sizes stay yours.

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

### Desk organizer: the plate is sized by the modules

Pick the modules and the plate follows. Each one is as wide as the thing it holds — the stand by
the phone, the cup by the cup — and the plate comes out exactly wide enough for them with a margin.
Size the plate first and divide it into equal bays and you get a pen cup with 20 mm of air beside
it, which is the difference between a designed object and a grid. Drop a module and the plate gets
narrower by exactly that module plus one reveal; `npm test` asserts it.

**A lip and a pair of tabs are not two versions of one shape.** A lip is one ledge across the
front: it holds anything you put on it, but it also runs straight across the phone's charging
port, so a plugged-in cable has to be threaded through a notch under it and bent back up into the
socket. TABS are two short ledges at the ends with the middle left open — the phone stands on the
ends of its own bottom edge and the plug goes straight in from the front. Being separate solids
rather than part of the extruded profile, they can also sit anywhere UP the face, which is the
second way to line a magnet ring up with the puck: move the phone to the charger instead of the
charger to the phone. Both halves of that opening matter and only one is obvious — the gap between
the tabs lets the plug reach the port sideways, and the tabs' HEIGHT is what lets it get under the
phone at all, so a 2 mm ledge is warned about even though its gap is wide open.

**The plate is the only thing deeper than a module.** Every module is exactly `depth` deep and
sits flush front and back, so there is no margin to put anything in — which is why the front and
back features GROW the plate rather than borrow from it. The modules, the dovetails and the cable
holes do not move either way; `npm test` asserts the back edge is exactly where it was before a
ledge was asked for.

**The front ledge answers one question two ways, and they are different objects.** A **pen groove**
is machined into the plate: it holds the pen you are using and that pen is not going anywhere. A
**front tray** is a MODULE — it dovetails onto the ledge the way everything else on this plate
dovetails onto it, lifts off to be tipped out, and prints as its own part in the module colour. It
is not a bay module and could not be: every bay runs the full depth and they are laid out left to
right, while this runs the full WIDTH in front of all of them, so it hangs on the same across-the-
ledge joint the back wall uses. Its depth never comes out shallower than that joint needs —
a 10 mm tray on a 17.7 mm dovetail is not a 10 mm tray, it is a tongue running out of its own
ledge into the feet of the modules behind.

**The back wall is a separate part, and that is forced rather than chosen.** The plate prints flat with its slots facing the sky; stand a wall up off it and
every hook is a cantilever printed into mid-air, and a 200 × 4 mm slab 150 mm tall with the
fittings' weight at the top is a part that falls over while it is being made. Laid on its own back
it is flat to the bed and every hook points upward. Two consequences worth knowing. The hooks
**tilt up**, which is doing two jobs at once: a ring on a level peg comes off the first time the
wall is knocked, and a level peg on a wall lying on its back is a post growing sideways out of the
bed. And the wall goes on **last** — the dovetails are open at the back so modules push in from
behind, and the wall stands in that path. The ledge is sized by the DOVETAIL rather than by the
slab standing on it: a 4 mm wall wants 12 mm of ledge, the joint under it is 17.7 mm across once
the undercut is counted, and sized for the slab the tongue ran forward through the feet of the
modules in front.

**Three things want the same run of wall, and they settle it in order.** The change shelf takes a
whole END -- whichever one it is put on -- rather than a slice out of the middle, because everything
else then has one unbroken run to live in instead of two stubs. The key hooks take their own end of
what is left. The watch bar takes the far end of the same run: two fittings, two ends, and neither
has to know how big the other is. Both ends are settings, and picking the same end for both is legal
-- the hooks simply group up against the shelf rather than through it.

**The hooks GROUP rather than spread**, which is a change. Smeared across the free run, four hooks on
a 200 mm wall were 60 mm apart: not how anybody hangs keys, and not a position you can ask for
either. At a key's own pitch they are one thing in one place, and that place is the setting. The
pitch closes up when the run is short, so they never walk off the end.

**The watch holder is an arm that turns UP at the free end.** A watch is not HUNG the way a keyring
is, it is DRAPED: the case lies on the arm and the strap falls down both sides. It went through two
wrong shapes before that was obvious. A round POST gives the case a tangent line to balance on. A
flat LEDGE gives it a proper seat and nothing at all to stop it walking off the end. The upturn is
the whole fitting -- the strap drops into the scoop behind it and stays there.

Two things about the arm itself are worth keeping. It meets the wall SQUARE along its whole
thickness, which is easy to lose: a rounded rectangle 10 mm tall comes out as a stadium, round at
BOTH ends, and its top rolls away from the wall a full radius short of it, so the flat you would lay
a case on is not there. And it stays LEVEL where the hooks tilt up -- a ring rolls off a level peg,
and nothing about that applies to a thing with a strap hanging down both sides of it.

**The hook costs reach, and it costs it for a printing reason.** The wall prints lying on its back,
so out of the front face IS up: the arm is a prism built from the wall outward. In that frame the
upturn is not "up" at all -- it is the section suddenly getting a lip taller at the top of a 30 mm
tower, which is a flat unsupported ledge the full width of the bar. So the inside of the hook is a
ramp rather than a square corner: the section grows one millimetre taller for every millimetre
further out, which is the steepest a printer can start in air. It reads as a cradle, which is what
it is.

The ramp is laid out slightly SHALLOWER than 45 degrees, and that is not slop. The scoop at the
bottom of it is a fillet, and a fillet in a concave corner ADDS material -- right where the ramp
leaves the arm, on the unsupported side of it. Give the ramp one fillet radius of extra run and what
the fillet puts back still lands under the 45. The test measures that directly, by intersecting the
bar with the half-space above the arm AND above the 45-degree line off it, and asking for nothing:
put the square corner back and 1015 mm3 appears there.

The **open tray** and the **pen tray** are the same shell and are not the same idea: you drop
things into a tray, and a pen *lies across* a pen tray. So the pen tray is sized by pen length
rather than by what it has to hold upright — 155 mm of clear span for a 140 mm biro — and kept low
enough to roll one up the wall and off the rim. Its lanes are ribs at a little over half the wall
height: tall enough that pens sit in rows, short enough that the tray still sweeps out in one go.
Below about 12 mm a lane it stops dividing rather than hand back a comb no pen fits in.

Every module is the same **depth** and sits flush front and back. That is the whole minimalist
look: one unbroken line along the front, one along the back, and the only vertical breaks are the
reveals between modules. One corner radius, one chamfer, one wall thickness, everywhere — what
makes a set of parts read as a set is that those three numbers are shared, not that the parts are
shaped alike.

**The dock is one definition used twice.** A sliding dovetail, with the clearance taken off the
male half once. Both directions print without support, which is not luck: the slot is open at the
top and narrows going up, so the solid either side leans inward at the dovetail angle; the foot is
widest at the bed and narrows going up. The undercut is only ever an undercut from the other part's
point of view.

The slot is **blind at the front** — stopped short of the front edge, so modules push in from
behind and the edge that faces the room stays an unbroken line. That has a consequence worth
stating, because it cost 334 mm³ of two parts occupying the same place: the foot has to stop where
the *slot* stops, not where the module does. A foot run the full depth of its module ploughs
straight into solid plate.

**One phone stand, and it used to be three.** A slot **cradle** the phone dropped into, a ribbed
**wedge**, and this leaning slab. They were genuinely different objects rather than three settings
of one, which is exactly why they cost three profiles, three charging routes and about half the
controls on the panel — and why they are gone. What is left is the slab: a lean to rest against, a
MagSafe pocket in the face, and the lead taken out through the back where nothing touches it.

**A lip and a pair of tabs are not two versions of one shape.** A lip is one ledge across the
front: it holds anything you put on it, and it runs straight across the phone's charging port, so
a plugged-in cable has to be threaded through a notch under it and bent back up into the socket.
**Tabs** are two short ledges at the ends with the middle left open — the phone stands on the ends
of its own bottom edge and the plug goes straight in from the front. They are separate solids
rather than part of the extruded profile, so they can also sit anywhere *up* the face, which is
the second way to line a magnet ring up with the puck: move the phone to the charger instead of
the charger to the phone. Both halves of that opening matter and only one is obvious — the gap
lets the plug reach the port sideways, and the tabs' **height** is what lets it get under the
phone at all, so a 2 mm ledge is warned about even though its gap is wide open.

**The puck's height is a question about where the phone's bottom edge is.** The ring's height is
measured from the bottom of the phone, so the two only line up through wherever the bottom of the
phone actually is — the plate on a lip, the tabs on tabs. The readout quotes the puck's centre
*above the bottom edge of the phone* for that reason, and the validator measures the pocket
against the same datum: a puck that clears the plate can still be under a raised phone. Only the
top of the range was ever checked, so the whole lower third of the slider quietly cut the pocket
through the floor the phone stands on.

**A lead is not a cable — it has a plug on the end.** Every closed aperture on every charging
route was sized from the cable channel, which is 9 × 5 mm. The thing you actually have to push
through those apertures is a USB-C moulding at 12 × 7, and it went through *none* of them: not the
hole up through the plate, not the bore behind the puck
pocket. Turning the plug 90° did not help either, because the plate's hole was 9.5 across and 10.5
deep and the plug is 12 one way and 7 the other. Every route was correct and every route was
impossible to thread, which is the kind of thing that only shows up if you try to push a
plug-shaped probe along it rather than reading the code.

They are sized from the plug now. **Open** channels are exempt on purpose and stay cable-sized —
a groove down the back of the slab, or along the underside of the plate, is one the cable is
*laid* into from the side, so only the cable's own girth has to fit.

The dovetail was the other half of it. The plate offers a hole and the module offers a channel,
and the foot runs straight down the line between them — so the channel was cut two millimetres
into a four millimetre foot and the plug fetched up on the last two. The foot now has a **gap** in
it at each drop, taken out full width rather than plug-width: dtW is 14 and a 12.5 mm channel
through it would leave the foot standing on two 0.75 mm slivers. It is ninety millimetres long and
loses seven of them, which it does not miss.

And the puck sat **2 mm below** its own face, because the pocket was cut `puckT + 2` deep — an
overshoot buried in the part instead of outside it. The phone rested on the plastic rim and the
magnets worked across a gap they did not need to cross. The cutter starts a millimetre proud of
the face now and goes in by the puck's thickness, so the puck sits flush.

**Charging, and the two places a cable gets crushed.** The rest takes a MagSafe-style puck in a
pocket sunk square into its leaning face. The hole up through the plate and the route down through
the stand are two halves of one run through two *different printed parts*, so where they meet is
derived once and shared — worked out separately they came out 80 mm apart, the stand dropping its
cable at the front and the plate offering a hole at the back.

The lead used to be grooved **down the leaning face**, which is the one surface the phone lies on:
a ridge under the screen, and a lead pinched flat every time the phone went on. It bores straight
out the **back** of the pocket now, runs down the rear of the rest where nothing ever touches it,
and drops through the plate behind it. The face carries the pocket and nothing else.

The plate then lies flat on the desk, on four stick-on feet, and the lead leaves through a groove
in its underside that runs back to the rear edge. There was a **plinth** under it for a while — a
separate ring that lifted the whole plate 12 mm so the lead could curve out through the cavity
instead of turning ninety degrees against the desktop the instant it got out. It went because it
read as a second plate under the first one, which is what it was. The groove is the cheaper answer
to the same problem: it is open downward, so the lead is laid into it rather than threaded, and it
lets the cable leave flat instead of being pinched against the edge.

**On the wall, the same modules dock on a different face.** The plate stands up as a back panel,
the bays run up it instead of across, and each module hangs by a dovetail on its *back* rather than
one under its floor. Nothing about a tray or a cup changed — a tray is still a floor and four walls.
Two things did have to give, and both are cases of geometry that only made sense lying down:

- **The phone stand has no back to hang by.** At half its height the only material is the rest,
  ninety millimetres forward of the panel, so the rail was modelled attached to nothing and the part
  came out as two bodies. The wall form grows an upstand at the rear for the joint to live in, and
  the joint height is picked per module kind rather than assumed to be the middle.
- **The card rack's slots cannot go right through.** On a desk they are open at both ends so a card
  can be pushed out from underneath. On a wall, cutting through would slice the dovetail rail off
  the back into as many pieces as there are slots — so they stop short, and you reach in from the
  front, because on a wall there is no underneath to reach from anyway.

The stand prints **lying on its back**. Upright, the leaning face is a 75-degree overhang and the
lip bridges the phone's well; on its back every face is flat and the puck pocket opens to the sky.

### More than one plate is not a failure

The plate packer used to answer one question — *does this fit a 256 mm bed?* — and drop whatever did
not. That is the right answer for a nametag and the wrong one for a drawer: the push-lock drawer's
case is 134 mm deep and its box 129, so two of them cannot share a 246 mm shelf whatever the packer
does. The preview came up missing its drawer, the export wrote a drawer-shaped hole, and the only
clue was an error message about a bed.

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

The default push-lock drawer is 2 plates; a four-high stack is 8, all 44 parts placed, none dropped.

### Push-lock drawer: a working design, re-created part by part

`src/generators/pushdrawer/` is a re-creation of a published under-desk drawer, reverse-engineered
from its meshes rather than redrawn from theory: every part was sliced at height steps, every
feature measured with vertical ray probes, and the cam islands traced as polygons. The defaults are
that drawer's numbers — 176 × 134 × 32.4 mm, a Ø4 pin, 7 mm rails, a 35 mm band. The *latch* is not
its latch, for a reason worth reading below.

**The cam was traced, and the trace was wrong — a simulation is what caught it.** The original's cam
is two free-standing islands: a long thin *arrow* with a hooked head and a notch in its face, and a
trapezoid *block* beyond it. Tracing their outlines and extruding them under a flat ceiling looked
right, measured right, and passed every geometry test in this repo — the parts did not overlap, the
pin was in the notch when shut, the whole thing was one printable body.

It did not work. A kinematic simulation — the pin as a disc, the islands as polygons, the arm as a
lateral spring, jamming when a wall is steeper than `1/μ` — walked the pin through push, release,
push, release and found that **both strokes take the same path**. The pin rides over the arrow,
lands on the block, and then falls through a 1.5 mm window between the block's edge and the hook
face and escapes underneath. It never latches, at any friction from 0 to 0.4.

The reason is that a plan outline *cannot* be one-way. Quasi-statically, a pin on a fixed 2D
obstacle field under a monotone spring is reversible: pull out and it retraces the path it pushed
in on. Something has to break that symmetry, and mapping the original's chamber ceiling at 0.05 mm
steps showed what does — the ceiling is **ramped 0.4 to 0.9 mm shallower** exactly across the gap
the pin was falling through, so the follower has to lift over it. A ratchet, in the ceiling rather
than the floor because the cam is on a drawer's underside. Slicing the *islands* and finding them
constant in height, which is what the first pass did, says nothing at all about that.

So this generator fits the grooved heart cam from `core/mech/heartCam` — the same one the under-desk
drawer uses, shared rather than copied, because two cams are two mechanisms the day one of them is
corrected. A closed loop with a floor that ramps up along every segment and drops back at every
corner: the pin can always climb a ramp and can never climb the step behind it. `npm test` probes
the printed mesh for exactly that, per segment, reading only the stretch of each segment that no
other segment overlaps — at this cam's proportions the apexes close to 26° and a neighbour's sweep
reaches ten millimetres back, so a fixed skirt reads the wrong floor and passes a cam that is wrong.

**The drawer hangs on two one-sided dovetails.** Each rail's head overhangs outward at 45 degrees
and each slot's outer wall slants to match, so the drawer hangs on two lines of contact like a
V-block and centres itself; the crests never touch. The slot's slanted wall is the same plane as the
flank, and the flank starts just under the drawer's underside — the first cut of this had it start
higher, and the slot wall ran 0.6 mm down into the rail's base, which measured as 43 mm³ of two
parts in one place. The original has the same sliver.

**The band pulls the drawer OUT, and the pocket is why it can.** One rubber band a side, from an
oval post standing up off the case floor to an island in a moat under the drawer. Shut, the posts sit
39 mm *ahead* of the moats and the band is stretched; released, it hauls the drawer forward ~21 mm
and goes slack. The posts stand 7 mm tall — well up into the drawer's 4.25 mm pocket — which is
only possible because the pocket is open at the drawer's back edge: as the drawer comes out, the
posts (and the pin) leave through it. Working that out took a while: read the other way round, the
posts trap the drawer at 12 mm of travel.

**Two things the original does with supports, done without them here.** Its arm floats 0.4 mm above
the floor over a through-window and is printed on tree supports; here the arm lies flat in the
window, on the bed. The stop-bar screws also gain a counterbore so their heads sit flush under the
floor instead of standing into the drawer below.

**The band sets the cam, not the other way round.** The notch has to sit exactly as far from the
cam's rest point as the bands actually throw the drawer, so `pop` is derived from the band length
and the post spacing and then handed to the cam. Pick it independently and the pin comes to rest
somewhere the groove does not expect it.

**Printed threads are real helices.** `thread()` in `parts/util.ts` extrudes an eccentric disc with
a twist — a single-start thread of the disc's offset in depth — and phases the helix to *absolute z*,
so a screw and the hole it goes into are in phase however long each is and wherever each starts.
The first cut phased each from its own base and the stop screws collided with their ears by 2.7 mm³.
The stack screws are modelled in the upper case's frame and phase-shifted by one case height so they
agree with the tapped lug of the case below.

**Two additions.** A relief on the face you push — ribs, chevron, hex, diamond, dots, voronoi or
knurl from `core/pattern`, engraved into the front wall or embossed onto it, capped so the wall
stays closed. And a stack connector: every case carries a lug at the top and bottom of each corner,
and the joint between two cases is printed screws down through them (the original's way), M3 bolts
with a trapped nut, or a double-dovetail key slid in from the front. The top case is the only one
screwed to the desk; the rest hang off it.

### Under-desk drawer: the latch, and two things that cannot work

**The push-push latch is a heart cam.** A closed loop of groove cut up into the underside of the
tray, and a sprung pin standing up off a plate in the bay beneath it. The tray moves along one axis
only, so every sideways move the pin makes is the groove walls camming it across and the beam
springing back. The pin walks `rest → hard push → notch (shut) → push again → home (open)`.

What makes it one-way is **in the floor, not the plan**. Each segment's floor ramps *up* along the
direction of travel, and at every corner it drops back to full depth. The pin can always climb a
ramp; it can never climb the step behind it. `npm test` probes the built mesh and asserts both
halves of that: the floor is shallower late in a segment than early in it, and it has reset to near
full depth again just after each corner. Take the steps away and you have a groove the pin wanders
back down the way it came, which is a drawer that does nothing.

The notch holds for a reason worth seeing. The ejector pulls the pin toward the open end, and
**both of the notch's neighbours sit further in** — so on the side it is being pulled, there is no
groove at all. The pin is not gripped, it is cornered.

Two things that look right and are not, both found by measuring rather than by reading:

**A bump in the slide groove cannot stop the tray.** The obvious travel stop is a lump partway down
the groove for the tongue's back end to hit. But the tongue runs the whole length of the tray, so
wherever the bump goes the tongue is already sitting on it — at every position from shut to fully
open. It is not a stop, it is a permanent interference, and it measured as one. The peg went to the
front of the groove instead and the tongue got a relief channel milled along it, with a wall at the
end. The two now meet at exactly one place.

**A push-to-open front cannot be flush.** The face plate laps over the opening by more than it laps
the carcass edge, so flush leaves the overtravel nowhere to go: the whole mechanism is hard against
the front of the box before the pin ever reaches the notch. It stands proud by the overtravel plus
a clearance — which is also why a push-to-open drawer front in the shops never sits quite flush.

Both were caught by a test that intersects the two solids at shut, half open, at the stop and
pressed fully in. Two printed parts that foul each other anywhere in between is a thing you would
otherwise find out about after nine hours of printing.

**The follower IS printed, and the reason a single arm can be both springs is that it lies flat.**
It has to be soft sideways, so the cam can throw it from one apex to the other, and stiff downward,
so it stays in the groove while it climbs the steps. Cut a beam out of a flat plate and it is both:
the cross-section is 1.4 mm across by 3 mm tall, and bending stiffness goes as the square of the
dimension you are bending, so sideways is about five times the softer axis. Lying flat also settles
the print — the beam bends *in the layer plane*, every fibre loaded along its own length instead of
peeled off the layer below. Stand the same beam on edge and it is a stack of discs asked to bend.

Three things about that beam are not free choices:

- **Its length is solved for, not chosen.** A cantilever under an end load strains its outside
  fibre by `3·t·δ / 2L²`. Fix the strain at 1.8% — about half where PETG yields, which is the
  difference between "it flexes" and "it still flexes after a thousand presses" — and out falls the
  shortest beam that survives being thrown to a cam apex. The follower's *reach* — how far forward
  of the back wall the pin sits — is then that beam plus the paddle and the root stub, which are
  dead length because neither of them bends. A wire reaches 27 mm, the printed beam 36. Under the
  tray that difference costs nothing at all; behind the tray it used to come straight off the depth
  of the drawer, which is why the latch moved.
- **The relief opens out along it,** because the deflection does. At the root it is a slit; at the
  tip it is the full throw and more. That is the diagonal cut, and the round hole it ends in is not
  decoration — it is the only thing between a sharp inside corner and a crack.
- **The pin is modelled *past* the deepest floor of the groove.** The groove is overhead now, so
  the pin points up and the beam is bowed down and pressing up the whole time. A pin that merely
  touches drops out the first time a ramp asks it to climb, and `npm test` asserts both halves:
  that the pin is the only place the deck and tray touch, and that it touches by interference
  rather than by luck.

**A fat pin needs a wide cam, and that is derived too.** Every corner of the groove is rounded off
by half a groove width from either side, so a segment only two groove widths long is all corner with
no ramp left in the middle to carry the one-way step. A 1.1 mm paperclip never noticed. A 2 mm
printed pin in a 10 mm cam turned both short segments into one shallow dish and the latch skipped —
so `camV` has a floor under it that keeps the apex-to-notch run longer than the pin is fat, and the
groove cutter is clamped so no corner digs deeper than the floor it is supposed to reset to.

### Under-desk drawer: why the latch is underneath

**The latch used to sit in a bay behind the tray, and it cost 37 mm of a 170 mm box.** That number
is not a choice — the follower beam is as long as its strain budget says it must be, and behind the
tray that length comes straight off the back of the drawer. A 170 mm carcass gave 130 mm of tray.
Moved into a bay *under* the tray the same beam reaches along the floor instead, and the tray is
168 mm: the full interior, bar the press stroke. What the latch costs now is about 5 mm of height
off the bottom of each opening.

**Which part carries the cam is forced, not chosen.** The follower has to be anchored to the
carcass, and under a full-depth tray the only carcass surfaces left down there are the two side
walls — so the deck spans them on rails, and the tray must be *above* it. That puts the cam groove
on the tray's underside and the pin pointing up, and there is no other arrangement: hang the cam
below the deck instead and its web has to pass through the deck to reach the tray.

**Everything the tray gives the latch is a recess, and that is the whole printing story.** The tray
prints floor-down, so its underside is the bed. A pusher lug hanging under the floor would be the
lowest thing on the part, and the tray would print standing on the lug with its floor in mid-air.
So:

- The **cam groove** is cut *up* into the floor. It is 3 mm wide, which the slicer bridges in one
  pass, and the floor is locally thickened over the cam's footprint — a 2.2 mm groove does not fit
  in a 2 mm floor, and without that pad the heart cam is a hole in the bottom of the drawer.
- The **ejector** shoves on the blind end of a tunnel bored forward from the tray's back face,
  because the blind end of a hole is a backward-facing surface that costs nothing to print. The
  tunnel's own floor is kept thicker than the cam is deep, so the follower's pin runs in its relief
  directly underneath and the two pass.
- Behind the funnel the groove carries on as **plain relief** to the tray's back edge. Without it
  the pin rides the flat of the underside for the rest of the travel — the beam bowed the full depth
  of the cam, all the way open, every time.

`npm test` asserts the two halves that matter: that the latch costs no depth at all — a latched tray
and a plain one are the same length in the same box — and that nothing behind the face plate reaches
below the tray's own underside.

**What it does cost is a plinth.** The ejector tunnel needs its floor, its bore and a skin over it,
so the tray's floor stands about 15 mm proud over the back 15 mm of it. In a 45 mm drawer that is a
step in one corner; in a 25 mm one it is most of the height, and the generator says so. The face
plate grew downward to match: it now laps the *opening* at the bottom rather than the tray, because
an uncovered bay is a slot straight into the mechanism.

### Under-desk drawer: two of them

**There is no shelf between the drawers, and there cannot be one.** Each tray hangs from tongues in
its own pair of side-wall grooves, and the tray above is the only ceiling the one below needs. A
real shelf would be a 110 mm horizontal bridge in mid-air the moment you turn the carcass over to
print it — and turning it over is not optional, because the top plate is the one face that has to
come off the bed flat.

So a second drawer is the same tray at a second height, and every z in `geometry.ts` is *tier-local*
— measured from the floor of one opening — with `tiers` saying where those floors are. One tray is
modelled and dropped into each tier. Working the second one out separately is how the two stop
agreeing.

**Two drawer fronts cannot both lap their openings.** The gap between one tray and the next is the
running clearance and nothing else, so a face that laps its own tray laps the face below it too:
that measured as 516 mm³ of two parts occupying the same place, and would have felt like two drawers
grinding on each other every time either one moved. In a stack the faces are pulled in *short* of
their trays instead, leaving an even reveal. A lone drawer still gets the lapping front, because
there is nothing above or below it to run into.

**The face plate sinks 0.6 mm into the tray's front wall.** Butted face to face the union has no
volume to work with, and Manifold hands back two bodies that merely touch — a drawer front that
slices off in the slicer. The whole tray then sits that much further forward, or pressing the drawer
in drives the face into the carcass it is supposed to stand clear of.

### Desk organizer: two shapes of phone stand, and a finish

**The ring is the plain one.** A rounded panel standing on a foot, with a round window straight
through it. The phone leans on the panel and stands on a small lip.

**The charger is seated from the FRONT, and that is not a detail.** The recess is sunk into the
front face to the puck's own thickness, and what is left behind it is a shoulder; the window
through the back is bored at the SHOULDER's diameter, not the puck's. Seated the other way round —
dropped in from behind against a thin front lip, which is what this did at first — the puck is held
by friction alone and falls out of the back the first time the stand is picked up. Seated from the
front it has nowhere to go: the shoulder is behind it and the phone is in front of it. The back
window is still worth having, for the material it saves, for pushing the puck back out with a
thumb, and because it is what makes the panel read as a ring rather than a dish.

**The shoulder is a setting, not the structural minimum.** Two plate thicknesses of it — 1.2 mm —
holds the charger perfectly well and looks like a mistake, because from the front the shoulder IS
the ring: it is the only plate between the window and the seat's edge, and at 1.2 mm on a 56 mm
charger it read as a hairline. It starts at 4 mm instead. Floored at what holds, and capped by what
the window is FOR — pushing the puck back out with a thumb — because past a point the shoulder
stops being a rim round a window and becomes a dish with a hole in it.

**The lead leaves across the shoulder, and shows nothing on the front.** It used to run from the
seat DOWN the panel, which put a little tab below the circle that was the first thing you saw, and
run far enough it came out of the panel's foot — an open-ended hole in the one place the panel
carries the whole thing's load. It never needed to go that way. The lead comes off the charger's
rim and has to reach the back of the panel, and the back of the panel is a shoulder's width away.
So it is a radial notch ACROSS the shoulder, from inside the window out to the seat's wall and no
further: the lead lies in it under the puck's own rim, drops into the window and hangs down the
back, and the whole route is inside the circle you were going to see anyway.

It starts inside the window rather than at its edge, and that is the part worth keeping. The seat
is a recess and the window is a hole; a notch that only reached the seat would be a second hole
through the panel with the lead's way out inside it. A wider shoulder is exactly what turns one
into the other — it moves the window in from under the notch while the seat stays where it is —
which is why all three now come out of one `puckRing`, and why the test measures genus rather than
trusting the arithmetic.

**And then the lead is caught, once, on the way down.** Out of the slot it hangs down the back,
which is a route on paper and a loose cable in practice. The clip is two arms with a return lip on
each and a mouth between them narrower than the lead: press the cable in from behind and the lips
let it past and close after it. Nothing is threaded, and that is the whole reason to build a clip
rather than a hole — the far end of that lead has a plug on it, so every *closed* aperture in this
generator is sized for a 12 × 7 moulding rather than a 9 × 5 cable, which makes all of them far
bigger than a cable ever needed.

Two things about it are not obvious:

- **It stands upright, not square to the panel.** Everything else on this stand is built in the
  panel's own leaning frame; the clip is the one thing that must not be, because a cable hanging off
  the back hangs *straight down* and a channel square to a leaning face does not. Upright, its
  section is constant in Z, so the whole clip prints without a single overhanging face — bar its
  underside.
- **That underside sets the whole bracket's size.** It hangs in mid-air five millimetres up a wall,
  so it is cut back to a 45-degree ramp rising out of that wall. But the panel runs away rearward as
  it rises, so every millimetre of height buys a millimetre of ramp and hands `tan(lean)` of it
  straight back: `h × (1 − tan) = out + grip`. That is fine at fifteen degrees and runs away at
  forty-five, where the face and the ramp are parallel and no finite bracket is ever supported. So
  the reach is capped, and past about thirty-two degrees of lean `clipSpec` returns null and the
  validator says why. It is a real limit of leaning a panel back that far, not an arbitrary one.

**The plate lost two holes to all this.** It used to offer a square hole up through itself wherever
there was a stand — one behind it for the puck's lead and one in front for a plug-in cable — plus a
groove in its underside to reach them. That is exactly right for the *rest*, which bores out of the
back of its pocket and drops the lead through the plate, and the rest still gets all of it. A ring
routes nothing through the plate and has no lip for a passthrough notch, so on a ring those were two
holes in the middle of an otherwise clean plate leading nowhere. Holes are the one feature that has
to be earned.

**A last thing that falls out of the arc, and it is not a warning — it is a floor.** The charger's
centre sits 80 mm up by default, which is where the magnet ring of an ordinary phone standing on the
lip actually is. A 56 mm puck centred there reaches 108 mm, and the panel's top is an *arc*: the
width beside the window runs out before the height does, so on a 110 mm stand the charger is
comfortably inside the rectangle and straight out through the shoulder. What comes off the bed then
is not a ring with a hole in it, it is a fork with two horns.

So the height is not free, and `ringMinH` answers two questions rather than one — conflating them
is how this went wrong twice.

**What the panel NEEDS** is that no point of the window comes within a structural shoulder of the
arc, measured radially from the arc's own centre. The window is a circle bored along the panel's
normal, so in the front elevation — which is where the arc lives — it is an ellipse: full width
across, squashed by the cosine of the lean going up. Each point of that ellipse gives a lower bound
on the height, because raising the panel lifts the arc's centre away from a window that stays where
the phone's magnets are, and the largest of those bounds is the answer.

**What it LOOKS like** is a different question, and a bare structural shoulder answers it badly. Two
and a half millimetres of plate over the top of the window, with a fat even margin down both sides
of it, reads as a circle that only just got away with it. So the shoulder is asked to MATCH that side
margin — `R - a`, the plain plate beside the window at its widest, a number the panel already has.
The window then sits in the same amount of panel whichever way you look at it, which is most of what
makes it look deliberate. It is capped at 18 mm, so a phone twice as wide as its charger asks for a
tall panel rather than an absurd one.

That second bound is on the APEX and nowhere else. Applied round the whole ellipse it is not a margin
at all: the sides of the window are down in the straight part of the panel, where the plate beside
them is `R - a` *by definition*, and asking for `R - a` of ARC clearance there as well asks the panel
to be tall enough that its arc has left them behind. Written that way the two constraints cancel into
nonsense — at stock settings the inner radius came out exactly equal to the window's own, the guard
for "too narrow at any height" fired, and the floor silently became no floor at all.

`derive` then clamps `standH` up to that floor before the bays are laid out — before, because on a
wall they stack, and a panel that grew afterwards would overlap the module above it. Ask for a
shorter stand and you get the one the charger needs, plus a line saying so and pointing at the other
way out: lower the charger. The stock 130 mm clears the floor of 127 without being touched, and the
two short presets lower their charger along with their panel rather than only one of the two.

**And a check at the other end of the same polygon.** Height and lean together also decide whether
the top of the panel is still standing over its own plate: at 40 degrees a 200 mm panel reaches
185 mm back on a 105 mm plate. The side elevation is one polygon and it does not fold — it comes out
inside out, and the part is neither a ring nor a rest. There was a check on the well at the bottom
of that polygon and none at the top; now there is one, as an error, because nothing about the result
is salvageable.

It is the same side elevation the older *rest* draws, with a full lip: what makes it a ring is the
silhouette it is trimmed to and the hole through it, not a second way of standing a slab on a plate.
Two details are worth keeping:

- **The window is bored along the panel's own normal**, not horizontally. A puck is a flat disc and
  has to seat flat; a horizontal bore through a panel leaning fifteen degrees gives it an ellipse.
- **The rounded top is a silhouette, not a profile.** The side elevation is extruded across the
  width, so on its own the panel has four square corners. The arc is a front-elevation mask swept
  through the part along the depth — and because everything below the arc keeps the full width, the
  plate and the lip pass through it untouched.

A panel whose top is an arc is narrower the higher you go, so a charger that clears the sides at its
own centre can still break out through the shoulder. That is a hole in the silhouette rather than a
window in it, and the validator measures the panel's width at the top of the puck to catch it.

**Fluting is one setting for the set.** Fine vertical grooves round the outside of every box —
the cup, the trays, the card rack and the front tray. One control rather than one per module,
because what makes these read as a set is that the radius, the chamfer and now the fluting are the
same number on all of them.

It is worked in 2D and extruded: a row of circles centred just OUTSIDE the outline, each standing
off by its own radius less the depth so it bites exactly that far in. The section is the same at
every height, so one boolean does the whole wall. The walk round the outline is the four straights
and four quarter-arcs it actually is, stepped by the perimeter divided by a WHOLE number of flutes,
so they close on themselves instead of leaving one odd wide gap where the walk started. Depth is
capped at a third of the wall, and the flutes stop above the bottom chamfer — run down through it
they would turn the one face that has to meet the plate cleanly into a row of scallops.

### Desk organizer: on a desk, nothing clips on any more

The plate used to be a dock. Every module — the cup, the trays, the card rack, the stand — printed
as its own part with a dovetail foot, and the plate had a matching slot cut for each of them. That
is the right joint on a WALL, where a module has to be held against gravity by something, and it is
still exactly what the wall panel does.

On a desk it was never earning its keep. Gravity already holds a cup on a plate; the dovetail was
buying nothing and costing a slot in the plate, a foot on the module, a clearance to get wrong, and
four extra parts to print, orient and fit. So on a desk the bay modules are now UNIONED into the
plate at the end of the build, and the plate has no slots in it at all. One part comes off the bed
with its trays already on it.

**The stand is the exception, and stays removable.** It is the tall part — by itself two thirds of
the build height of everything else put together — so leaving it joined would make the plate a tall
awkward print for the sake of a phone. It lifts out instead.

**Lifting it out leaves a shallow tray, not a socket.** This is the part worth getting right. A
dovetail slot with nothing in it is a piece of obvious unfinished joinery sitting in the middle of
your desk. What is cut for the stand instead is a plain rounded rectangle sunk into the plate, the
full footprint of the bay, about two millimetres deep with a floor left under it:

- `seatTray` cuts it from the plate, at the bay's body width and depth so it lines up with
  everything else on the plate,
- `seatPad` is the same rectangle inset by the clearance and added to the stand's foot, so the
  stand drops in and is located by the recess without being gripped by it,
- `seatDepth` is capped at the plate thickness less two minimum plates, so there is always a
  floor: it is a tray, never a hole.

Take the stand off and what is left reads as somewhere to put your keys — which is a reasonable
thing for that corner of the plate to be.

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

### Table lamp: the bulb has to fit, and the shade has to get past the ring

The hardware is the starting point, not an afterthought: a threaded E27 holder on a cord with an
inline switch and a moulded plug. It mounts *through* a plate — the threaded skirt passes up
through a hole, the holder's own flange stops it underneath, and the shade ring screws down from
above and clamps the plate between the two. So the hole in the base's deck is sized to the
**thread**, and the ring has to be comfortably wider than that hole or there is nothing for it to
bear on. Every socket number is editable, because these vary a millimetre or two between suppliers
and the only reliable source is a caliper.

**The shade is lofted, not booleaned.** Its surface is `r(theta, z)` — a single-valued polar height
field — and writing that out as a mesh directly is the only construction that guarantees what the
sidebar promises: every cross-section is a simple closed curve, so there is no flute depth, lobe
count or twist that can make the shade pass through itself. Sweeping sixty ribs round a cone and
unioning them gives the same silhouette, no such guarantee, and sixty booleans a rebuild. The
inside is the same field offset by the wall, which makes the whole thing one watertight tube:
two rings of vertices per level, quads between the levels, an annulus closing each end.

**Flutes only ever cut inward.** The hem diameter you type is the diameter a caliper reads across
the finished shade. Rippling symmetrically about the silhouette instead would make every diameter
control a polite suggestion that the flute depth then argues with — and it is not a cosmetic
difference, because the hem is the thing that has to pass over a 55 mm shade ring.

**The wall is measured through the wall.** Offsetting straight inward by 1.2 mm is the obvious
thing and it is wrong wherever the surface is not vertical: on a flank leaning 45 degrees it is
0.85 mm of material measured *through* the wall, which is the difference between three perimeters
and two. On a lamp shade the perimeter count is the design — it is what the light has to come
through — so the offset is divided by the surface's own foreshortening, taken from the local slopes
in both directions and clamped, because at a creased valley the true offset surface has a cusp and
wants infinite thickness.

**Printability is one number: how far the wall moves sideways per layer.** The 45-degree overhang
rule is about *solid* overhangs, where a layer has to span outward over air. A shade is a
continuous thin wall, and every layer lands on the one below it as long as it has not stepped
further sideways than the wall is thick. Judged by angle both of this generator's shapes look
alarming — a 64-rib shade with 160 degrees of twist reports flanks leaning 71 degrees, and the
default mushroom's bulge leans 44 — and both print perfectly, because the flare and the twist
together come to 0.35 mm of step inside a 1.2 mm wall. Checking the angle instead would have put
the reference shape out of reach, which is the whole point: the criterion has to be the one the
printer actually uses.

**The fitter is a spider, not a disc.** A flange that reached the wall all the way round would be a
50 mm-wide annulus of solid plastic across the bottom of a 120 mm shade — twenty grams of it, and
it blanks off most of the light the shade is open at the bottom to let out. Four spokes off a hub
carry it just as well, which is why a fabric lampshade has used a wire spider for a century. The
star comes out of the same triangulation the annulus did: one outer radius per angle, out to the
wall inside a spoke and only as far as the hub between them, so the step between the two becomes
the spoke's own side wall. Each gap between two spokes is another way through the solid, so the
shade comes back at genus five rather than one — which is what the test asserts, because a shade
that came back at genus one would be one whose bottom had been blanked off.

**Hanging an empire shade from its top rim makes a pendant, upside down.** The mushroom is easy:
its hem is the widest thing about it, so it sits on a collar on the base. The pleated one narrows
to a small top, and the obvious reading — put the top rim on the shade ring — puts the entire shade
*below* the ring while the bulb goes up *above* it. The fitter is a flange partway up the inside
instead: low enough to reach the ring, high enough that the rest of the shade goes on up round the
bulb. Its aperture only has to clear the thread, not the envelope, because the shade goes on first
and the bulb screws in from above afterwards — by the time the glass starts widening it is already
well clear of the flange.

**The joint between the two parts is derived, not typed.** In the base mount the collar takes the
shade's own hem radius, so the two outer surfaces run flush, and the spigot is sized off the
shade's *inner* surface so the hem drops over it whatever the flutes are doing. The base's neck
diameter disappears from the sidebar in that mount, because a number that is being ignored is worse
than no number. The flange's outer edge follows the fluted surface rather than a circle, three
quarters of the way out through the wall: a circle would fall short of the crests, and a flange that
misses the wall at forty angles is a loose disc inside a tube that still unions into a perfectly
valid solid.

**The bulb is a convex hull, shoulder included.** Cap cylinder, envelope sphere, and the tangent
between them. Reading only the cap and the sphere tells a narrow shade it clears a bulb it would
actually be resting against, because the widest part of the glass is not the only part that can
touch. The clearance is walked over the shade's whole height taking the *narrowest* inner radius at
each one — a flute valley is where a shade touches a bulb, and averaging round the shade hides
exactly the contact that matters.

**Clearing the shade ring is a run, not a cross-section.** The ring travels up through the shade's
inside during assembly, from the hem to wherever it ends up, and the shade has to clear it the whole
way. Checking only the hem passes a shade that is widest at its hem and closes in above it, which
then jams halfway on with the two surfaces bearing somewhere nobody can see. It is reported as its
own number rather than folded into the bulb clearance, because the two are different questions:
a few millimetres past the ring is plenty, and a few millimetres from a bulb is not.

**The deck is grown inward at 45 degrees rather than bridged** — it is a plate with a hole in it
printed over thin air, and at 45 degrees every layer lands on the one below. The chamfer has to end
*on* the inner wall at the radius that wall has where the chamfer reaches it; taking the radius at
the deck instead is wrong by the taper over the chamfer's own height, and the inner wall then
doubles back to meet itself. That profile crosses its own edge and revolves into a solid with a
wedge of extra material buried in the neck — manifold, positive volume, right silhouette, and a
base that weighs half as much again. A test slices the cone and weighs the ring.

**The presets are proportioned off the reference photos, and one of them cannot be exact.** The
mushroom reads 0.55 / 1.00 / 0.72 across hem, belly and base, with the joint the narrowest thing
about the whole object — that waist is what makes it a mushroom rather than a vase on a plinth.
The pleated one is 120 mm across and 150 mm tall, which is what its reference is labelled. Its base
comes out chunkier than the photo's for a reason that is not stylistic: an E27 shade ring is 55 mm
across, so the neck it lands on cannot be under about 60 mm however slender the picture looks. The
photo's lamp is either using a smaller holder or is not built this way at all. Switching the holder
to E14 in the sidebar gets the slender base back.

**Use an LED bulb.** PLA starts to soften around 60 degrees and a filament or halogen bulb of the
same brightness will reach that inside a shade this size. It is the one thing about this lamp that
is not a matter of taste, so it is a standing warning rather than a line in a manual.

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
