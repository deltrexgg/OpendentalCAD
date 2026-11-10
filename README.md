# dentalCAD Studio

A browser-based dental mesh viewer built with React, Vite, Three.js, and React Three Fiber.

## Current capabilities

- Import local STL and PLY meshes using the file picker or drag and drop.
- Parse meshes in the browser; files are not uploaded to a server.
- Orbit, pan, zoom, fit the model, and jump to standard top / bottom / front / back / left / right views.
- Select the loaded mesh, inspect its basic statistics, and remove it from the scene.
- Toggle the grid and wireframe display; adjust surface color and opacity.
- Trace a manual margin point sequence on the mesh, undo or clear points, close the sequence, and export its coordinates to CSV.

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
- Margin tracing is a manual point-selection aid. It is not automatic clinical margin detection and is not validated for clinical use.
- Large meshes are limited by the browser and device memory available.
- This is an early frontend prototype. Dental die generation, restoration design, and advanced mesh repair are not implemented yet.
