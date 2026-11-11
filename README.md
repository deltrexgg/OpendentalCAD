# dentalCAD Studio

A browser-based dental mesh viewer built with React, Vite, Three.js, and React Three Fiber.

> [!IMPORTANT]
> ## Production-readiness roadmap — NOT YET COMPLETE
> **The ten feature-development phases are implemented, but this project is still a prototype.** Completing the checklist below is a separate engineering, verification, clinical-validation, and release effort. Do not use this application as the sole basis for patient treatment or manufacture until the relevant checks have been independently validated and approved by qualified dental and regulatory professionals.
>
> **Release rule:** do not label a build production-ready merely because it compiles, the UI works, a mesh passes the current preflight, or a handoff report is generated. Every applicable gate below needs documented evidence, an owner, and an explicit pass decision.

### How to use this roadmap

- Work through the gates in order; later clinical and manufacturing validation depends on reliable geometry and units.
- Turn each unchecked item into a GitHub issue or tracked task. Attach test data, expected results, actual results, and review evidence.
- Mark an item complete only after its acceptance criteria are demonstrated—not when code is merely written.
- Keep failed, deferred, and not-applicable items visible. Record who approved any exception and why.
- Test with synthetic fixtures first, then de-identified representative scans, and finally controlled clinical evaluation under appropriate oversight.

### Production-readiness status

| Gate | Area | Current status |
| --- | --- | --- |
| 1 | Build, automated tests, and CI | Not verified |
| 2 | Geometry correctness and unit safety | Not validated |
| 3 | Mesh robustness and performance | Not validated |
| 4 | Margin workflow and detection | Prototype |
| 5 | Crown design and anatomical accuracy | Prototype |
| 6 | Fit, contacts, and occlusion | Screening estimates only |
| 7 | Manufacturing / CAM compatibility | Not validated |
| 8 | Application security, privacy, and data handling | Not assessed |
| 9 | UX, reliability, accessibility, and supportability | Not validated |
| 10 | Clinical, regulatory, and release approval | Not completed |

---

## Production-readiness work — detailed checklist

### Gate 1 — Reproducible builds, automated tests, and CI

**Goal:** every change can be built, tested, reviewed, and traced to a known source revision.

- [ ] Run a clean dependency install from the lockfile and a production build on a documented supported Node.js version.
- [ ] Add automated unit tests for geometry utilities, margin processing, crown generation, subdivision, sculpting, fit analysis, occlusion analysis, manufacturing checks, and report generation.
- [ ] Add integration tests for the complete workflow: import scan → trace margin → refine → generate die/crown → edit → analyse → export STL and handoff report.
- [ ] Add browser end-to-end tests for import, camera controls, measurement, clipping, undo/reset, opposing scan alignment, preflight failures, and downloads.
- [ ] Add CI that runs linting, type/static checks where applicable, tests, and production build on every pull request.
- [ ] Add dependency and license checks; define a process for security updates and vulnerable-package remediation.
- [ ] Test supported browsers and operating systems, and document minimum hardware / WebGL requirements.
- [ ] Add reproducible test fixtures: valid closed mesh, open mesh, non-manifold mesh, inverted winding, degenerate faces, duplicate faces, very large mesh, and malformed STL/PLY files.

**Acceptance evidence:** a clean CI run, repeatable build instructions, automated test report, supported-browser matrix, and no unexplained failing or skipped critical tests.

### Gate 2 — Physical units, coordinate systems, and geometric correctness

**Goal:** all dimensions and transformations have explicit, consistent physical meaning.

- [ ] Establish millimetres as the internal canonical unit, or document and enforce another single canonical unit. Convert imported data at the boundary rather than mixing source units throughout calculations.
- [ ] Verify unit handling for STL and PLY imports. Since STL commonly carries no reliable unit metadata, require explicit user confirmation when units cannot be established; never silently guess.
- [ ] Make the selected unit visible in every measurement, slider, analysis result, export, and report. Test mm, cm, and inches with known reference objects.
- [ ] Define coordinate-frame conventions for upper/lower arches, preparation, crown, opposing scan, normals, axes, and transforms.
- [ ] Verify centring, rotation, scaling, registration, and export preserve the intended spatial relationship. Avoid independently centring meshes when that destroys clinically meaningful alignment.
- [ ] Add numerical tolerances and robust handling for tiny, huge, translated, rotated, and poorly conditioned meshes.
- [ ] Compare calculated area, volume, distances, and transforms against trusted reference meshes and independently computed expected values.

