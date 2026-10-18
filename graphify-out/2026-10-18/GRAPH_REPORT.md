# Graph Report - 3d-generator  (2026-10-18)

## Corpus Check
- 138 files · ~230,137 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: .ttf 7, .woff 5, (none) 1)

## Summary
- 1511 nodes · 4850 edges · 59 communities (52 shown, 7 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 129 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `30676e0a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- keyclicker/build.ts
- mscage/parts.ts
- build
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
- mscage.test.ts
- package.json
- OpenType Typings
- keychain/build.ts
- manifold-3d
- Param Type Definitions
- Pattern Schema
- README Generators Overview
- app.ts
- primitives.ts
- Kernel Design Constraints
- App
- imagetrace/schema.ts
- Shelf Schema
- 3MF Export Typings
- App Architecture Concepts
- 2D Pipeline Concepts
- Lettering Design Rules
- trace.test.ts
- backWallBody
- pegfit.test.ts
- Export Formats
- Graphify Rules
- 3MF Content Types
- pegboard/build.ts
- kernel.ts
- claw.ts
- pegboard/schema.ts

## God Nodes (most connected - your core abstractions)
1. `App` - 67 edges
2. `manifold-3d` - 59 edges
3. `Params` - 47 edges
4. `build()` - 43 edges
5. `coerceAll()` - 42 edges
6. `roundedRect()` - 39 edges
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
  test/building.test.ts → src/core/params/validate.ts
- `paramsWith()` --calls--> `defaultsOf()`  [EXTRACTED]
  test/hangar.test.ts → src/core/params/validate.ts
- `paramsWith()` --calls--> `defaultsOf()`  [EXTRACTED]
  test/keyclicker.test.ts → src/core/params/validate.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **NonZero fill rule shared by font, image trace and pattern pipelines** — readme_opentype_bypass, readme_image_to_svg, readme_pattern_generator, readme_nonzero_fill_rule [EXTRACTED 1.00]
- **Manifold kernel constraints and workarounds** — readme_manifold_3d_kernel, readme_prismatic_or_axisymmetric, readme_softprism, readme_tapered_extrude, readme_warp_handedness, readme_pitched_roof_halfspaces [INFERRED 0.85]

## Communities (59 total, 7 thin omitted)

### Community 0 - "keyclicker/build.ts"
Cohesion: 0.15
Nodes (28): roundedRect(), taperedExtrude(), missingCharacters(), build(), readouts(), validate(), derive(), Derived (+20 more)

### Community 1 - "mscage/parts.ts"
Cohesion: 0.10
Nodes (59): build(), clawOf(), fits(), fmt(), readouts(), validate(), BACK_T, CABIN_D (+51 more)

### Community 2 - "build"
Cohesion: 0.16
Nodes (22): build(), add(), armPose(), bridgePinSpan(), buildArmPin(), buildBackWall(), buildBoomPin(), buildClaw() (+14 more)

### Community 3 - "Hangar Dimensions"
Cohesion: 0.06
Nodes (59): ARM_PIN, BOOM_H, BOOM_HALF, BOOM_V, BOSS_H, BRIDGE_T, BRIDGE_W, CAB_D (+51 more)

### Community 4 - "Pattern Geometry"
Cohesion: 0.08
Nodes (54): boundsOf(), DxfLayer, DxfOptions, num(), pair(), sanitizeLayer(), writeDxf(), Part (+46 more)

### Community 5 - "Shelf Generator"
Cohesion: 0.10
Nodes (42): build(), buildBacker(), buildCluster(), buildModule(), buildPin(), cavity(), cornerAngle(), cornerR() (+34 more)

### Community 6 - "drawer/build.ts"
Cohesion: 0.07
Nodes (44): fflate, asMesh(), plateCount(), plateDir(), write3mfBundle(), writeStlBundle(), stlByteLength(), esc() (+36 more)

### Community 8 - "Building Plan And Rooftop"
Cohesion: 0.17
Nodes (33): rng(), hasBulkhead(), box(), buildRooftop(), clearOf(), deckSpan(), flatDeck(), garden() (+25 more)

### Community 9 - "hangar/build.ts"
Cohesion: 0.12
Nodes (27): clawOf(), fmt(), PRINT_ARM_FLAT, PRINT_ARM_PIN, PRINT_FLIPPED, PRINT_FRONT_UP, PRINT_NEG_X_UP, PRINT_POS_X_UP (+19 more)

### Community 10 - "ui/panel.ts"
Cohesion: 0.11
Nodes (16): Issue, ParamValue, isVisible(), FontEntry, findGenerator(), blit(), el(), fmt() (+8 more)

### Community 11 - "Building Build And Cladding"
Cohesion: 0.13
Nodes (27): build(), buildingGenerator, CLADDING_WORDS, overallSize(), platesFor(), readouts(), SCREEN_WORDS, suggestScale() (+19 more)

### Community 13 - "storey.ts"
Cohesion: 0.13
Nodes (44): roofAccess(), claddingCutter(), faceSection(), panelJoints(), Pattern, PATTERNS, placeOnFace(), guardRail() (+36 more)

### Community 14 - "Hangar Bridge And Tower"
Cohesion: 0.18
Nodes (20): box(), buildBridge(), buildCatwalkLegs(), buildGlass(), buildPipes(), buildTower(), cylinder(), glassSpan() (+12 more)

### Community 15 - "Building Facade"
Cohesion: 0.26
Nodes (22): awning(), balcony(), balconyLimit(), bandSolid(), Board, box(), canopy(), FacadeWork (+14 more)

### Community 16 - "Hangar Boom And House"
Cohesion: 0.20
Nodes (24): boomBlade(), buildBoom(), buildCabGlass(), buildHeaderStripes(), buildHouse(), buildHouseLights(), buildLeaf(), buildLeafStripes() (+16 more)

### Community 17 - "nametag/build.ts"
Cohesion: 0.19
Nodes (17): slot(), build(), frameRing(), holeSection(), lines(), measureFor(), nameTagGenerator, secondLineText() (+9 more)

### Community 18 - "Permalink And Presets"
Cohesion: 0.20
Nodes (3): Params, generatorById(), saveLastValues()

### Community 19 - "nametag/schema.ts"
Cohesion: 0.09
Nodes (6): font(), text(), ParamGroup, ParamSpec, keychainGroups, keychainParams

### Community 20 - "Building Roof"
Cohesion: 0.18
Nodes (23): screenRecess(), screenSolid(), buildRoof(), bulkhead(), cornice(), flatRoof(), flatRoofTop(), hasParapet() (+15 more)

### Community 21 - "3D Viewer"
Cohesion: 0.10
Nodes (15): three, add(), DimDrawing, dimensionDrawing(), DimLabel, mid(), mm(), mul() (+7 more)

### Community 22 - "roundedRect"
Cohesion: 0.34
Nodes (22): backPlate(), buildCableHolder(), buildContainer(), buildController(), buildHeadphone(), buildHook(), buildPhoneStand(), buildShelf() (+14 more)

### Community 23 - "Building Geometry Constants"
Cohesion: 0.13
Nodes (18): BED_MM, Cladding, Derived, FT_MM, IN_MM, Joint, Layout, Roof (+10 more)

### Community 24 - "TypeScript Config"
Cohesion: 0.11
Nodes (18): compilerOptions, exactOptionalPropertyTypes, isolatedModules, lib, module, moduleResolution, noEmit, noImplicitOverride (+10 more)

### Community 25 - "logokeychain/build.ts"
Cohesion: 0.11
Nodes (34): transformCommands(), commandsToPathData(), escapeXml(), n(), ringsToSvg(), SvgOptions, segmentsForRadius(), hangarGenerator (+26 more)

### Community 26 - "Shared Param Helpers"
Cohesion: 0.16
Nodes (17): bool(), color(), num(), hasBridge(), hasCatwalk(), hasJib(), hasTower(), V (+9 more)

### Community 27 - "Hangar Ceiling"
Cohesion: 0.24
Nodes (17): box(), buildCeiling(), buildColumn(), ceilingGrid(), ceilingPegs(), columnAt(), columnSocket(), extent() (+9 more)

### Community 28 - "Font Licences"
Cohesion: 0.20
Nodes (12): Architects Daughter license (Kimberly Geswein, OFL), Bebas Neue license (OFL), Bowlby One SC license (Vernon Adams, OFL), Changa One license (Eduardo Tunni, OFL), Inter license (OFL), Nunito license (OFL), Oi! license (OFL), Pacifico license (OFL) (+4 more)

### Community 29 - "FontRegistry"
Cohesion: 0.20
Nodes (3): opentype.js, BUNDLED_FONTS, FontRegistry

### Community 30 - "Building Schema"
Cohesion: 0.15
Nodes (8): STANDARD_SCALES, buildingGroups, buildingParams, groundKind(), SCALE_NOTE, trait(), windowKind(), traitsOf()

### Community 31 - "mscage.test.ts"
Cohesion: 0.29
Nodes (7): msCageGenerator, knobYs(), built(), ctxFor(), issuesOf(), paramsWith(), solidOf()

### Community 33 - "package.json"
Cohesion: 0.05
Nodes (35): dependencies, fflate, @jscadui/3mf-export, manifold-3d, opentype.js, three, devDependencies, @fontsource/bebas-neue (+27 more)

### Community 34 - "OpenType Typings"
Cohesion: 0.14
Nodes (8): BoundingBox, Font, FontTables, Glyph, opentype.js, Os2Table, Path, PathCommand

### Community 35 - "keychain/build.ts"
Cohesion: 0.17
Nodes (23): dropSlivers(), filletProfile(), serialize(), BuildResult, hasThinStrokes(), Body, box2(), build() (+15 more)

### Community 36 - "manifold-3d"
Cohesion: 0.16
Nodes (21): manifold-3d, DEFAULT_TOLERANCE, EmptyTextError, fontSizeForCapHeight(), isControl(), layoutLine(), measureTextWidth(), multilineTextOutline() (+13 more)

### Community 37 - "Param Type Definitions"
Cohesion: 0.38
Nodes (10): Omitted, Base, BoolParam, ChoiceParam, ColorParam, FontParam, ImageParam, NumberParam (+2 more)

### Community 42 - "README Generators Overview"
Cohesion: 0.31
Nodes (5): 3D Print Generator, Building miniature generator, Key clicker generator, Mobile suit hangar generator, MS cage generator

### Community 43 - "app.ts"
Cohesion: 0.11
Nodes (20): VectorExport, changedFromDefaults(), coerce(), coerceAll(), decodeHash(), defaultsOf(), encodeParams(), isContent() (+12 more)

### Community 44 - "primitives.ts"
Cohesion: 0.18
Nodes (16): ellipse(), ngon(), pill(), BODY, bubbleSection(), Circle, CLOUD_DOME, CLOUD_ENDS (+8 more)

### Community 46 - "App"
Cohesion: 0.11
Nodes (9): download(), safeFilename(), writeBinarySTL(), App, basePartId(), button(), div(), printable() (+1 more)

### Community 47 - "imagetrace/schema.ts"
Cohesion: 0.10
Nodes (9): image(), imageTraceGroups, imageTraceParams, background, logoKeychainGroups, logoKeychainParams, TRACE_IDS, traceParams (+1 more)

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

### Community 53 - "trace.test.ts"
Cohesion: 0.05
Nodes (59): vitest, DX, DY, ringAreaAbs(), traceContours(), despeckle(), hasAlpha(), inkCount() (+51 more)

### Community 54 - "backWallBody"
Cohesion: 0.19
Nodes (12): backWallBody(), headerHalf(), headerProfile(), prismXZ(), prismYZ(), topRailProfile(), bar(), framedBays() (+4 more)

### Community 55 - "pegfit.test.ts"
Cohesion: 0.36
Nodes (8): pegboardGenerator, disc(), escapes(), P, profiles(), rect(), separated(), tube()

### Community 61 - "pegboard/build.ts"
Cohesion: 0.09
Nodes (57): Accessory, HookStyle, build(), colours(), guideExport(), hardwareLine(), PALETTES, place() (+49 more)

### Community 62 - "kernel.ts"
Cohesion: 0.10
Nodes (20): THIN_STROKE_LIMIT, thinStrokeLoss(), ctxFor(), twoParts(), FONT_IDS, fonts, kernel(), loadFont() (+12 more)

### Community 63 - "claw.ts"
Cohesion: 0.19
Nodes (25): guardRail(), buildClawChain(), buildClawHub(), buildTalon(), buildTalonPin(), clawLayout(), place(), talonAxis() (+17 more)

### Community 68 - "pegboard/schema.ts"
Cohesion: 0.39
Nodes (8): choice(), int(), hookSet(), on(), pegboardGroups, pegboardParams, placement(), V

## Ambiguous Edges - Review These
- `Bundled fonts (OFL / Apache-2.0)` → `Rubik Spray Paint license (Rubik Filtered, OFL)`  [AMBIGUOUS]
  README.md · relation: references

## Knowledge Gaps
- **19 isolated node(s):** `@fontsource/bebas-neue`, `@fontsource/inter`, `@fontsource/nunito`, `@fontsource/pacifico`, `@fontsource/roboto-slab` (+14 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 308 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `manifold-3d` connect `manifold-3d` to `keyclicker/build.ts`, `mscage/parts.ts`, `Hangar Dimensions`, `Pattern Geometry`, `Shelf Generator`, `drawer/build.ts`, `Building Plan And Rooftop`, `hangar/build.ts`, `Building Build And Cladding`, `storey.ts`, `Building Facade`, `nametag/build.ts`, `Building Roof`, `roundedRect`, `logokeychain/build.ts`, `Hangar Ceiling`, `mscage.test.ts`, `package.json`, `keychain/build.ts`, `Param Type Definitions`, `app.ts`, `primitives.ts`, `trace.test.ts`, `backWallBody`, `pegboard/build.ts`, `kernel.ts`, `claw.ts`?**
  _High betweenness centrality (0.165) - this node is a cross-community bridge._
- **What connects `@fontsource/bebas-neue`, `@fontsource/inter`, `@fontsource/nunito` to the rest of the system?**
  _19 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `mscage/parts.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09831029185867896 - nodes in this community are weakly interconnected._
- **Why does `Params` connect `Permalink And Presets` to `keyclicker/build.ts`, `mscage/parts.ts`, `Hangar Dimensions`, `Pattern Geometry`, `Shelf Generator`, `drawer/build.ts`, `hangar/build.ts`, `ui/panel.ts`, `Building Build And Cladding`, `nametag/build.ts`, `Building Geometry Constants`, `logokeychain/build.ts`, `Building Schema`, `mscage.test.ts`, `keychain/build.ts`, `Param Type Definitions`, `app.ts`, `App`, `trace.test.ts`, `pegfit.test.ts`, `pegboard/build.ts`, `kernel.ts`?**
  _High betweenness centrality (0.095) - this node is a cross-community bridge._
- **Should `Hangar Dimensions` be split into smaller, more focused modules?**
  _Cohesion score 0.06174863387978142 - nodes in this community are weakly interconnected._
- **Why does `App` connect `App` to `keychain/build.ts`, `main.ts`, `ui/panel.ts`, `app.ts`, `Generator`, `Permalink And Presets`, `3D Viewer`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `Bundled fonts (OFL / Apache-2.0)` and `Rubik Spray Paint license (Rubik Filtered, OFL)`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._