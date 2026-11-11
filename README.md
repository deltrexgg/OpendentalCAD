# dentalCAD Studio

A browser-based dental mesh viewer built with React, Vite, Three.js, and React Three Fiber.

## Current capabilities

- Import local STL and PLY meshes using the file picker or drag and drop.
- Parse meshes in the browser; files are not uploaded to a server.
- Orbit, pan, zoom, fit the model, and jump to standard top / bottom / front / back / left / right views.
- Select the loaded mesh, inspect its basic statistics, and remove it from the scene.
- Toggle the grid and wireframe display; adjust surface color and opacity.
- Trace a manual preparation margin on the mesh, undo or clear points, close the curve, and export its coordinates to CSV.
- Refine a traced margin with curvature-guided point suggestions based on local vertex-normal variation; preview and accept or discard the suggestions.
- Generate a tapered preparation die from a closed manual margin.
- Generate an initial parametric crown shell with adjustable cement-space allowance, wall thickness, and crown height.
- Apply a procedural four-cusp occlusal form with adjustable cusp height, central groove depth, and ridge height.
- Export generated die and crown meshes as binary STL files.
- Measure straight-line 3D distance between two picked points on the mesh.
- Inspect a live X / Y / Z clipping plane to examine internal cross-sections.
- Review estimated surface area, enclosed volume (only for meshes passing the edge-closure check), boundary edges, non-manifold edges, inconsistent triangle winding, and degenerate faces.

## Requirements

- Node.js 20.19+ or 22.12+
- npm

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Production build

```bash
npm run build
npm run preview
```

## Viewer controls

| Action | Control |
| --- | --- |
| Orbit | Left-drag or select Orbit in the tool rail |
| Pan | Right-drag or select Pan, then left-drag |
| Zoom | Mouse wheel or the viewport + / − controls |
| Standard view | Use the view buttons at the upper-right of the viewport |
| Fit model | Use the fit button in the tool rail or viewport |
| Select | Choose Select, then click the mesh |
| Import | Use Import or drop an STL / PLY file into the viewport |

## Important notes

- Mesh dimensions are displayed in the source file's units. The UI does not assume or convert those units to millimetres.
- Phase 4 adds assisted refinement of a manually traced margin. It snaps seed points toward nearby mesh regions with stronger vertex-normal variation; it does not autonomously locate a preparation margin from an unmarked scan.
- Phase 3 die and crown geometry is a parametric starting point derived from the traced margin. It does not reconstruct tooth anatomy, infer occlusion or contacts, or guarantee a clinically correct intaglio surface.
- Cement space is an approximate radial allowance in source units, not a validated normal-offset computation. Verify and refine all exported geometry in a suitable dental CAD workflow before manufacturing or clinical use.
- Measurements and mesh-analysis values use source-file units; no automatic conversion to millimetres is performed.
- Cross-section mode clips the visible mesh but does not generate a capped section solid.
- Mesh quality checks are estimates and do not certify a mesh for clinical use or manufacturing.
- Large meshes are limited by the browser and device memory available.
- This is an early frontend prototype. Fully automatic margin detection, tooth-specific anatomy-aware crown generation, clinically valid contact / occlusion solving, robust manufacturing-grade mesh repair, exact fit analysis, and manufacturing-process validation are not implemented.


## Phase 5 — Crown anatomy sculpting

- Generate a denser crown surface by subdividing the initial parametric crown mesh.
- Enter crown sculpt mode and drag directly on the crown surface with an adjustable brush radius and strength.
- Use **Add / raise**, **Reduce / lower**, and **Smooth** brush modes to shape the external crown surface.
- Undo the previous sculpt stroke or regenerate the original parametric crown shape.
- Sculpting is local in the browser and changes the crown mesh used for STL export.

Phase 5 provides manual outer-surface shaping only. It does not automatically create anatomically correct cusps, grooves, proximal contacts, or occlusal relationships, and it is not clinically validated. Brush dimensions use the loaded scan's source units.


## Phase 6 — Occlusion and clearance analysis

- Load a separate opposing-arch STL / PLY scan and display it as a translucent overlay.
- Adjust X / Y / Z offsets to manually align the opposing scan with the generated crown.
- Analyse crown-to-opposing-scan proximity using a nearest-sampled-vertex spatial grid.
- Display an estimated clearance heat map on the crown: red at / below the selected threshold, yellow within twice the threshold, and green beyond it.
- Report minimum and average sampled-vertex distance and the number of crown vertices within the selected near-contact threshold.
- Re-run the analysis after changing alignment, threshold, or crown sculpting.

Phase 6 is an interactive geometric proximity aid, not a clinical occlusion solver. Distances are nearest sampled-vertex estimates rather than exact point-to-triangle surface distances; they are unsigned and cannot reliably detect mesh intersection. The opposing arch must be manually aligned, and the results depend on scan density, orientation, and source units. It does not establish clinically valid contacts, occlusal forces, or manufacturing readiness.


## Phase 7 — Manufacturing preparation

- Adds a preflight panel for generated crowns and preparation dies.
- Checks triangle indices and coordinates, open boundary edges, non-manifold edges, inconsistent winding, degenerate faces, duplicate faces, and enclosed-volume validity.
- STL export now runs the same topology preflight and blocks export when the mesh fails those checks.
- Estimates wall thickness by sampling vertices and searching for nearby vertices with opposing normals; reports the minimum and 10th-percentile sampled estimates.
- All analysis runs locally in the browser and uses source-file units.

Phase 7 does not automatically repair meshes. The wall-thickness value is a nearest opposing-normal vertex estimate, not a certified minimum-thickness computation; sampling can miss thin regions. Undercut detection, exact surface-distance thickness, fit validation, self-intersection detection, and manufacturing-process simulation are not implemented. A passed topology preflight only means the implemented checks did not find the listed defects; it is not a clinical or manufacturing certification. No production build, browser interaction test, or representative dental-scan validation has been completed for this phase.


## Phase 8 — Procedural crown anatomy assist

- Adds an anatomy-assist panel for generated crowns with adjustable cusp height, central groove depth, and occlusal ridge height.
- Applies a generic four-cusp occlusal surface form aligned to the crown frame derived from the traced preparation margin.
- Stores the preparation frame through crown subdivision so anatomical shaping follows the margin orientation rather than assuming a fixed world axis.
- Records the operation in the existing crown undo history; undo and reset remain available.
- Changes affect the crown geometry used by clearance analysis, manufacturing preflight, and STL export. Previous analysis results are invalidated when the form is applied.

Phase 8 is a procedural, generic four-cusp shaping aid. It does not identify tooth type, reproduce patient-specific anatomy, model natural contacts, solve functional occlusion, or guarantee minimum wall thickness after deformation. The output must be reviewed and refined manually. It is not clinically validated and does not establish clinical or manufacturing readiness.
