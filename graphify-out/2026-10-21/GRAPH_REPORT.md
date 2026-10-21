# Graph Report - 3d-generator  (2026-10-21)

## Corpus Check
- 139 files · ~232,818 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: .ttf 7, .woff 5, (none) 1)

## Summary
- 1515 nodes · 4870 edges · 77 communities (67 shown, 10 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 129 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d7ad0be7`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- keyclicker/build.ts
- mscage/parts.ts
- export3mf.test.ts
- Hangar Dimensions
- Pattern Geometry
- Shelf Generator
- drawer/build.ts
- main.ts
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
- nametag/schema.ts
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
- mscage/build.ts
- imagetrace/build.ts
- package.json
- OpenType Typings
- keychain/build.ts
- manifold-3d
- Param Type Definitions
- coerceAll
- Pattern Schema
- serialize.ts
- trace.test.ts
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
- pegfit.test.ts
- flatten.ts
- Bitmap
- Export Formats
- Graphify Rules
- 3MF Content Types
- pegboard/build.ts
- kernel.ts
- claw.ts
- dimensions.ts
- solid.ts
- devDependencies
- image/types.ts
- ParamSpec
- nametag/schema.ts
- ImageStore
- simplify.ts
- dependencies
- scripts
- viewer.ts
- manifold.ts

## God Nodes (most connected - your core abstractions)
1. `App` - 67 edges
2. `manifold-3d` - 60 edges
3. `Params` - 47 edges
4. `build()` - 43 edges
5. `roundedRect()` - 42 edges
6. `coerceAll()` - 42 edges
7. `defaultsOf()` - 37 edges
8. `serialize()` - 34 edges
9. `BuildCtx` - 33 edges
10. `rect()` - 31 edges

## Surprising Connections (you probably didn't know these)
- `Bundled fonts (OFL / Apache-2.0)` --references--> `Rubik Spray Paint license (Rubik Filtered, OFL)`  [AMBIGUOUS]
  README.md → public/fonts/LICENSE-rubik-spray-paint.txt
- `twoParts()` --calls--> `serialize()`  [EXTRACTED]
  test/export3mf.test.ts → src/core/kernel/serialize.ts
- `paramsWith()` --calls--> `defaultsOf()`  [EXTRACTED]
  test/mscage.test.ts → src/core/params/validate.ts
- `paramsWith()` --calls--> `defaultsOf()`  [EXTRACTED]
  test/pegboard.test.ts → src/core/params/validate.ts
- `paramsWith()` --calls--> `defaultsOf()`  [EXTRACTED]
  test/shelf.test.ts → src/core/params/validate.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **NonZero fill rule shared by font, image trace and pattern pipelines** — readme_opentype_bypass, readme_image_to_svg, readme_pattern_generator, readme_nonzero_fill_rule [EXTRACTED 1.00]
- **Manifold kernel constraints and workarounds** — readme_manifold_3d_kernel, readme_prismatic_or_axisymmetric, readme_softprism, readme_tapered_extrude, readme_warp_handedness, readme_pitched_roof_halfspaces [INFERRED 0.85]

## Communities (77 total, 10 thin omitted)

### Community 0 - "keyclicker/build.ts"
Cohesion: 0.21
Nodes (19): build(), keyClickerGenerator, readouts(), validate(), derive(), Derived, keyX(), legendChars() (+11 more)

### Community 1 - "mscage/parts.ts"
Cohesion: 0.11
Nodes (40): BACK_T, CABIN_D, CABIN_H, COLUMN, DECK_T, Derived, FRONT_STRIP, galleryWidth() (+32 more)

### Community 2 - "export3mf.test.ts"
Cohesion: 0.18
Nodes (13): fflate, asMesh(), plateCount(), plateDir(), write3mfBundle(), writeStlBundle(), writeBinarySTL(), esc() (+5 more)

### Community 3 - "Hangar Dimensions"
Cohesion: 0.07
Nodes (48): ARM_PIN, BOOM_H, BOOM_HALF, BOOM_V, BOSS_H, BRIDGE_T, BRIDGE_W, CAB_D (+40 more)

### Community 4 - "Pattern Geometry"
Cohesion: 0.08
Nodes (55): boundsOf(), DxfLayer, DxfOptions, num(), pair(), sanitizeLayer(), writeDxf(), xsec() (+47 more)

### Community 5 - "Shelf Generator"
Cohesion: 0.12
Nodes (36): build(), buildBacker(), buildCluster(), buildModule(), buildPin(), cavity(), cornerAngle(), cornerR() (+28 more)

### Community 6 - "drawer/build.ts"
Cohesion: 0.14
Nodes (26): buildBin(), buildClip(), clipNotches(), clipStations(), labelTab(), scoop(), shell(), build() (+18 more)

### Community 8 - "Building Plan And Rooftop"
Cohesion: 0.15
Nodes (36): rng(), penthouseSpan(), box(), buildRooftop(), clearOf(), deckSpan(), garden(), helipad() (+28 more)

### Community 9 - "hangar/build.ts"
Cohesion: 0.10
Nodes (43): build(), clawOf(), fmt(), hangarGenerator, PRINT_ARM_FLAT, PRINT_ARM_PIN, PRINT_FLIPPED, PRINT_FRONT_UP (+35 more)

### Community 10 - "ui/panel.ts"
Cohesion: 0.12
Nodes (15): Issue, Params, ParamValue, isVisible(), blit(), el(), fmt(), INK (+7 more)

### Community 11 - "Building Build And Cladding"
Cohesion: 0.16
Nodes (24): build(), CLADDING_WORDS, overallSize(), platesFor(), readouts(), SCREEN_WORDS, suggestScale(), validate() (+16 more)

### Community 13 - "storey.ts"
Cohesion: 0.20
Nodes (28): claddingCutter(), faceOut(), stripeSpans(), cutAway(), faceLen(), faceMid(), windowCentres(), archHead() (+20 more)

### Community 14 - "Hangar Bridge And Tower"
Cohesion: 0.11
Nodes (31): box(), buildBridge(), buildCatwalkLegs(), buildGlass(), buildPipes(), buildRailing(), buildRoofRailing(), buildTower() (+23 more)

### Community 15 - "Building Facade"
Cohesion: 0.22
Nodes (28): awning(), balcony(), balconyLimit(), bandSolid(), Board, box(), canopy(), FacadeWork (+20 more)

### Community 16 - "Hangar Boom And House"
Cohesion: 0.19
Nodes (26): boomBlade(), buildBoom(), buildCabGlass(), buildHeaderStripes(), buildHouse(), buildHouseLights(), buildLeaf(), buildLeafStripes() (+18 more)

### Community 17 - "nametag/build.ts"
Cohesion: 0.12
Nodes (27): slot(), DEFAULT_TOLERANCE, EmptyTextError, fontSizeForCapHeight(), isControl(), layoutLine(), multilineTextOutline(), PlacedGlyph (+19 more)

### Community 18 - "Permalink And Presets"
Cohesion: 0.19
Nodes (4): encodeParams(), findGenerator(), generatorById(), App

### Community 19 - "nametag/schema.ts"
Cohesion: 0.10
Nodes (9): font(), text(), ParamGroup, keychainGroups, keychainParams, keyClickerGroups, keyClickerParams, FONT_IDS (+1 more)

### Community 20 - "Building Roof"
Cohesion: 0.17
Nodes (24): roofAccess(), screenRecess(), screenSolid(), signBoard(), buildRoof(), bulkhead(), cornice(), flatRoof() (+16 more)

### Community 22 - "roundedRect"
Cohesion: 0.34
Nodes (22): backPlate(), buildCableHolder(), buildContainer(), buildController(), buildHeadphone(), buildHook(), buildPhoneStand(), buildShelf() (+14 more)

### Community 23 - "Building Geometry Constants"
Cohesion: 0.10
Nodes (23): BED_MM, Cladding, Derived, IN_MM, Joint, Layout, Roof, Rooftop (+15 more)

### Community 24 - "TypeScript Config"
Cohesion: 0.11
Nodes (18): compilerOptions, exactOptionalPropertyTypes, isolatedModules, lib, module, moduleResolution, noEmit, noImplicitOverride (+10 more)

### Community 25 - "logokeychain/build.ts"
Cohesion: 0.21
Nodes (17): ngon(), segmentsForRadius(), bridgeLoose(), closestOnSegment(), extent(), nearestPair(), Pt, tieBar() (+9 more)

### Community 26 - "Shared Param Helpers"
Cohesion: 0.14
Nodes (19): bool(), color(), num(), hangarGroups, hangarParams, hasBridge(), hasCatwalk(), hasJib() (+11 more)

### Community 27 - "Hangar Ceiling"
Cohesion: 0.24
Nodes (17): box(), buildCeiling(), buildColumn(), ceilingGrid(), ceilingPegs(), columnAt(), columnSocket(), extent() (+9 more)

### Community 28 - "Font Licences"
Cohesion: 0.20
Nodes (12): Architects Daughter license (Kimberly Geswein, OFL), Bebas Neue license (OFL), Bowlby One SC license (Vernon Adams, OFL), Changa One license (Eduardo Tunni, OFL), Inter license (OFL), Nunito license (OFL), Oi! license (OFL), Pacifico license (OFL) (+4 more)

### Community 29 - "FontRegistry"
Cohesion: 0.15
Nodes (4): opentype.js, BUNDLED_FONTS, FontEntry, FontRegistry

### Community 30 - "Building Schema"
Cohesion: 0.15
Nodes (8): STANDARD_SCALES, buildingGroups, buildingParams, groundKind(), SCALE_NOTE, trait(), windowKind(), traitsOf()

### Community 31 - "mscage/build.ts"
Cohesion: 0.12
Nodes (37): build(), clawOf(), fits(), fmt(), msCageGenerator, readouts(), validate(), derive() (+29 more)

### Community 32 - "imagetrace/build.ts"
Cohesion: 0.25
Nodes (11): EmptyTraceError, sectionFromRings(), transformCommands(), BuildCtx, build(), counterCount(), hangingLug(), MAX_TRACE_PIXELS (+3 more)

### Community 33 - "package.json"
Cohesion: 0.13
Nodes (13): name, private, type, version, @fontsource/bebas-neue, @fontsource/inter, @fontsource/nunito, @fontsource/pacifico (+5 more)

### Community 34 - "OpenType Typings"
Cohesion: 0.14
Nodes (8): BoundingBox, Font, FontTables, Glyph, opentype.js, Os2Table, Path, PathCommand

### Community 35 - "keychain/build.ts"
Cohesion: 0.14
Nodes (31): dropSlivers(), filletProfile(), serialize(), BuildResult, hasThinStrokes(), measureTextWidth(), missingCharacters(), Body (+23 more)

### Community 36 - "manifold-3d"
Cohesion: 0.29
Nodes (12): manifold-3d, pill(), roundedRect(), taperedExtrude(), BaseParts, buildBase(), buildKeycap(), buildRoundedKeycap() (+4 more)

### Community 37 - "Param Type Definitions"
Cohesion: 0.33
Nodes (11): Omitted, Base, BoolParam, ChoiceParam, ColorParam, FontParam, ImageParam, NumberParam (+3 more)

### Community 38 - "coerceAll"
Cohesion: 0.23
Nodes (15): coerceAll(), defaultsOf(), derived(), issuesOf(), paramsWith(), paramsWith(), errorsOf(), paramsWith() (+7 more)

### Community 40 - "serialize.ts"
Cohesion: 0.30
Nodes (7): stlByteLength(), deinterleave(), KernelError, RawMesh, assembledToBufferGeometry(), laidOutToBufferGeometry(), toBufferGeometry()

### Community 41 - "trace.test.ts"
Cohesion: 0.22
Nodes (10): DX, DY, ringAreaAbs(), traceContours(), traceBitmap(), DiagonalPolicy, bitmapOf(), disc() (+2 more)

### Community 42 - "README Generators Overview"
Cohesion: 0.31
Nodes (5): 3D Print Generator, Building miniature generator, Key clicker generator, Mobile suit hangar generator, MS cage generator

### Community 43 - "app.ts"
Cohesion: 0.11
Nodes (15): changedFromDefaults(), coerce(), decodeHash(), isContent(), styleOf(), buildingGenerator, imageTraceGenerator, logoKeychainGenerator (+7 more)

### Community 44 - "primitives.ts"
Cohesion: 0.21
Nodes (14): ellipse(), BODY, bubbleSection(), Circle, CLOUD_DOME, CLOUD_ENDS, CLOUD_RIGHT_END, cloudSection() (+6 more)

### Community 46 - ".onOutcome"
Cohesion: 0.14
Nodes (6): download(), safeFilename(), basePartId(), button(), printable(), stlMeshOf()

### Community 47 - "imagetrace/schema.ts"
Cohesion: 0.10
Nodes (9): image(), imageTraceGroups, imageTraceParams, background, logoKeychainGroups, logoKeychainParams, TRACE_IDS, traceParams (+1 more)

### Community 48 - "Shelf Schema"
Cohesion: 0.27
Nodes (8): hasBack(), isModular(), isShelf(), isWall(), pinned(), shelfGroups, shelfParams, V

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
Cohesion: 0.22
Nodes (15): despeckle(), hasAlpha(), inkCount(), looksLikeTile(), mixedOpaque(), outsidePaper(), removeTile(), tileInk() (+7 more)

### Community 54 - "backWallBody"
Cohesion: 0.18
Nodes (13): trackTop(), backWallBody(), headerHalf(), headerProfile(), prismXZ(), prismYZ(), topRailProfile(), bar() (+5 more)

### Community 55 - "pegfit.test.ts"
Cohesion: 0.36
Nodes (8): PEG_FIT, disc(), escapes(), P, profiles(), rect(), separated(), tube()

### Community 56 - "flatten.ts"
Cohesion: 0.25
Nodes (10): commandsToPathData(), escapeXml(), n(), ringsToSvg(), SvgOptions, commandsToRings(), PathCommand, ringArea() (+2 more)

### Community 57 - "Bitmap"
Cohesion: 0.22
Nodes (5): ImageEntry, imageId(), ImageRegistry, Bitmap, Artwork

### Community 61 - "pegboard/build.ts"
Cohesion: 0.09
Nodes (49): Accessory, HookStyle, build(), colours(), guideExport(), hardwareLine(), PALETTES, place() (+41 more)

### Community 62 - "kernel.ts"
Cohesion: 0.09
Nodes (21): vitest, ctxFor(), fonts, kernel(), loadFont(), ctxFor(), ctxFor(), ctxFor() (+13 more)

### Community 63 - "claw.ts"
Cohesion: 0.41
Nodes (13): buildClawChain(), buildClawHub(), buildTalon(), buildTalonPin(), clawLayout(), place(), talonAxis(), talonLugs() (+5 more)

### Community 64 - "dimensions.ts"
Cohesion: 0.31
Nodes (10): add(), DimDrawing, dimensionDrawing(), DimLabel, mid(), mm(), mul(), norm() (+2 more)

### Community 65 - "solid.ts"
Cohesion: 0.35
Nodes (8): buildDivider(), buildTray(), dividerProfile(), TraySection, y0(), y1(), M, slab()

### Community 66 - "devDependencies"
Cohesion: 0.20
Nodes (10): devDependencies, @fontsource/bebas-neue, @fontsource/inter, @fontsource/nunito, @fontsource/pacifico, @fontsource/roboto-slab, @types/three, typescript (+2 more)

### Community 67 - "image/types.ts"
Cohesion: 0.24
Nodes (8): Background, MaskOptions, MaskSource, TraceOptions, decodeImageFile(), Drawable, loadDrawable(), StoredBitmap

### Community 68 - "ParamSpec"
Cohesion: 0.17
Nodes (10): int(), ParamSpec, drawerGroups, drawerParams, hookSet(), on(), pegboardGroups, pegboardParams (+2 more)

### Community 70 - "nametag/schema.ts"
Cohesion: 0.25
Nodes (3): choice(), nameTagGroups, nameTagParams

### Community 72 - "simplify.ts"
Cohesion: 0.43
Nodes (6): dpChain(), ringToCommands(), segDist(), simplifyRing(), SmoothOptions, turnAngles()

### Community 73 - "dependencies"
Cohesion: 0.33
Nodes (6): dependencies, fflate, @jscadui/3mf-export, manifold-3d, opentype.js, three

### Community 74 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build, dev, preview, test, typecheck

### Community 75 - "viewer.ts"
Cohesion: 0.40
Nodes (4): three, VIEW_DIRS, ViewName, ViewPart

### Community 76 - "manifold.ts"
Cohesion: 0.83
Nodes (3): initKernel(), warmKernel(), withArena()

## Ambiguous Edges - Review These
- `Bundled fonts (OFL / Apache-2.0)` → `Rubik Spray Paint license (Rubik Filtered, OFL)`  [AMBIGUOUS]
  README.md · relation: references

## Knowledge Gaps
- **19 isolated node(s):** `@fontsource/bebas-neue`, `@fontsource/inter`, `@fontsource/nunito`, `@fontsource/pacifico`, `@fontsource/roboto-slab` (+14 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 308 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `manifold-3d` connect `manifold-3d` to `keyclicker/build.ts`, `mscage/parts.ts`, `Hangar Dimensions`, `Pattern Geometry`, `Shelf Generator`, `drawer/build.ts`, `Building Plan And Rooftop`, `hangar/build.ts`, `Building Build And Cladding`, `storey.ts`, `Building Facade`, `nametag/build.ts`, `nametag/schema.ts`, `Building Roof`, `roundedRect`, `Building Geometry Constants`, `logokeychain/build.ts`, `Hangar Ceiling`, `mscage/build.ts`, `imagetrace/build.ts`, `package.json`, `keychain/build.ts`, `Param Type Definitions`, `serialize.ts`, `trace.test.ts`, `primitives.ts`, `logokeychain.test.ts`, `backWallBody`, `pegboard/build.ts`, `kernel.ts`, `claw.ts`, `solid.ts`, `manifold.ts`?**
  _High betweenness centrality (0.163) - this node is a cross-community bridge._
- **What connects `@fontsource/bebas-neue`, `@fontsource/inter`, `@fontsource/nunito` to the rest of the system?**
  _19 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `mscage/parts.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11074197120708748 - nodes in this community are weakly interconnected._
- **Why does `Params` connect `ui/panel.ts` to `keyclicker/build.ts`, `mscage/parts.ts`, `Hangar Dimensions`, `Pattern Geometry`, `Shelf Generator`, `drawer/build.ts`, `hangar/build.ts`, `Building Build And Cladding`, `nametag/build.ts`, `Permalink And Presets`, `Building Geometry Constants`, `logokeychain/build.ts`, `Building Schema`, `mscage/build.ts`, `imagetrace/build.ts`, `keychain/build.ts`, `Param Type Definitions`, `trace.test.ts`, `app.ts`, `logokeychain.test.ts`, `pegfit.test.ts`, `pegboard/build.ts`, `kernel.ts`?**
  _High betweenness centrality (0.087) - this node is a cross-community bridge._
- **Should `Hangar Dimensions` be split into smaller, more focused modules?**
  _Cohesion score 0.07265306122448979 - nodes in this community are weakly interconnected._
- **Why does `App` connect `Permalink And Presets` to `keychain/build.ts`, `.buildChrome`, `main.ts`, `ui/panel.ts`, `app.ts`, `Generator`, `.onOutcome`, `3D Viewer`, `FontRegistry`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `Bundled fonts (OFL / Apache-2.0)` and `Rubik Spray Paint license (Rubik Filtered, OFL)`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._