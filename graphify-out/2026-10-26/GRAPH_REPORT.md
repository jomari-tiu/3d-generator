# Graph Report - 3d-generator  (2026-10-26)

## Corpus Check
- 141 files · ~237,099 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: .ttf 7, .woff 5, (none) 1)

## Summary
- 1526 nodes · 4902 edges · 70 communities (60 shown, 10 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 129 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `368a0675`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- keyclicker/build.ts
- mscage/parts.ts
- hangar/schema.ts
- Hangar Dimensions
- Pattern Geometry
- Shelf Generator
- drawer/build.ts
- armPose
- Building Plan And Rooftop
- hangar/build.ts
- ui/panel.ts
- Building Build And Cladding
- Generator
- storey.ts
- Hangar Bridge And Tower
- Building Facade
- Hangar Boom And House
- nametag/build.ts
- Permalink And Presets
- keychain/schema.ts
- Building Roof
- 3D Viewer
- roundedRect
- Building Geometry Constants
- TypeScript Config
- logokeychain/build.ts
- Shared Param Helpers
- Hangar Ceiling
- Font Licences
- FontRegistry
- Building Schema
- textSolid.ts
- craneFrame
- package.json
- OpenType Typings
- keychain/build.ts
- roundedRect
- params/types.ts
- coerceAll
- Pattern Schema
- README Generators Overview
- app.ts
- primitives.ts
- Kernel Design Constraints
- .onOutcome
- imagetrace/schema.ts
- Shelf Schema
- 3MF Export Typings
- App Architecture Concepts
- 2D Pipeline Concepts
- Lettering Design Rules
- logokeychain.test.ts
- backWallBody
- bridges.ts
- flatten.ts
- Bitmap
- Export Formats
- Graphify Rules
- 3MF Content Types
- pegboard/build.ts
- trace.test.ts
- box
- dimensions.ts
- devDependencies
- ParamSpec
- nametag/schema.ts
- dependencies
- scripts
- viewer.ts

## God Nodes (most connected - your core abstractions)
1. `App` - 67 edges
2. `manifold-3d` - 61 edges
3. `Params` - 49 edges
4. `coerceAll()` - 44 edges
5. `build()` - 43 edges
6. `roundedRect()` - 42 edges
7. `defaultsOf()` - 39 edges
8. `serialize()` - 34 edges
9. `BuildCtx` - 34 edges
10. `rect()` - 31 edges

## Surprising Connections (you probably didn't know these)
- `Bundled fonts (OFL / Apache-2.0)` --references--> `Rubik Spray Paint license (Rubik Filtered, OFL)`  [AMBIGUOUS]
  README.md → public/fonts/LICENSE-rubik-spray-paint.txt
- `paramsWith()` --calls--> `defaultsOf()`  [EXTRACTED]
  test/building.test.ts → src/core/params/validate.ts
- `paramsWith()` --calls--> `defaultsOf()`  [EXTRACTED]
  test/hangar.test.ts → src/core/params/validate.ts
- `paramsWith()` --calls--> `defaultsOf()`  [EXTRACTED]
  test/mscage.test.ts → src/core/params/validate.ts
- `paramsWith()` --calls--> `defaultsOf()`  [EXTRACTED]
  test/pegboard.test.ts → src/core/params/validate.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **NonZero fill rule shared by font, image trace and pattern pipelines** — readme_opentype_bypass, readme_image_to_svg, readme_pattern_generator, readme_nonzero_fill_rule [EXTRACTED 1.00]
- **Manifold kernel constraints and workarounds** — readme_manifold_3d_kernel, readme_prismatic_or_axisymmetric, readme_softprism, readme_tapered_extrude, readme_warp_handedness, readme_pitched_roof_halfspaces [INFERRED 0.85]

## Communities (70 total, 10 thin omitted)

### Community 0 - "keyclicker/build.ts"
Cohesion: 0.10
Nodes (30): build(), keyClickerGenerator, readouts(), validate(), BodyPiece, derive(), Derived, keyPos() (+22 more)

### Community 1 - "mscage/parts.ts"
Cohesion: 0.08
Nodes (69): build(), clawOf(), fits(), fmt(), msCageGenerator, readouts(), validate(), BACK_T (+61 more)

### Community 2 - "hangar/schema.ts"
Cohesion: 0.22
Nodes (7): hangarGroups, hangarParams, hasBridge(), hasCatwalk(), hasJib(), hasTower(), V

### Community 3 - "Hangar Dimensions"
Cohesion: 0.07
Nodes (48): ARM_PIN, BOOM_H, BOOM_HALF, BOOM_V, BOSS_H, BRIDGE_T, BRIDGE_W, CAB_D (+40 more)

### Community 4 - "Pattern Geometry"
Cohesion: 0.08
Nodes (55): boundsOf(), DxfLayer, DxfOptions, num(), pair(), sanitizeLayer(), writeDxf(), ccw() (+47 more)

### Community 5 - "Shelf Generator"
Cohesion: 0.09
Nodes (43): build(), buildBacker(), buildCluster(), buildModule(), buildPin(), cavity(), cornerAngle(), cornerR() (+35 more)

### Community 6 - "drawer/build.ts"
Cohesion: 0.13
Nodes (28): buildBin(), buildClip(), clipNotches(), clipStations(), labelTab(), scoop(), shell(), build() (+20 more)

### Community 7 - "armPose"
Cohesion: 0.42
Nodes (9): add(), armPose(), buildClaw(), buildForearm(), buildUpperArm(), buildWrist(), jointHoleAt(), link() (+1 more)

### Community 8 - "Building Plan And Rooftop"
Cohesion: 0.15
Nodes (37): rng(), hasBulkhead(), box(), buildRooftop(), clearOf(), deckSpan(), flatDeck(), garden() (+29 more)

### Community 9 - "hangar/build.ts"
Cohesion: 0.09
Nodes (41): build(), clawOf(), fmt(), hangarGenerator, PRINT_ARM_FLAT, PRINT_ARM_PIN, PRINT_FLIPPED, PRINT_FRONT_UP (+33 more)

### Community 10 - "ui/panel.ts"
Cohesion: 0.11
Nodes (16): opentype.js, ParamValue, isVisible(), BUNDLED_FONTS, FontEntry, blit(), el(), fmt() (+8 more)

### Community 11 - "Building Build And Cladding"
Cohesion: 0.11
Nodes (33): build(), CLADDING_WORDS, overallSize(), platesFor(), readouts(), SCREEN_WORDS, suggestScale(), validate() (+25 more)

### Community 13 - "storey.ts"
Cohesion: 0.19
Nodes (29): roofAccess(), claddingCutter(), faceOut(), stripeSpans(), cutAway(), faceLen(), faceMid(), faces() (+21 more)

### Community 14 - "Hangar Bridge And Tower"
Cohesion: 0.14
Nodes (25): box(), buildCatwalkLegs(), buildGlass(), buildRailing(), buildRoofRailing(), glassSpan(), leftWallBody(), legFloorHoles() (+17 more)

### Community 15 - "Building Facade"
Cohesion: 0.20
Nodes (29): awning(), balcony(), balconyLimit(), bandSolid(), Board, box(), canopy(), FacadeWork (+21 more)

### Community 16 - "Hangar Boom And House"
Cohesion: 0.15
Nodes (30): backWallBody(), boomBlade(), buildBoom(), buildCabGlass(), buildHeaderStripes(), buildHouse(), buildHouseLights(), buildLeaf() (+22 more)

### Community 17 - "nametag/build.ts"
Cohesion: 0.19
Nodes (17): slot(), missingCharacters(), build(), frameRing(), holeSection(), lines(), measureFor(), secondLineText() (+9 more)

### Community 18 - "Permalink And Presets"
Cohesion: 0.20
Nodes (4): Params, findGenerator(), generatorById(), App

### Community 20 - "Building Roof"
Cohesion: 0.19
Nodes (21): screenRecess(), screenSolid(), signBoard(), buildRoof(), bulkhead(), cornice(), flatRoof(), flatRoofTop() (+13 more)

### Community 22 - "roundedRect"
Cohesion: 0.34
Nodes (22): backPlate(), buildCableHolder(), buildContainer(), buildController(), buildHeadphone(), buildHook(), buildPhoneStand(), buildShelf() (+14 more)

### Community 23 - "Building Geometry Constants"
Cohesion: 0.13
Nodes (17): BED_MM, Derived, FT_MM, Joint, LANDING_FT, Layout, Roof, Rooftop (+9 more)

### Community 24 - "TypeScript Config"
Cohesion: 0.11
Nodes (18): compilerOptions, exactOptionalPropertyTypes, isolatedModules, lib, module, moduleResolution, noEmit, noImplicitOverride (+10 more)

### Community 25 - "logokeychain/build.ts"
Cohesion: 0.18
Nodes (22): commandsToPathData(), escapeXml(), n(), ringsToSvg(), SvgOptions, segmentsForRadius(), build(), counterCount() (+14 more)

### Community 26 - "Shared Param Helpers"
Cohesion: 0.31
Nodes (10): bool(), color(), num(), V, clawColourParams(), clawParams(), hasStairs(), stairColourParams() (+2 more)

### Community 27 - "Hangar Ceiling"
Cohesion: 0.26
Nodes (16): box(), buildCeiling(), buildColumn(), ceilingGrid(), ceilingPegs(), columnAt(), columnSocket(), extent() (+8 more)

### Community 28 - "Font Licences"
Cohesion: 0.20
Nodes (12): Architects Daughter license (Kimberly Geswein, OFL), Bebas Neue license (OFL), Bowlby One SC license (Vernon Adams, OFL), Changa One license (Eduardo Tunni, OFL), Inter license (OFL), Nunito license (OFL), Oi! license (OFL), Pacifico license (OFL) (+4 more)

### Community 30 - "Building Schema"
Cohesion: 0.15
Nodes (8): STANDARD_SCALES, buildingGroups, buildingParams, groundKind(), SCALE_NOTE, trait(), windowKind(), traitsOf()

### Community 31 - "textSolid.ts"
Cohesion: 0.14
Nodes (21): manifold-3d, commandsToRings(), segsFor(), sub2(), DEFAULT_TOLERANCE, EmptyTextError, fontSizeForCapHeight(), isControl() (+13 more)

### Community 32 - "craneFrame"
Cohesion: 0.50
Nodes (5): buildArmPin(), buildBoomPin(), craneFrame(), jibPinSpan(), pinAlongY()

### Community 33 - "package.json"
Cohesion: 0.13
Nodes (13): name, private, type, version, @fontsource/bebas-neue, @fontsource/inter, @fontsource/nunito, @fontsource/pacifico (+5 more)

### Community 34 - "OpenType Typings"
Cohesion: 0.14
Nodes (8): BoundingBox, Font, FontTables, Glyph, opentype.js, Os2Table, Path, PathCommand

### Community 35 - "keychain/build.ts"
Cohesion: 0.16
Nodes (26): dropSlivers(), filletProfile(), hasThinStrokes(), Body, box2(), build(), buildInitial(), buildTag() (+18 more)

### Community 36 - "roundedRect"
Cohesion: 0.31
Nodes (15): roundedRect(), taperedExtrude(), addLoop(), bodyFootprint(), buildBase(), buildPost(), chamferedBox(), keyOpening() (+7 more)

### Community 37 - "params/types.ts"
Cohesion: 0.18
Nodes (18): TraceResult, Background, DiagonalPolicy, Mask, MaskOptions, MaskSource, TraceOptions, Base (+10 more)

### Community 38 - "coerceAll"
Cohesion: 0.14
Nodes (23): changedFromDefaults(), coerce(), coerceAll(), decodeHash(), defaultsOf(), encodeParams(), isContent(), styleOf() (+15 more)

### Community 42 - "README Generators Overview"
Cohesion: 0.31
Nodes (5): 3D Print Generator, Building miniature generator, Key clicker generator, Mobile suit hangar generator, MS cage generator

### Community 43 - "app.ts"
Cohesion: 0.06
Nodes (34): fflate, asMesh(), plateCount(), plateDir(), write3mfBundle(), writeStlBundle(), stlByteLength(), writeBinarySTL() (+26 more)

### Community 44 - "primitives.ts"
Cohesion: 0.18
Nodes (16): ellipse(), ngon(), pill(), BODY, bubbleSection(), Circle, CLOUD_DOME, CLOUD_ENDS (+8 more)

### Community 46 - ".onOutcome"
Cohesion: 0.11
Nodes (8): download(), safeFilename(), VectorExport, basePartId(), button(), div(), stlMeshOf(), ctxFor()

### Community 47 - "imagetrace/schema.ts"
Cohesion: 0.11
Nodes (8): image(), imageTraceGroups, imageTraceParams, background, logoKeychainGroups, logoKeychainParams, TRACE_IDS, V

### Community 48 - "Shelf Schema"
Cohesion: 0.36
Nodes (6): hasBack(), isModular(), isShelf(), isWall(), pinned(), V

### Community 49 - "3MF Export Typings"
Cohesion: 0.25
Nodes (5): Child3MF, FileForRelThumbnail, Header, @jscadui/3mf-export, Mesh3MF

### Community 50 - "App Architecture Concepts"
Cohesion: 0.29
Nodes (3): index.html app shell (sidebar + viewport), Model picker (generator front page), URL permalink state

### Community 51 - "2D Pipeline Concepts"
Cohesion: 0.29
Nodes (4): Clipper2 2D kernel / offset, Image to SVG generator (crack-following tracer), NonZero fill rule, Pattern generator (pitch and web)

### Community 52 - "Lettering Design Rules"
Cohesion: 0.33
Nodes (3): Lettering keychain generator, Name tag generator, Piece-count assertions in npm test

### Community 53 - "logokeychain.test.ts"
Cohesion: 0.19
Nodes (19): DX, DY, ringAreaAbs(), traceContours(), despeckle(), hasAlpha(), inkCount(), looksLikeTile() (+11 more)

### Community 54 - "backWallBody"
Cohesion: 0.38
Nodes (6): bar(), framedBays(), M, rect(), RELIEF_MAX, ReliefLayer

### Community 55 - "bridges.ts"
Cohesion: 0.48
Nodes (6): bridgeLoose(), closestOnSegment(), extent(), nearestPair(), Pt, tieBar()

### Community 56 - "flatten.ts"
Cohesion: 0.20
Nodes (11): EmptyTraceError, sectionFromRings(), dpChain(), ringToCommands(), segDist(), SmoothOptions, transformCommands(), turnAngles() (+3 more)

### Community 57 - "Bitmap"
Cohesion: 0.24
Nodes (4): ImageEntry, imageId(), ImageRegistry, Bitmap

### Community 61 - "pegboard/build.ts"
Cohesion: 0.07
Nodes (64): Accessory, HookStyle, build(), colours(), guideExport(), hardwareLine(), PALETTES, pegboardGenerator (+56 more)

### Community 62 - "trace.test.ts"
Cohesion: 0.12
Nodes (15): vitest, BuildCtx, BuildResult, fonts, kernel(), twoBlobs, withKernel(), built() (+7 more)

### Community 63 - "box"
Cohesion: 0.19
Nodes (25): buildClawChain(), buildClawHub(), buildTalon(), buildTalonPin(), clawLayout(), place(), talonAxis(), talonLugs() (+17 more)

### Community 64 - "dimensions.ts"
Cohesion: 0.31
Nodes (10): add(), DimDrawing, dimensionDrawing(), DimLabel, mid(), mm(), mul(), norm() (+2 more)

### Community 66 - "devDependencies"
Cohesion: 0.20
Nodes (10): devDependencies, @fontsource/bebas-neue, @fontsource/inter, @fontsource/nunito, @fontsource/pacifico, @fontsource/roboto-slab, @types/three, typescript (+2 more)

### Community 68 - "ParamSpec"
Cohesion: 0.39
Nodes (8): choice(), int(), hookSet(), on(), pegboardGroups, pegboardParams, placement(), V

### Community 70 - "nametag/schema.ts"
Cohesion: 0.15
Nodes (5): font(), Omitted, text(), ParamGroup, ParamSpec

### Community 73 - "dependencies"
Cohesion: 0.33
Nodes (6): dependencies, fflate, @jscadui/3mf-export, manifold-3d, opentype.js, three

### Community 74 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build, dev, preview, test, typecheck

### Community 75 - "viewer.ts"
Cohesion: 0.40
Nodes (4): three, VIEW_DIRS, ViewName, ViewPart

## Ambiguous Edges - Review These
- `Bundled fonts (OFL / Apache-2.0)` → `Rubik Spray Paint license (Rubik Filtered, OFL)`  [AMBIGUOUS]
  README.md · relation: references

## Knowledge Gaps
- **19 isolated node(s):** `@fontsource/bebas-neue`, `@fontsource/inter`, `@fontsource/nunito`, `@fontsource/pacifico`, `@fontsource/roboto-slab` (+14 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 313 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `manifold-3d` connect `textSolid.ts` to `keyclicker/build.ts`, `mscage/parts.ts`, `Hangar Dimensions`, `Pattern Geometry`, `Shelf Generator`, `drawer/build.ts`, `Building Plan And Rooftop`, `hangar/build.ts`, `Building Build And Cladding`, `storey.ts`, `Building Facade`, `nametag/build.ts`, `Building Roof`, `roundedRect`, `logokeychain/build.ts`, `Hangar Ceiling`, `package.json`, `keychain/build.ts`, `roundedRect`, `params/types.ts`, `app.ts`, `primitives.ts`, `.onOutcome`, `backWallBody`, `bridges.ts`, `flatten.ts`, `pegboard/build.ts`, `trace.test.ts`, `box`?**
  _High betweenness centrality (0.165) - this node is a cross-community bridge._
- **What connects `@fontsource/bebas-neue`, `@fontsource/inter`, `@fontsource/nunito` to the rest of the system?**
  _19 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `keyclicker/build.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1021021021021021 - nodes in this community are weakly interconnected._
- **Why does `Params` connect `Permalink And Presets` to `keyclicker/build.ts`, `mscage/parts.ts`, `Hangar Dimensions`, `Pattern Geometry`, `Shelf Generator`, `drawer/build.ts`, `hangar/build.ts`, `ui/panel.ts`, `Building Build And Cladding`, `nametag/build.ts`, `Building Geometry Constants`, `logokeychain/build.ts`, `Building Schema`, `keychain/build.ts`, `params/types.ts`, `coerceAll`, `app.ts`, `.onOutcome`, `pegboard/build.ts`, `trace.test.ts`?**
  _High betweenness centrality (0.091) - this node is a cross-community bridge._
- **Should `mscage/parts.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0775438596491228 - nodes in this community are weakly interconnected._
- **Why does `App` connect `Permalink And Presets` to `.buildChrome`, `ui/panel.ts`, `app.ts`, `Generator`, `.onOutcome`, `3D Viewer`, `trace.test.ts`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `Bundled fonts (OFL / Apache-2.0)` and `Rubik Spray Paint license (Rubik Filtered, OFL)`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._