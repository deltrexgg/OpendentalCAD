import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Bounds, Center, Line, OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js'
import * as THREE from 'three'
import {
  Activity, Box, CircleHelp, Check, Crosshair, Download, Eye, EyeOff, FileUp,
  Grid3X3, Layers3, Maximize2, MousePointer2, Move3D, PenTool, Rotate3D, ScanLine,
  Settings2, ShieldCheck, SlidersHorizontal, Trash2, Undo2, Upload, ZoomIn, ZoomOut,
} from 'lucide-react'
import './App.css'

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function MeshModel({ geometry, wireframe, color, opacity, marginMode, onAddMarginPoint }) {
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color, roughness: 0.62, metalness: 0.04, wireframe, transparent: opacity < 1, opacity,
    side: THREE.DoubleSide,
  }), [color, wireframe, opacity])
  useEffect(() => () => material.dispose(), [material])
  return <mesh geometry={geometry} material={material} castShadow receiveShadow onClick={event => {
    if (!marginMode) return
    event.stopPropagation()
    onAddMarginPoint(event.point.clone())
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

function ViewerScene({ geometry, wireframe, showGrid, color, opacity, controlsRef, marginMode, marginPoints, marginClosed, onAddMarginPoint }) {
  return <>
    <color attach="background" args={['#111820']} />
    <PerspectiveCamera makeDefault position={[4.5, 3.2, 5.5]} fov={38} />
    <ambientLight intensity={1.25} />
    <directionalLight position={[5, 8, 6]} intensity={2.1} castShadow />
    <directionalLight position={[-5, 2, -4]} intensity={0.75} color="#8ab6d4" />
    {showGrid && <gridHelper args={[12, 24, '#34434d', '#25323b']} position={[0, -1.3, 0]} />}
    <axesHelper args={[1.35]} />
    {geometry && <Bounds fit clip observe margin={1.35}><Center><MeshModel geometry={geometry} wireframe={wireframe} color={color} opacity={opacity} marginMode={marginMode} onAddMarginPoint={onAddMarginPoint} /></Center></Bounds>}
    {marginPoints.length > 0 && <MarginCurve points={marginPoints} closed={marginClosed} />}
    <OrbitControls ref={controlsRef} makeDefault enableDamping dampingFactor={0.075} minDistance={0.15} maxDistance={500} />
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
  const inputRef = useRef(null)
  const controlsRef = useRef(null)
  const geometryRef = useRef(null)

  useEffect(() => () => geometryRef.current?.dispose(), [])
  const loadFile = useCallback(async (file) => {
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['stl', 'ply'].includes(ext)) { setError('Unsupported file. Choose an STL or PLY mesh.'); return }
    setBusy(true); setError('')
    try {
      const buffer = await file.arrayBuffer()
      const loader = ext === 'stl' ? new STLLoader() : new PLYLoader()
      const next = loader.parse(buffer)
      if (!next.getAttribute('position')?.count) throw new Error('This file does not contain any vertices.')
      if (!next.getAttribute('normal')) next.computeVertexNormals()
      next.computeBoundingBox()
      next.computeBoundingSphere()
      const box = next.boundingBox
      const size = new THREE.Vector3()
      box.getSize(size)
      const vertices = next.getAttribute('position').count
      const faces = next.index ? next.index.count / 3 : Math.floor(vertices / 3)
      geometryRef.current?.dispose()
      geometryRef.current = next
      setGeometry(next)
      setMarginPoints([])
      setMarginClosed(false)
      setMarginMode(false)
      setFileInfo({ name: file.name, size: file.size, format: ext.toUpperCase(), vertices, faces, dimensions: size.toArray().map(v => v.toFixed(2)), bounds: box })
    } catch (e) {
      setError(e?.message || 'Unable to read this mesh. Please check the file and try again.')
    } finally { setBusy(false) }
  }, [])

  const resetView = () => {
    if (!controlsRef.current) return
    controlsRef.current.reset()
  }
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
      <div className="topbar-actions"><button className="subtle-button" onClick={() => setShowInspector(v => !v)}><SlidersHorizontal size={15} /> Inspector</button><button className="help-button" title="Help"><CircleHelp size={18} /></button><div className="avatar">D</div></div>
    </header>

    <div className="subbar"><div className="breadcrumb"><span>Workspace</span><span className="crumb-slash">/</span><strong>3D Viewer</strong></div><div className="subbar-right"><span className="local-badge"><ShieldCheck size={13} /> FILES STAY ON THIS DEVICE</span><span className="version">PREVIEW 0.1</span></div></div>

    <main className="workspace">
      <aside className="tool-rail">
        <div className="rail-group"><span className="rail-caption">TOOLS</span><IconButton icon={MousePointer2} label="Select" active /><IconButton icon={Rotate3D} label="Orbit view" active={false} onClick={resetView} /><IconButton icon={Move3D} label="Pan view" onClick={() => controlsRef.current && (controlsRef.current.mouseButtons.LEFT = THREE.MOUSE.PAN)} /><IconButton icon={Crosshair} label="Fit model" onClick={resetView} /></div>
        <div className="rail-bottom"><IconButton icon={Settings2} label="Settings" /><span className="rail-help">?</span></div>
      </aside>

      <section className="viewport-column">
        <div className="viewport-toolbar">
          <div className="view-tabs"><span className="view-tab selected"><Box size={14} /> 3D VIEW</span><span className="view-tab">MESH</span></div>
          <div className="viewport-controls"><button className={`tool-action-button ${marginMode ? 'active' : ''}`} onClick={() => setMarginMode(value => !value)} disabled={!geometry} title="Click points on the tooth mesh to trace its margin"><PenTool size={14} /> {marginMode ? 'Finish tracing' : 'Trace margin'}</button><span className="toolbar-label">DISPLAY</span><IconButton icon={Grid3X3} label="Toggle grid" active={showGrid} onClick={() => setShowGrid(v => !v)} /><IconButton icon={wireframe ? Eye : Layers3} label="Toggle wireframe" active={wireframe} onClick={() => setWireframe(v => !v)} /><span className="toolbar-divider" /><IconButton icon={Maximize2} label="Fit model" onClick={resetView} /><IconButton icon={EyeOff} label="Toggle inspector" active={showInspector} onClick={() => setShowInspector(v => !v)} /></div>
        </div>
        <div className={`viewport ${dragging ? 'dragging' : ''}`} onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={handleDrop}>
          <Canvas shadows dpr={[1, 2]} gl={{ antialias: true, alpha: false }}><ViewerScene geometry={geometry} wireframe={wireframe} showGrid={showGrid} color={color} opacity={opacity} controlsRef={controlsRef} marginMode={marginMode} marginPoints={marginPoints} marginClosed={marginClosed} onAddMarginPoint={addMarginPoint} /></Canvas>
          {!geometry && <div className="empty-state"><div className="empty-icon"><ScanLine size={28} strokeWidth={1.35} /></div><div className="empty-eyebrow">3D MODEL VIEWPORT</div><h1>Your workspace is ready.</h1><p>Import a dental scan or mesh to begin inspecting your model in 3D.</p><button className="primary-button" onClick={() => inputRef.current?.click()}><Upload size={16} /> Import 3D file</button><div className="file-types"><span>STL</span><span>PLY</span><i /> Up to your browser's available memory</div></div>}
          {dragging && <div className="drop-overlay"><div><FileUp size={30} /><strong>Drop your mesh here</strong><span>STL or PLY files</span></div></div>}
          {geometry && <div className="model-chip"><span className="status-dot" /> MODEL LOADED <span>/</span> {fileInfo?.format}</div>}
          {marginMode && <div className="margin-mode-hint">MARGIN TRACE ACTIVE · CLICK THE MESH TO ADD POINTS</div>}
          {error && <div className="error-toast">{error}<button onClick={() => setError('')}>×</button></div>}
          {busy && <div className="loading-cover"><div className="loader" /> Parsing mesh…</div>}
          <div className="viewport-hint"><span><MousePointer2 size={12} /> DRAG TO ORBIT</span><span>SCROLL TO ZOOM</span><span>RIGHT-DRAG TO PAN</span></div>
          <div className="view-cube"><div className="cube-face">TOP</div><span>Y</span><i /></div>
          <div className="zoom-controls"><IconButton icon={ZoomIn} label="Zoom in" onClick={() => controlsRef.current?.dollyIn(1.2)} /><IconButton icon={ZoomOut} label="Zoom out" onClick={() => controlsRef.current?.dollyOut(1.2)} /><div className="zoom-divider" /><IconButton icon={Maximize2} label="Reset camera" onClick={resetView} /></div>
        </div>
        <div className="timeline-bar"><div className="timeline-left"><span className="timeline-indicator" /> {geometry ? 'Mesh ready for inspection' : 'No active model'} <span className="timeline-sep">·</span> {geometry ? `${fileInfo.vertices.toLocaleString()} vertices` : 'Waiting for import'}</div><div className="timeline-right"><span>WORLD UNITS</span><strong>mm*</strong><span className="unit-note">*Source file units</span></div></div>
      </section>

      {showInspector && <aside className="inspector">
        <div className="panel-heading"><div><span className="panel-kicker">SCENE</span><h2>Inspector</h2></div><button className="panel-menu"><SlidersHorizontal size={16} /></button></div>
        <div className="panel-section"><div className="section-title"><span>OBJECTS</span><span className="section-count">{geometry ? '01' : '00'}</span></div>{geometry ? <div className="object-row"><Box size={16} /><span>{fileInfo.name}</span><span className="object-type">{fileInfo.format}</span></div> : <div className="empty-object"><Layers3 size={17} /><span>No objects in scene</span></div>}</div>
        <div className="panel-section"><div className="section-title">TRANSFORM</div><div className="transform-grid">{['Position','Rotation','Scale'].map((label, i) => <div className="transform-row" key={label}><span>{label}</span><div>{['X','Y','Z'].map((axis, j) => <label key={axis}><i>{axis}</i><input value={geometry && i === 2 ? '1.00' : '0.00'} readOnly /></label>)}</div></div>)}</div></div>
        <div className="panel-section"><div className="section-title">APPEARANCE</div><div className="appearance-row"><span>Surface color</span><label className="color-picker"><input type="color" value={color} onChange={e => setColor(e.target.value)} /><span>{color.toUpperCase()}</span></label></div><div className="appearance-row opacity-row"><span>Opacity</span><strong>{Math.round(opacity * 100)}%</strong></div><input className="opacity-slider" type="range" min="0.15" max="1" step="0.05" value={opacity} onChange={e => setOpacity(Number(e.target.value))} /></div>
        <div className="panel-section"><div className="section-title">MESH INFORMATION <span className="info-tag">READ ONLY</span></div>{fileInfo ? <div className="stats-grid"><div className="stat-card"><span>VERTICES</span><strong>{fileInfo.vertices.toLocaleString()}</strong></div><div className="stat-card"><span>FACES*</span><strong>{Math.round(fileInfo.faces).toLocaleString()}</strong></div><div className="stat-card wide"><span>DIMENSIONS (X × Y × Z)</span><strong>{fileInfo.dimensions.map(v => `${v} mm`).join(' × ')}</strong></div><div className="stat-card wide"><span>FILE SIZE</span><strong>{formatSize(fileInfo.size)}</strong></div></div> : <div className="stats-placeholder">Mesh statistics will appear here after import.</div>}<p className="footnote">*Face count is estimated for non-indexed geometry. Units depend on source file.</p></div>
        <div className="panel-section"><div className="section-title">DENTAL TOOLS <span className="info-tag">MANUAL</span></div><div className="margin-tool-card"><div className="margin-tool-heading"><PenTool size={15} /><strong>Margin curve</strong><span>{marginPoints.length} pts</span></div><p>{marginClosed ? 'Curve closed. Export the selected 3D points as CSV.' : marginMode ? 'Click along the tooth preparation margin in the viewport.' : 'Enable tracing, then select points directly on the mesh.'}</p><div className="margin-actions"><button className="mini-action primary" onClick={() => setMarginMode(value => !value)} disabled={!geometry}>{marginMode ? 'Stop' : 'Trace'}</button><button className="mini-action" onClick={undoMarginPoint} disabled={!marginPoints.length}><Undo2 size={13} /> Undo</button><button className="mini-action" onClick={clearMargin} disabled={!marginPoints.length}><Trash2 size={13} /> Clear</button></div><div className="margin-actions margin-export-row"><button className="mini-action" onClick={() => { setMarginClosed(true); setMarginMode(false) }} disabled={marginPoints.length < 3 || marginClosed}><Check size={13} /> Close curve</button><button className="mini-action" onClick={exportMargin} disabled={!marginPoints.length}><Download size={13} /> CSV</button></div></div></div>
        <div className="panel-footer"><div className="privacy-icon"><ShieldCheck size={15} /></div><div><strong>Private by design</strong><span>Your mesh is processed locally in this browser.</span></div></div>
      </aside>}
    </main>
    <input ref={inputRef} type="file" accept=".stl,.ply,model/stl,application/octet-stream" hidden onChange={e => { loadFile(e.target.files?.[0]); e.target.value = '' }} />
    <footer className="statusbar"><div><span className="status-green" /> SYSTEM READY <span className="status-divider">|</span> WEBGL</div><div><span>ORBIT CONTROLS</span><span className="status-divider">|</span><span>MM DISPLAY</span><span className="status-divider">|</span><span>LOCAL SESSION</span></div></footer>
  </div>
}

export default App
