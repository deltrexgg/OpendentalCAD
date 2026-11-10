import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Bounds, Center, Line, OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js'
import * as THREE from 'three'
import { analyzeMesh } from './meshAnalysis.js'
import {
  Activity, Box, CircleHelp, Check, Crosshair, Download, Eye, EyeOff, FileUp,
  Grid3X3, Layers3, Maximize2, MousePointer2, Move3D, PenTool, Rotate3D, ScanLine,
  Settings2, ShieldCheck, SlidersHorizontal, Trash2, Undo2, Upload, ZoomIn, ZoomOut,
  Ruler, Scissors,
} from 'lucide-react'
import './App.css'

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function MeshModel({ geometry, wireframe, color, opacity, marginMode, measurementMode, clippingPlane, selected, onSelect, onAddMarginPoint, onAddMeasurementPoint }) {
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color, roughness: 0.62, metalness: 0.04, wireframe, transparent: opacity < 1, opacity, emissive: selected ? '#174d49' : '#000000', emissiveIntensity: selected ? 0.45 : 0,
    side: THREE.DoubleSide, clippingPlanes: clippingPlane ? [clippingPlane] : [], clipShadows: true,
  }), [color, wireframe, opacity, selected, clippingPlane])
  useEffect(() => () => material.dispose(), [material])
  return <mesh geometry={geometry} material={material} castShadow receiveShadow onClick={event => {
    event.stopPropagation()
    if (marginMode) onAddMarginPoint(event.point.clone())
    else if (measurementMode) onAddMeasurementPoint(event.point.clone())
    else onSelect()
  }} />
}

function MarginCurve({ points, closed }) {
  const linePoints = closed && points.length > 2 ? [...points, points[0]] : points
  return <>
    {linePoints.length > 1 && <Line points={linePoints} color="#ffb36b" lineWidth={2.5} depthTest={false} />}
    {points.map((point, index) => <mesh key={index} position={point} renderOrder={10}>
      <sphereGeometry args={[0.025, 12, 12]} />
      <meshBasicMaterial color="#ffb36b" depthTest={false} />
    </mesh>)}
  </>
}

function MeasurementOverlay({ points }) {
  return <>
    {points.length === 2 && <Line points={points} color="#62d7c2" lineWidth={2.5} depthTest={false} />}
    {points.map((point, index) => <mesh key={index} position={point} renderOrder={11}>
      <sphereGeometry args={[0.035, 14, 14]} />
      <meshBasicMaterial color="#62d7c2" depthTest={false} />
    </mesh>)}
  </>
}

function ViewerScene({ geometry, wireframe, showGrid, color, opacity, controlsRef, activeTool, selected, onSelect, marginMode, marginPoints, marginClosed, onAddMarginPoint, measurementMode, measurementPoints, onAddMeasurementPoint, sectionEnabled, sectionAxis, sectionOffset, sectionSize, clippingPlane }) {
  return <>
    <color attach="background" args={['#111820']} />
    <PerspectiveCamera makeDefault position={[4.5, 3.2, 5.5]} fov={38} />
    <ambientLight intensity={1.25} />
    <directionalLight position={[5, 8, 6]} intensity={2.1} castShadow />
    <directionalLight position={[-5, 2, -4]} intensity={0.75} color="#8ab6d4" />
    {showGrid && <gridHelper args={[12, 24, '#34434d', '#25323b']} position={[0, -1.3, 0]} />}
    <axesHelper args={[1.35]} />
    {geometry && <Bounds fit clip observe margin={1.35}><Center><MeshModel geometry={geometry} wireframe={wireframe} color={color} opacity={opacity} marginMode={marginMode} measurementMode={measurementMode} clippingPlane={clippingPlane} selected={selected} onSelect={onSelect} onAddMarginPoint={onAddMarginPoint} onAddMeasurementPoint={onAddMeasurementPoint} /></Center></Bounds>}
    {sectionEnabled && <mesh position={new THREE.Vector3(sectionAxis === 'x' ? 1 : 0, sectionAxis === 'y' ? 1 : 0, sectionAxis === 'z' ? 1 : 0).multiplyScalar(sectionOffset)} rotation={sectionAxis === 'x' ? [0, Math.PI / 2, 0] : sectionAxis === 'y' ? [Math.PI / 2, 0, 0] : [0, 0, 0]}>
      <planeGeometry args={[sectionSize, sectionSize]} />
      <meshBasicMaterial color="#55c7b5" transparent opacity={0.12} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>}
    {marginPoints.length > 0 && <MarginCurve points={marginPoints} closed={marginClosed} />}
    {measurementPoints.length > 0 && <MeasurementOverlay points={measurementPoints} />}
    <OrbitControls ref={controlsRef} makeDefault enableDamping dampingFactor={0.075} minDistance={0.15} maxDistance={500} mouseButtons={{ LEFT: activeTool === 'pan' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }} />
  </>
}