**Acceptance evidence:** documented unit/coordinate specification and automated reference tests demonstrating correct dimensions and alignment across supported input units and orientations.

### Gate 3 — Robust mesh processing, validation, and performance

**Goal:** malformed or complex scans cannot silently corrupt results or make the application unusable.

- [ ] Use robust mesh predicates and well-tested geometry algorithms for point-to-triangle distance, ray casting, inside/outside tests, signed distance, and intersection detection.
- [ ] Implement explicit self-intersection detection and distinguish open boundaries, non-manifold edges, inconsistent winding, duplicate geometry, and degenerate triangles.
- [ ] Add safe mesh repair workflows where appropriate: preserve the original, preview changes, record what changed, and allow rejection/undo. Never silently repair clinical input.
- [ ] Validate topology after every geometry-changing operation, including crown generation, sculpting, smoothing, subdivision, offsetting, and export.
- [ ] Replace approximate wall-thickness screening with a validated method suitable for the intended geometry; test thin walls, sharp edges, and narrow features against reference models.
- [ ] Add worker-based processing, cancellation, progress reporting, memory limits, and graceful recovery for expensive operations.
- [ ] Benchmark representative small, medium, and large scans. Define maximum supported face/vertex counts and performance budgets for import, analysis, editing, and export.
- [ ] Test repeated imports, repeated analysis, undo/redo, and disposal to detect memory leaks and stale GPU resources.

**Acceptance evidence:** a documented supported mesh envelope, reference-based geometry test suite, performance benchmarks, and predictable failure messages for unsupported or invalid input.

### Gate 4 — Preparation margin workflow

**Goal:** the margin is accurate, traceable, and reviewable—not just a visually plausible curve.

- [ ] Define a clinically reviewed margin representation, sampling density, continuity rules, and acceptable geometric tolerances.
- [ ] Improve margin assistance beyond the current curvature heuristic; evaluate robust edge/feature cues and tooth/preparation context on representative scans.
- [ ] Clearly separate automatic suggestions from operator-confirmed margin points. Never silently replace a clinician's traced margin.
- [ ] Provide precise point editing, insertion/deletion, smoothing with bounded deviation, closure checks, and local magnification.
- [ ] Detect self-crossing, discontinuities, duplicate points, poor sampling, and implausible jumps before die/crown generation.
- [ ] Display confidence and uncertainty honestly; allow manual correction and record the final operator-approved margin.
- [ ] Test against expert-annotated reference margins from multiple tooth types, scan systems, preparation styles, and scan qualities.

**Acceptance evidence:** a clinically defined margin-quality protocol, expert-reviewed datasets, measured agreement/error results, and documented operator approval workflow.

### Gate 5 — Crown generation and anatomical design

**Goal:** generated restorations are patient- and tooth-appropriate, editable, and geometrically sound.

- [ ] Replace the generic four-cusp template with tooth-specific anatomy and workflows appropriate to the intended restoration types.
- [ ] Establish a reliable crown design method using neighbouring teeth, opposing dentition, preparation geometry, and available scan context.
- [ ] Generate and validate the intaglio surface from the actual preparation and margin, including margin continuity and controlled cement-space offsets.
- [ ] Enforce minimum wall thickness and other design constraints throughout generation and every sculpt/anatomy edit—not only at final export.
- [ ] Improve cusp, ridge, groove, fossae, emergence profile, proximal contacts, and occlusal morphology using validated design constraints.
- [ ] Add robust smoothing and sculpting that preserve margins, contacts, intaglio geometry, and thickness constraints.
- [ ] Support appropriate restoration types and materials only after their design rules and manufacturing constraints are specified.
- [ ] Compare generated crowns with expert-designed reference restorations and record deviations requiring manual correction.

**Acceptance evidence:** tooth-specific validation cases, measured geometric deviations, preserved margin/intaglio constraints, and sign-off by qualified dental designers.

### Gate 6 — Fit, contacts, and occlusion validation

**Goal:** replace screening-only proximity numbers with clinically meaningful, validated assessments.

- [ ] Upgrade sampled unsigned gaps to validated surface-distance calculations with clear definitions and reproducible sampling/error bounds.
- [ ] Detect and report positive clearance, contact, and penetration separately; include signed-distance/intersection handling where mathematically valid.
- [ ] Validate crown-to-preparation fit across the complete intaglio and margin region, including local outliers and cement-space distribution.
- [ ] Register opposing arches using a documented alignment workflow with fit metrics and operator review; do not rely only on manual XYZ offsets.
- [ ] Evaluate proximal and occlusal contacts separately, with configurable clinical/material/workflow thresholds reviewed by domain experts.
- [ ] Do not infer bite force or functional performance from geometric distance alone. Any force or motion simulation needs its own validated biomechanical model.
- [ ] Display uncertainty, sampling density, unmatched regions, and areas not evaluated. Never show a green/pass state when analysis coverage is insufficient.
- [ ] Validate results against trusted dental CAD/CAM tools, physical models, and expert-reviewed cases.

**Acceptance evidence:** reference comparisons, known-contact and known-interference test models, documented tolerances, and clinically reviewed interpretation of every displayed metric.

### Gate 7 — Manufacturing and CAM compatibility

**Goal:** exported files meet the documented requirements of the actual manufacturing workflow.

- [ ] Define target manufacturing routes and materials (for example, milling or printing) before implementing process-specific checks.
- [ ] Obtain and document each manufacturing provider's file, unit, orientation, minimum feature, wall-thickness, margin, and material requirements.
- [ ] Validate exported STL geometry, scale, orientation, normals, topology, and file integrity by re-importing it into independent software.
- [ ] Add validated checks for undercuts, tool accessibility, minimum feature size, support needs, and process-specific constraints where required.
- [ ] Add 3MF or other formats only when their metadata and downstream compatibility are properly supported.
- [ ] If CAM/toolpath generation is added, treat it as a separate validated subsystem with machine/material-specific configuration and simulation.
- [ ] Keep the original design, final approved geometry, export file, and handoff report linked by stable identifiers and hashes.
- [ ] Test sample exports through the complete target CAM and manufacturing-provider workflow; inspect physical output where appropriate.

**Acceptance evidence:** documented compatibility matrix and successful independent import/CAM checks and controlled manufacturing trials for every claimed workflow.

### Gate 8 — Security, privacy, and patient-data handling

**Goal:** patient information and clinical files are handled safely and lawfully.

- [ ] Perform a data-flow and threat-model review before introducing accounts, cloud storage, APIs, analytics, or collaboration.
- [ ] Decide whether the product is local-only or cloud-connected. Document exactly what leaves the browser and why.
- [ ] If accounts or cloud features are introduced, implement strong authentication, role-based access, least privilege, secure sessions, and audited administrative access.
- [ ] Encrypt data in transit and at rest; define key management, backup, retention, deletion, and recovery procedures.
- [ ] Avoid patient identifiers in filenames, logs, analytics, crash reports, and exported diagnostics unless explicitly required and protected.
- [ ] Establish consent, access control, retention, deletion, and breach-response procedures appropriate to the jurisdictions and customers served.
- [ ] Review third-party libraries, hosting, telemetry, file handling, and upload endpoints for security and privacy risks.
- [ ] Conduct independent security testing before handling real patient data in any hosted environment.

**Acceptance evidence:** approved data-flow diagram, threat model, privacy/security review, tested access/deletion controls, and documented incident-response procedures. Obtain jurisdiction-specific legal advice; do not assume a particular compliance regime applies automatically.

### Gate 9 — Product reliability, usability, accessibility, and support

**Goal:** trained users can complete the workflow reliably and recover safely from mistakes.

- [ ] Conduct workflow reviews with dentists, dental technicians, and lab operators; document roles and common tasks.
- [ ] Make destructive actions reversible where possible; add clear warnings before replacing scans, margins, or restorations.
- [ ] Add autosave/recovery or explicit project save/load with versioned, validated project files before users rely on long sessions.
- [ ] Provide clear progress, cancellation, error recovery, and actionable diagnostics for import, analysis, and export.
- [ ] Ensure keyboard accessibility, readable contrast, scalable UI, accessible labels, and usable controls without a mouse where practical.
- [ ] Test on realistic displays, screen sizes, input devices, and lower-powered supported hardware.
- [ ] Add structured, privacy-safe diagnostic logs and a support bundle that excludes patient data by default.
- [ ] Prepare user documentation, workflow tutorials, known limitations, release notes, and support/escalation procedures.

**Acceptance evidence:** documented usability sessions, accessibility review, recovery tests, and support documentation reviewed by intended users.

### Gate 10 — Clinical validation, regulatory assessment, and controlled release

**Goal:** establish whether the intended product and claims are safe, effective, and legally marketable.