function IconButton({ icon: Icon, label, active, onClick, disabled = false }) {
  return <button className={`icon-button ${active ? 'active' : ''}`} onClick={onClick} title={label} aria-label={label} disabled={disabled}><Icon size={17} strokeWidth={1.8} /></button>
}

function App() {
  const [geometry, setGeometry] = useState(null)
  const [fileInfo, setFileInfo] = useState(null)
  const [error, setError] = useState('')
  const [wireframe, setWireframe] = useState(false)
  const [showGrid, setShowGrid] = useState(true)
  const [showInspector, setShowInspector] = useState(true)
  const [color, setColor] = useState('#d9cbb4')
  const [opacity, setOpacity] = useState(1)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [marginMode, setMarginMode] = useState(false)
  const [marginPoints, setMarginPoints] = useState([])
  const [marginClosed, setMarginClosed] = useState(false)
  const [measurementMode, setMeasurementMode] = useState(false)
  const [measurementPoints, setMeasurementPoints] = useState([])
  const [sectionEnabled, setSectionEnabled] = useState(false)
  const [sectionAxis, setSectionAxis] = useState('z')
  const [sectionOffset, setSectionOffset] = useState(0)
  const [activeTool, setActiveTool] = useState('orbit')
  const [selected, setSelected] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const inputRef = useRef(null)
  const controlsRef = useRef(null)
  const geometryRef = useRef(null)
  const sectionNormal = useMemo(() => new THREE.Vector3(sectionAxis === 'x' ? 1 : 0, sectionAxis === 'y' ? 1 : 0, sectionAxis === 'z' ? 1 : 0), [sectionAxis])
  const clippingPlane = useMemo(() => sectionEnabled ? new THREE.Plane(sectionNormal.clone(), -sectionOffset) : null, [sectionEnabled, sectionNormal, sectionOffset])
  const sectionSize = fileInfo ? Math.max(...fileInfo.dimensions.map(Number)) * 1.5 : 1
  const sectionLimit = fileInfo ? Math.max(...fileInfo.dimensions.map(Number)) / 2 : 1
  const measuredDistance = measurementPoints.length === 2 ? measurementPoints[0].distanceTo(measurementPoints[1]) : null

  useEffect(() => () => geometryRef.current?.dispose(), [])
  const loadFile = useCallback(async (file) => {
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['stl', 'ply'].includes(ext)) { setError('Unsupported file. Choose an STL or PLY mesh.'); return }
    setBusy(true); setError('')
    try {
      if (!file.size) throw new Error('The selected file is empty.')
      const buffer = await file.arrayBuffer()
      if (!buffer.byteLength) throw new Error('The selected file could not be read.')
      const loader = ext === 'stl' ? new STLLoader() : new PLYLoader()
      const next = loader.parse(buffer)
      const position = next.getAttribute('position')
      if (!position || position.count < 3) { next.dispose(); throw new Error('This file does not contain enough vertices to form a 3D mesh.') }
      for (let i = 0; i < position.count; i += 1) {
        if (!Number.isFinite(position.getX(i)) || !Number.isFinite(position.getY(i)) || !Number.isFinite(position.getZ(i))) {
          next.dispose()
          throw new Error('The mesh contains invalid coordinate values and cannot be displayed.')
        }
      }
      if (!next.getAttribute('normal')) next.computeVertexNormals()
      next.computeBoundingBox()
      next.computeBoundingSphere()
      const box = next.boundingBox
      if (!box || box.isEmpty() || !Number.isFinite(box.min.x) || !Number.isFinite(box.max.x)) {
        next.dispose()
        throw new Error('The file does not contain valid 3D dimensions.')
      }
      const size = new THREE.Vector3()
      box.getSize(size)
      const vertices = position.count
      const faces = next.index ? next.index.count / 3 : Math.floor(vertices / 3)
      const analysis = analyzeMesh(next)
      if (!faces) { next.dispose(); throw new Error('No triangular faces were found in this mesh.') }
      geometryRef.current?.dispose()
      geometryRef.current = next
      setGeometry(next)
      setSelected(true)
      setMarginPoints([])
      setMarginClosed(false)
      setMarginMode(false)
      setMeasurementMode(false)
      setMeasurementPoints([])
      setSectionEnabled(false)
      setSectionOffset(0)
      setActiveTool('orbit')
      setFileInfo({ name: file.name, size: file.size, format: ext.toUpperCase(), vertices, faces, dimensions: size.toArray().map(v => v.toFixed(2)), bounds: box, analysis })
    } catch (e) {
      setError(e?.message || 'Unable to read this mesh. The file may be damaged or use an unsupported encoding.')
    } finally { setBusy(false) }
  }, [])

  const fitModel = () => {
    const controls = controlsRef.current
    if (!controls) return
    const radius = Math.max(geometryRef.current?.boundingSphere?.radius || 1, 0.01)
    const camera = controls.object
    const direction = camera.position.clone().sub(controls.target)
    if (direction.lengthSq() < 0.0001) direction.set(1, 0.7, 1)
    direction.normalize()
    controls.target.set(0, 0, 0)
    camera.up.set(0, 1, 0)
    camera.position.copy(direction.multiplyScalar(Math.max(radius * 2.8, 0.5)))
    camera.lookAt(controls.target)
    camera.near = Math.max(radius / 1000, 0.001)
    camera.far = Math.max(radius * 100, 100)
    camera.updateProjectionMatrix()
    controls.update()
  }
  const setView = (view) => {
    const controls = controlsRef.current
    if (!controls) return
    const radius = Math.max(geometryRef.current?.boundingSphere?.radius || 1, 0.01)
    const distance = Math.max(radius * 2.8, 0.5)
    const views = {
      top: [0, 1, 0], bottom: [0, -1, 0], front: [0, 0, 1], back: [0, 0, -1],
      left: [-1, 0, 0], right: [1, 0, 0],
    }
    const direction = new THREE.Vector3(...views[view])
    const camera = controls.object
    camera.up.set(0, 1, 0)
    if (view === 'top') camera.up.set(0, 0, -1)
    if (view === 'bottom') camera.up.set(0, 0, 1)
    controls.target.set(0, 0, 0)
    camera.position.copy(direction.multiplyScalar(distance))
    camera.lookAt(controls.target)
    camera.updateProjectionMatrix()
    controls.update()
  }
  const clearModel = () => {
    geometryRef.current?.dispose()
    geometryRef.current = null
    setGeometry(null)
    setFileInfo(null)
    setSelected(false)
    setMarginPoints([])
    setMarginClosed(false)
    setMarginMode(false)
    setMeasurementMode(false)
    setMeasurementPoints([])
    setSectionEnabled(false)
    setSectionOffset(0)
    setError('')
  }
  const resetDisplaySettings = () => {
    setColor('#d9cbb4')
    setOpacity(1)
    setWireframe(false)
    setShowGrid(true)
  }
  const addMeasurementPoint = useCallback((point) => {
    setMeasurementPoints(points => points.length === 1 ? [...points, point.clone()] : [point.clone()])
  }, [])
  const addMarginPoint = useCallback((point) => {
    if (marginClosed) return
    setMarginPoints(points => [...points, point.clone()])
  }, [marginClosed])
  const undoMarginPoint = () => {
    setMarginPoints(points => points.slice(0, -1))
    setMarginClosed(false)
  }
  const clearMargin = () => {
    setMarginPoints([])
    setMarginClosed(false)
  }
  const clearMeasurement = () => setMeasurementPoints([])
  const exportMargin = () => {
    if (!marginPoints.length) return
    const rows = ['point,x,y,z', ...marginPoints.map((point, index) => `${index + 1},${point.x.toFixed(4)},${point.y.toFixed(4)},${point.z.toFixed(4)}`)]
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${(fileInfo?.name || 'dental-mesh').replace(/\.[^.]+$/, '')}-margin.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }
  const handleDrop = (e) => {
    e.preventDefault(); setDragging(false); loadFile(e.dataTransfer.files?.[0])
  }

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><Activity size={19} /></div><span>dent<span className="brand-accent">al</span>CAD</span><span className="brand-divider" /><span className="workspace-label">STUDIO</span></div>
      <div className="topbar-center"><span className="status-dot" /> LOCAL WORKSPACE <span className="topbar-sep">/</span> {fileInfo ? fileInfo.name : 'UNTITLED CASE'}</div>
      <div className="topbar-actions"><button className="subtle-button" onClick={() => setShowInspector(v => !v)}><SlidersHorizontal size={15} /> Inspector</button><button className="help-button" title="Help" aria-label="Help" onClick={() => setHelpOpen(true)}><CircleHelp size={18} /></button><div className="avatar">D</div></div>
    </header>

    <div className="subbar"><div className="breadcrumb"><span>Workspace</span><span className="crumb-slash">/</span><strong>3D Viewer</strong></div><div className="subbar-right"><span className="local-badge"><ShieldCheck size={13} /> FILES STAY ON THIS DEVICE</span><span className="version">PREVIEW 0.1</span></div></div>

    <main className="workspace">
      <aside className="tool-rail">
        <div className="rail-group"><span className="rail-caption">TOOLS</span><IconButton icon={MousePointer2} label="Select mesh" active={activeTool === 'select'} onClick={() => setActiveTool('select')} disabled={!geometry} /><IconButton icon={Rotate3D} label="Orbit view" active={activeTool === 'orbit'} onClick={() => setActiveTool('orbit')} /><IconButton icon={Move3D} label="Pan view" active={activeTool === 'pan'} onClick={() => setActiveTool('pan')} /><IconButton icon={Crosshair} label="Fit model" onClick={fitModel} disabled={!geometry} /></div>
        <div className="rail-bottom"><IconButton icon={Settings2} label="Reset display settings" onClick={resetDisplaySettings} /><span className="rail-help" title="Help" onClick={() => setHelpOpen(true)}>?</span></div>
      </aside>

      <section className="viewport-column">
        <div className="viewport-toolbar">
          <div className="view-tabs"><button className="view-tab selected" type="button"><Box size={14} /> 3D VIEW</button><button className={`view-tab ${wireframe ? 'selected' : ''}`} type="button" onClick={() => setWireframe(value => !value)}>MESH</button></div>
          <div className="viewport-controls"><button className="tool-action-button import-toolbar-button" onClick={() => inputRef.current?.click()}><Upload size={14} /> Import</button><button className={`tool-action-button ${marginMode ? 'active' : ''}`} onClick={() => { setMarginMode(value => !value); setMeasurementMode(false) }} disabled={!geometry} title="Click points on the mesh to trace its margin"><PenTool size={14} /> {marginMode ? 'Finish tracing' : 'Trace margin'}</button><button className={`tool-action-button ${measurementMode ? 'active' : ''}`} onClick={() => { setMeasurementMode(value => !value); setMarginMode(false) }} disabled={!geometry} title="Pick two points to measure their 3D distance"><Ruler size={14} /> Measure</button><span className="toolbar-label">DISPLAY</span><IconButton icon={Grid3X3} label="Toggle grid" active={showGrid} onClick={() => setShowGrid(v => !v)} /><IconButton icon={wireframe ? Eye : Layers3} label="Toggle wireframe" active={wireframe} onClick={() => setWireframe(v => !v)} /><span className="toolbar-divider" /><IconButton icon={Maximize2} label="Fit model" onClick={fitModel} disabled={!geometry} /><IconButton icon={EyeOff} label="Toggle inspector" active={showInspector} onClick={() => setShowInspector(v => !v)} /></div>
        </div>
        <div className={`viewport ${dragging ? 'dragging' : ''}`} onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={handleDrop}>
          <Canvas shadows dpr={[1, 2]} gl={{ antialias: true, alpha: false, localClippingEnabled: true }} onPointerMissed={() => setSelected(false)}><ViewerScene geometry={geometry} wireframe={wireframe} showGrid={showGrid} color={color} opacity={opacity} controlsRef={controlsRef} activeTool={activeTool} selected={selected} onSelect={() => setSelected(true)} marginMode={marginMode} marginPoints={marginPoints} marginClosed={marginClosed} onAddMarginPoint={addMarginPoint} measurementMode={measurementMode} measurementPoints={measurementPoints} onAddMeasurementPoint={addMeasurementPoint} sectionEnabled={sectionEnabled} sectionAxis={sectionAxis} sectionOffset={sectionOffset} sectionSize={sectionSize} clippingPlane={clippingPlane} /></Canvas>
          {!geometry && <div className="empty-state"><div className="empty-icon"><ScanLine size={28} strokeWidth={1.35} /></div><div className="empty-eyebrow">3D MODEL VIEWPORT</div><h1>Your workspace is ready.</h1><p>Import a dental scan or mesh to begin inspecting your model in 3D.</p><button className="primary-button" onClick={() => inputRef.current?.click()}><Upload size={16} /> Import 3D file</button><div className="file-types"><span>STL</span><span>PLY</span><i /> Up to your browser's available memory</div></div>}
          {dragging && <div className="drop-overlay"><div><FileUp size={30} /><strong>Drop your mesh here</strong><span>STL or PLY files</span></div></div>}
          {geometry && <div className="model-chip"><span className="status-dot" /> {selected ? 'OBJECT SELECTED' : 'MODEL LOADED'} <span>/</span> {fileInfo?.format}</div>}
          {marginMode && <div className="margin-mode-hint">MARGIN TRACE ACTIVE · CLICK THE MESH TO ADD POINTS</div>}
          {measurementMode && <div className="margin-mode-hint measurement-mode-hint">MEASURE ACTIVE · SELECT TWO POINTS ON THE MESH</div>}
          {error && <div className="error-toast">{error}<button onClick={() => setError('')}>×</button></div>}
          {busy && <div className="loading-cover"><div className="loader" /> Parsing mesh…</div>}
          <div className="viewport-hint"><span><MousePointer2 size={12} /> DRAG TO ORBIT</span><span>SCROLL TO ZOOM</span><span>RIGHT-DRAG TO PAN</span></div>
          <div className="view-cube" aria-label="Standard views"><button type="button" onClick={() => setView('top')} title="Top view">TOP</button><button type="button" onClick={() => setView('front')} title="Front view">FRONT</button><button type="button" onClick={() => setView('right')} title="Right view">RIGHT</button><button type="button" onClick={() => setView('left')} title="Left view">LEFT</button><button type="button" onClick={() => setView('back')} title="Back view">BACK</button><button type="button" onClick={() => setView('bottom')} title="Bottom view">BOTTOM</button></div>
          <div className="zoom-controls"><IconButton icon={ZoomIn} label="Zoom in" onClick={() => controlsRef.current?.dollyIn(1.2)} /><IconButton icon={ZoomOut} label="Zoom out" onClick={() => controlsRef.current?.dollyOut(1.2)} /><div className="zoom-divider" /><IconButton icon={Maximize2} label="Reset camera" onClick={fitModel} /></div>
        </div>
        <div className="timeline-bar"><div className="timeline-left"><span className="timeline-indicator" /> {geometry ? 'Mesh ready for inspection' : 'No active model'} <span className="timeline-sep">·</span> {geometry ? `${fileInfo.vertices.toLocaleString()} vertices` : 'Waiting for import'}</div><div className="timeline-right"><span>WORLD UNITS</span><strong>mm*</strong><span className="unit-note">*Source file units</span></div></div>
      </section>

      {showInspector && <aside className="inspector">
        <div className="panel-heading"><div><span className="panel-kicker">SCENE</span><h2>Inspector</h2></div><button className="panel-menu"><SlidersHorizontal size={16} /></button></div>
        <div className="panel-section"><div className="section-title"><span>OBJECTS</span><span className="section-count">{geometry ? '01' : '00'}</span></div>{geometry ? <div className={`object-row ${selected ? 'selected' : ''}`} onClick={() => setSelected(true)}><Box size={16} /><span>{fileInfo.name}</span><span className="object-type">{fileInfo.format}</span><button className="object-remove" type="button" title="Remove model" aria-label="Remove model" onClick={event => { event.stopPropagation(); clearModel() }}><Trash2 size={14} /></button></div> : <div className="empty-object"><Layers3 size={17} /><span>No objects in scene</span></div>}</div>
        <div className="panel-section"><div className="section-title">TRANSFORM</div><div className="transform-grid">{['Position','Rotation','Scale'].map((label, i) => <div className="transform-row" key={label}><span>{label}</span><div>{['X','Y','Z'].map((axis, j) => <label key={axis}><i>{axis}</i><input value={geometry && i === 2 ? '1.00' : '0.00'} readOnly /></label>)}</div></div>)}</div></div>
        <div className="panel-section"><div className="section-title">APPEARANCE</div><div className="appearance-row"><span>Surface color</span><label className="color-picker"><input type="color" value={color} onChange={e => setColor(e.target.value)} /><span>{color.toUpperCase()}</span></label></div><div className="appearance-row opacity-row"><span>Opacity</span><strong>{Math.round(opacity * 100)}%</strong></div><input className="opacity-slider" type="range" min="0.15" max="1" step="0.05" value={opacity} onChange={e => setOpacity(Number(e.target.value))} /></div>
        <div className="panel-section"><div className="section-title">MESH INFORMATION <span className="info-tag">READ ONLY</span></div>{fileInfo ? <div className="stats-grid"><div className="stat-card"><span>VERTICES</span><strong>{fileInfo.vertices.toLocaleString()}</strong></div><div className="stat-card"><span>FACES</span><strong>{Math.round(fileInfo.faces).toLocaleString()}</strong></div><div className="stat-card wide"><span>DIMENSIONS (X × Y × Z)</span><strong>{fileInfo.dimensions.map(v => `${v} source units`).join(' × ')}</strong></div><div className="stat-card wide"><span>FILE SIZE</span><strong>{formatSize(fileInfo.size)}</strong></div></div> : <div className="stats-placeholder">Mesh statistics will appear here after import.</div>}<p className="footnote">Dimensions use source-file units; they are not converted to millimetres.</p></div>
        <div className="panel-section"><div className="section-title">MESH QUALITY <span className="info-tag">ESTIMATED</span></div>{fileInfo ? <div className="quality-list"><div><span>Surface area</span><strong>{fileInfo.analysis.surfaceArea.toFixed(3)} units²</strong></div><div><span>Enclosed volume</span><strong>{fileInfo.analysis.volume === null ? 'Unavailable' : `${fileInfo.analysis.volume.toFixed(3)} units³`}</strong></div><div><span>Boundary edges</span><strong>{fileInfo.analysis.boundaryEdges.toLocaleString()}</strong></div><div><span>Non-manifold edges</span><strong>{fileInfo.analysis.nonManifoldEdges.toLocaleString()}</strong></div><div><span>Degenerate faces</span><strong>{fileInfo.analysis.degenerateFaces.toLocaleString()}</strong></div><div><span>Watertight check</span><strong className={fileInfo.analysis.watertight ? 'quality-good' : 'quality-warn'}>{fileInfo.analysis.watertight ? 'Closed edge test passed' : 'Open / non-manifold'}</strong></div></div> : <div className="stats-placeholder">Quality checks will appear after importing a mesh.</div>}<p className="footnote">Topology checks are geometric estimates, not a clinical or manufacturing certification.</p></div>
        <div className="panel-section"><div className="section-title">CROSS SECTION <span className="info-tag">LIVE SLICE</span></div><button className={`mini-action ${sectionEnabled ? 'primary' : ''}`} onClick={() => setSectionEnabled(value => !value)} disabled={!geometry}><Scissors size={13} /> {sectionEnabled ? 'Disable section' : 'Enable section'}</button><div className="section-controls"><select value={sectionAxis} onChange={event => setSectionAxis(event.target.value)} disabled={!geometry}><option value="x">X axis</option><option value="y">Y axis</option><option value="z">Z axis</option></select><input type="range" min={-sectionLimit} max={sectionLimit} step={Math.max(sectionLimit / 200, 0.001)} value={Math.max(-sectionLimit, Math.min(sectionLimit, sectionOffset))} onChange={event => setSectionOffset(Number(event.target.value))} disabled={!geometry || !sectionEnabled} /><span>{sectionOffset.toFixed(2)} source units</span></div><p className="footnote">Moves a live clipping plane through the mesh. This view does not generate a capped solid.</p></div>
        <div className="panel-section"><div className="section-title">MEASUREMENTS <span className="info-tag">3D</span></div><div className="margin-tool-card measurement-card"><div className="margin-tool-heading"><Ruler size={15} /><strong>Point-to-point</strong><span>{measurementPoints.length}/2 pts</span></div><p>{measuredDistance === null ? 'Activate Measure, then select two points on the mesh.' : `Distance: ${measuredDistance.toFixed(3)} source units`}</p><div className="margin-actions"><button className={`mini-action ${measurementMode ? 'primary' : ''}`} onClick={() => { setMeasurementMode(value => !value); setMarginMode(false) }} disabled={!geometry}>{measurementMode ? 'Stop measuring' : 'Measure'}</button><button className="mini-action" onClick={clearMeasurement} disabled={!measurementPoints.length}><Trash2 size={13} /> Clear</button></div></div></div>
        <div className="panel-section"><div className="section-title">DENTAL TOOLS <span className="info-tag">MANUAL</span></div><div className="margin-tool-card"><div className="margin-tool-heading"><PenTool size={15} /><strong>Margin curve</strong><span>{marginPoints.length} pts</span></div><p>{marginClosed ? 'Curve closed. Export the selected 3D points as CSV.' : marginMode ? 'Click along the tooth preparation margin in the viewport.' : 'Enable tracing, then select points directly on the mesh.'}</p><div className="margin-actions"><button className="mini-action primary" onClick={() => setMarginMode(value => !value)} disabled={!geometry}>{marginMode ? 'Stop' : 'Trace'}</button><button className="mini-action" onClick={undoMarginPoint} disabled={!marginPoints.length}><Undo2 size={13} /> Undo</button><button className="mini-action" onClick={clearMargin} disabled={!marginPoints.length}><Trash2 size={13} /> Clear</button></div><div className="margin-actions margin-export-row"><button className="mini-action" onClick={() => { setMarginClosed(true); setMarginMode(false) }} disabled={marginPoints.length < 3 || marginClosed}><Check size={13} /> Close curve</button><button className="mini-action" onClick={exportMargin} disabled={!marginPoints.length}><Download size={13} /> CSV</button></div></div></div>
        <div className="panel-footer"><div className="privacy-icon"><ShieldCheck size={15} /></div><div><strong>Private by design</strong><span>Your mesh is processed locally in this browser.</span></div></div>
      </aside>}
    </main>
    <input ref={inputRef} type="file" accept=".stl,.ply,model/stl,application/octet-stream" hidden onChange={e => { loadFile(e.target.files?.[0]); e.target.value = '' }} />
    {helpOpen && <div className="help-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setHelpOpen(false) }}><section className="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title"><div className="help-dialog-heading"><div><span className="panel-kicker">DENTALCAD STUDIO</span><h2 id="help-title">Viewer controls</h2></div><button type="button" className="help-close" onClick={() => setHelpOpen(false)} aria-label="Close help">×</button></div><div className="help-grid"><div><strong>Measure</strong><span>Choose Measure, then click two points on the mesh to read their 3D distance.</span></div><div><strong>Cross section</strong><span>Enable a clipping plane and move it along the selected axis in the inspector.</span></div><div><strong>Orbit</strong><span>Left-drag or choose Orbit in the tool rail.</span></div><div><strong>Pan</strong><span>Right-drag, or choose Pan then left-drag.</span></div><div><strong>Zoom</strong><span>Scroll or use the + / − controls.</span></div><div><strong>Standard views</strong><span>Use the view buttons at the top-right of the viewport.</span></div><div><strong>Select</strong><span>Choose Select, then click the loaded mesh.</span></div><div><strong>Import</strong><span>Choose Import or drop an STL / PLY file into the viewport.</span></div></div><p className="help-note">Mesh files are parsed locally in your browser. Very large scans depend on available device memory.</p><button className="primary-button help-done" type="button" onClick={() => setHelpOpen(false)}>Got it</button></section></div>}
    <footer className="statusbar"><div><span className="status-green" /> SYSTEM READY <span className="status-divider">|</span> WEBGL</div><div><span>{activeTool.toUpperCase()} TOOL</span><span className="status-divider">|</span><span>MM DISPLAY</span><span className="status-divider">|</span><span>LOCAL SESSION</span></div></footer>
  </div>
}

export default App