- [ ] Write a precise intended-use statement: users, patients, restoration types, clinical purpose, outputs, and what the software must not be used for.
- [ ] Obtain specialist regulatory advice for every target market. Determine applicable medical-device/software classification, quality-system obligations, clinical evidence, and registration requirements before commercial clinical use.
- [ ] Establish risk management covering incorrect geometry, unit errors, missed defects, misleading visualizations, export mistakes, data loss, and workflow misuse.
- [ ] Create a traceability matrix linking intended-use requirements → hazards/risks → software requirements → implementation → verification → validation evidence.
- [ ] Run formal verification against documented software requirements and formal validation with representative intended users and workflows.
- [ ] Conduct clinical performance evaluation under appropriate ethics, consent, privacy, and oversight arrangements. Use de-identified data where possible and do not treat developer testing as clinical evidence.
- [ ] Define human review and approval responsibilities. The software must not imply that automated checks replace professional judgement.
- [ ] Establish versioned releases, signed artifacts where appropriate, rollback, backup/restore, vulnerability response, change control, and post-release monitoring.
- [ ] Obtain documented approval from the responsible clinical, quality, security, and regulatory stakeholders before making production or clinical-use claims.

**Acceptance evidence:** approved intended-use statement, risk file, requirements traceability, verification/validation reports, regulatory determination, and formal release authorization. Requirements vary by jurisdiction and product claims; qualified regulatory professionals must determine what applies.

---

## Suggested execution order

1. **First: establish a trustworthy baseline.** Complete Gate 1 and capture the current build/test failures before changing geometry algorithms.
2. **Next: fix foundations.** Complete unit/coordinate correctness (Gate 2) and robust mesh processing (Gate 3).
3. **Then: validate the dental workflow.** Work through margins, crown design, and fit/occlusion (Gates 4–6) with expert-reviewed reference scans.
4. **Then: prove manufacturing compatibility.** Complete Gate 7 against named materials, machines, and providers.
5. **Before real patient data or release:** complete security/privacy, usability, clinical validation, and regulatory assessment (Gates 8–10).
6. **Release only against evidence.** Maintain a release checklist for each version and repeat impacted tests after every geometry or workflow change.

### Definition of production-ready

The application may be considered for a controlled production release only when its intended use is defined, all critical requirements are traceable to passing verification and validation evidence, geometry and unit handling are independently checked, target manufacturing workflows are validated, security/privacy and operational controls are approved, and the required clinical/regulatory approvals for the target market are in place. **A successful build or completed feature list alone is not sufficient.**

---

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


## Phase 9 — Restoration fit and occlusal surface assessment

- Tags the generated crown's inner intaglio surface and carries that mask through crown subdivision.
- Protects the inner intaglio surface from the external crown sculpt brush.
- Compares sampled intaglio vertices with a spatially sampled set of preparation-scan triangles and reports mean, median, 95th-percentile, minimum, and maximum unsigned surface gaps.
- Reports the share of sampled intaglio vertices within a user-selected tolerance, in the source file's units.
- Upgrades opposing-arch clearance analysis to compare sampled outer occlusal crown vertices against sampled opposing-scan triangles, rather than only comparing vertex-to-vertex distances.
- Displays sampled surface-gap statistics and near-contact sample counts; invalidates fit results when the crown or preparation geometry changes.

Phase 9 provides geometric screening estimates only. Triangle candidates and crown vertices are sampled for browser performance; distances are unsigned and may miss local defects or contacts. It does not detect signed penetration, determine contact forces, validate margin integrity or cement-space uniformity, or establish clinical acceptability. The selected tolerance is user-defined and remains in source-file units. Results require manual review by a qualified dental professional and are not a clinical certification.


## Phase 10 — Manufacturing handoff workflow

- Adds a final handoff panel for the selected generated crown or preparation die.
- Requires the operator to explicitly declare the source scan units (mm, cm, or inches); the application does not infer or convert units.
- Requires an operator confirmation that the restoration has been visually reviewed and that the geometric checks are estimates.
- Re-runs the manufacturing topology preflight at report-export time and blocks the report when the selected restoration fails.
- Exports a structured JSON handoff report containing source-scan metadata, declared units, restoration parameters, margin coordinates, topology results, estimated wall-thickness data, and available fit / clearance assessment summaries.
- Records the matching STL filename in the report. The STL is exported separately from the Restoration Design panel.

The handoff report improves traceability but is not a production certification. A passed preflight does not establish clinical suitability, exact fit, minimum wall thickness, absence of self-intersections, or machine compatibility. Fit and occlusion metrics remain sampled, unsigned estimates. Verify the STL in validated dental CAD/CAM software and follow the manufacturing provider's specifications. No unit conversion is performed.
