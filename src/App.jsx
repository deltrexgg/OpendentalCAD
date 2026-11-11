import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Bounds, Center, Line, OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { generateCrownGeometry, generateDieGeometry } from './restoration.js'
import * as THREE from 'three'
import { analyzeMesh } from './meshAnalysis.js'
import { suggestMarginRefinement } from './marginDetection.js'
import { createSculptableGeometry, sculptCrownGeometry } from './crownSculpt.js'
import { analyzeOcclusionClearance, clearOcclusionColors } from './occlusionAnalysis.js'
import { analyzeManufacturingMesh } from './manufacturingAnalysis.js'
import { applyAnatomicalForm } from './crownAnatomy.js'
import { analyzeRestorationFit } from './fitAnalysis.js'
import {
  Activity, Box, CircleHelp, Check, Crosshair, Download, Eye, EyeOff, FileUp,
  Grid3X3, Layers3, Maximize2, MousePointer2, Move3D, PenTool, Rotate3D, ScanLine,
  Settings2, ShieldCheck, SlidersHorizontal, Trash2, Undo2, Upload, ZoomIn, ZoomOut,
  Ruler, Scissors, WandSparkles, Brush,
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

function SuggestedMarginOverlay({ points, closed }) {
  const linePoints = closed && points.length > 2 ? [...points, points[0]] : points
  return <>
    {linePoints.length > 1 && <Line points={linePoints} color="#64d9c6" lineWidth={2} depthTest={false} dashed />}
    {points.map((point, index) => <mesh key={index} position={point} renderOrder={12}>
      <sphereGeometry args={[0.032, 12, 12]} />
      <meshBasicMaterial color="#64d9c6" depthTest={false} />
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

function ViewerScene({ geometry, dieGeometry, crownGeometry, opposingGeometry, opposingOffset, clearanceActive, showDie, showCrown, wireframe, showGrid, color, opacity, controlsRef, activeTool, selected, onSelect, marginMode, marginPoints, marginClosed, suggestedMarginPoints, onAddMarginPoint, measurementMode, measurementPoints, onAddMeasurementPoint, sectionEnabled, sectionAxis, sectionOffset, sectionSize, clippingPlane, sculptMode, onSculptStart, onSculpt, onSculptEnd }) {
  return <>
    <color attach="background" args={['#111820']} />
    <PerspectiveCamera makeDefault position={[4.5, 3.2, 5.5]} fov={38} />
    <ambientLight intensity={1.25} />
    <directionalLight position={[5, 8, 6]} intensity={2.1} castShadow />
    <directionalLight position={[-5, 2, -4]} intensity={0.75} color="#8ab6d4" />
    {showGrid && <gridHelper args={[12, 24, '#34434d', '#25323b']} position={[0, -1.3, 0]} />}
    <axesHelper args={[1.35]} />
    {geometry && <Bounds fit clip observe margin={1.35}><Center><MeshModel geometry={geometry} wireframe={wireframe} color={color} opacity={opacity} marginMode={marginMode} measurementMode={measurementMode} clippingPlane={clippingPlane} selected={selected} onSelect={onSelect} onAddMarginPoint={onAddMarginPoint} onAddMeasurementPoint={onAddMeasurementPoint} /></Center></Bounds>}
    {opposingGeometry && <mesh geometry={opposingGeometry} position={opposingOffset} renderOrder={1} raycast={() => null}><meshStandardMaterial color="#76a9d8" transparent opacity={0.28} depthWrite={false} side={THREE.DoubleSide} /></mesh>}
    {showDie && dieGeometry && <mesh geometry={dieGeometry} renderOrder={2}><meshStandardMaterial color="#65a9a0" roughness={0.72} side={THREE.DoubleSide} /></mesh>}
    {showCrown && crownGeometry && <mesh geometry={crownGeometry} renderOrder={3} onPointerDown={sculptMode ? event => { event.stopPropagation(); event.target.setPointerCapture?.(event.pointerId); onSculptStart(); const normal = event.face?.normal?.clone().transformDirection(event.object.matrixWorld) || new THREE.Vector3(0, 1, 0); onSculpt(event.point.clone(), normal) } : undefined} onPointerMove={sculptMode ? event => { if (event.buttons !== 1) return; event.stopPropagation(); const normal = event.face?.normal?.clone().transformDirection(event.object.matrixWorld) || new THREE.Vector3(0, 1, 0); onSculpt(event.point.clone(), normal) } : undefined} onPointerUp={sculptMode ? event => { event.stopPropagation(); event.target.releasePointerCapture?.(event.pointerId); onSculptEnd() } : undefined} onPointerCancel={sculptMode ? onSculptEnd : undefined}><meshStandardMaterial color="#e5c58f" metalness={0.08} roughness={0.3} side={THREE.DoubleSide} vertexColors={clearanceActive} /></mesh>}
    {sectionEnabled && <mesh position={new THREE.Vector3(sectionAxis === 'x' ? 1 : 0, sectionAxis === 'y' ? 1 : 0, sectionAxis === 'z' ? 1 : 0).multiplyScalar(sectionOffset)} rotation={sectionAxis === 'x' ? [0, Math.PI / 2, 0] : sectionAxis === 'y' ? [Math.PI / 2, 0, 0] : [0, 0, 0]}>
      <planeGeometry args={[sectionSize, sectionSize]} />
      <meshBasicMaterial color="#55c7b5" transparent opacity={0.12} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>}
    {marginPoints.length > 0 && <MarginCurve points={marginPoints} closed={marginClosed} />}
    {suggestedMarginPoints.length > 0 && <SuggestedMarginOverlay points={suggestedMarginPoints} closed={marginClosed} />}
    {measurementPoints.length > 0 && <MeasurementOverlay points={measurementPoints} />}
    <OrbitControls ref={controlsRef} makeDefault enabled={!sculptMode} enableDamping dampingFactor={0.075} minDistance={0.15} maxDistance={500} mouseButtons={{ LEFT: activeTool === 'pan' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }} />
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
  const [suggestedMarginPoints, setSuggestedMarginPoints] = useState([])
  const [marginSuggestionInfo, setMarginSuggestionInfo] = useState(null)
  const [dieGeometry, setDieGeometry] = useState(null)
  const [crownGeometry, setCrownGeometry] = useState(null)
  const [opposingGeometry, setOpposingGeometry] = useState(null)
  const [opposingInfo, setOpposingInfo] = useState(null)
  const [opposingOffset, setOpposingOffset] = useState([0, 0, 0])
  const [clearanceThreshold, setClearanceThreshold] = useState(0.1)
  const [clearanceResult, setClearanceResult] = useState(null)
  const [fitTolerance, setFitTolerance] = useState(0.05)
  const [fitResult, setFitResult] = useState(null)
  const [manufacturingTarget, setManufacturingTarget] = useState('crown')
  const [manufacturingResult, setManufacturingResult] = useState(null)
  const [manufacturingUnit, setManufacturingUnit] = useState('unconfirmed')
  const [manufacturingReviewConfirmed, setManufacturingReviewConfirmed] = useState(false)
  const [generatedCrownParameters, setGeneratedCrownParameters] = useState(null)
  const [generatedDieParameters, setGeneratedDieParameters] = useState(null)
  const [sculptMode, setSculptMode] = useState(false)
  const [sculptTool, setSculptTool] = useState('raise')
  const [sculptBrushRadius, setSculptBrushRadius] = useState(0.35)
  const [sculptStrength, setSculptStrength] = useState(0.18)
  const [anatomyCuspHeight, setAnatomyCuspHeight] = useState(0.055)
  const [anatomyGrooveDepth, setAnatomyGrooveDepth] = useState(0.022)
  const [anatomyRidgeHeight, setAnatomyRidgeHeight] = useState(0.025)
  const sculptHistory = useRef([])
  const sculptingRef = useRef(false)
  const [sculptRevision, setSculptRevision] = useState(0)
  const [showDie, setShowDie] = useState(true)
  const [showCrown, setShowCrown] = useState(true)
  const [cementGap, setCementGap] = useState(0.05)
  const [wallThickness, setWallThickness] = useState(0.25)
  const [crownHeight, setCrownHeight] = useState(2)
  const [dieDepth, setDieDepth] = useState(3)
  const [measurementMode, setMeasurementMode] = useState(false)
  const [measurementPoints, setMeasurementPoints] = useState([])
  const [sectionEnabled, setSectionEnabled] = useState(false)
  const [sectionAxis, setSectionAxis] = useState('z')
  const [sectionOffset, setSectionOffset] = useState(0)
  const [activeTool, setActiveTool] = useState('orbit')
  const [selected, setSelected] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const inputRef = useRef(null)
  const opposingInputRef = useRef(null)
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
      opposingGeometry?.dispose()
      setOpposingGeometry(null)
      setOpposingInfo(null)
      setOpposingOffset([0, 0, 0])
      setClearanceResult(null)
      setFitResult(null)
      setManufacturingResult(null)
      setManufacturingReviewConfirmed(false)
      setManufacturingUnit('unconfirmed')
      setGeneratedCrownParameters(null)
      setGeneratedDieParameters(null)
      dieGeometry?.dispose()
      crownGeometry?.dispose()
      setDieGeometry(null)
      setCrownGeometry(null)
      sculptHistory.current.forEach(snapshot => snapshot.dispose())
      sculptHistory.current = []
      setSculptMode(false)
      setShowDie(true)
      setShowCrown(true)
      const designScale = Math.max(size.x, size.y, size.z)
      setCementGap(designScale * 0.005)
      setFitTolerance(designScale * 0.005)
      setWallThickness(designScale * 0.025)
      setCrownHeight(designScale * 0.2)
      setDieDepth(designScale * 0.3)
      geometryRef.current = next
      setGeometry(next)
      setSelected(true)
      setMarginPoints([])
      setMarginClosed(false)
      setSuggestedMarginPoints([])
      setMarginSuggestionInfo(null)
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
  }, [dieGeometry, crownGeometry, opposingGeometry])

  const loadOpposingFile = async (file) => {
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['stl', 'ply'].includes(ext)) { setError('Unsupported opposing scan. Choose an STL or PLY mesh.'); return }
    try {
      setBusy(true)
      const buffer = await file.arrayBuffer()
      if (!buffer.byteLength) throw new Error('The opposing scan is empty or unreadable.')
      const loader = ext === 'stl' ? new STLLoader() : new PLYLoader()
      const next = loader.parse(buffer)
      const position = next.getAttribute('position')
      if (!position || position.count < 3) { next.dispose(); throw new Error('The opposing scan does not contain enough vertices.') }
      for (let i = 0; i < position.count; i += 1) {
        if (!Number.isFinite(position.getX(i)) || !Number.isFinite(position.getY(i)) || !Number.isFinite(position.getZ(i))) {
          next.dispose(); throw new Error('The opposing scan contains invalid coordinates.')
        }
      }
      next.computeBoundingBox()
      const bounds = next.boundingBox
      if (!bounds || bounds.isEmpty()) { next.dispose(); throw new Error('The opposing scan has invalid dimensions.') }
      const center = bounds.getCenter(new THREE.Vector3())
      next.translate(-center.x, -center.y, -center.z)
      next.computeVertexNormals()
      next.computeBoundingBox()
      next.computeBoundingSphere()
      opposingGeometry?.dispose()
      setOpposingGeometry(next)
      setOpposingInfo({ name: file.name, vertices: position.count })
      setOpposingOffset([0, 0, 0])
      clearOcclusionColors(crownGeometry)
      setClearanceResult(null)
      setError('')
    } catch (e) { setError(e?.message || 'Unable to load the opposing scan.') }
    finally { setBusy(false) }
  }

  const clearClearanceAnalysis = () => {
    clearOcclusionColors(crownGeometry)
    setClearanceResult(null)
  }
  const runClearanceAnalysis = () => {
    try {
      if (!crownGeometry || !opposingGeometry) throw new Error('Generate a crown and load an opposing scan first.')
      clearOcclusionColors(crownGeometry)
      const result = analyzeOcclusionClearance(crownGeometry, opposingGeometry, opposingOffset, clearanceThreshold)
      setClearanceResult(result)
      setShowCrown(true)
      setError('')
    } catch (e) { setError(e?.message || 'Unable to analyse crown clearance.') }
  }

  const runFitAnalysis = () => {
    try {
      if (!crownGeometry || !geometry) throw new Error('Generate a crown and load the preparation scan before checking fit.')
      const result = analyzeRestorationFit(crownGeometry, geometry, fitTolerance)
      setFitResult(result)
      setError('')
    } catch (e) { setError(e?.message || 'Unable to analyse restoration fit.') }
  }

  const runManufacturingCheck = () => {
    try {
      const targetGeometry = manufacturingTarget === 'die' ? dieGeometry : crownGeometry
      if (!targetGeometry) throw new Error(`Generate a ${manufacturingTarget} before running manufacturing checks.`)
      const result = analyzeManufacturingMesh(targetGeometry)
      setManufacturingResult(result)
      setError('')
    } catch (e) { setError(e?.message || 'Unable to analyse the restoration mesh.') }
  }

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
    opposingGeometry?.dispose()
    setOpposingGeometry(null)
    setOpposingInfo(null)
    setOpposingOffset([0, 0, 0])
    clearOcclusionColors(crownGeometry)
    setClearanceResult(null)
    setFitResult(null)
    setManufacturingResult(null)
    setManufacturingReviewConfirmed(false)
    setManufacturingUnit('unconfirmed')
    setGeneratedCrownParameters(null)
    setGeneratedDieParameters(null)
    geometryRef.current = null
    setGeometry(null)
    setFileInfo(null)
    setSelected(false)
    setMarginPoints([])
    setMarginClosed(false)
    setSuggestedMarginPoints([])
    setMarginSuggestionInfo(null)
    setMarginMode(false)
    dieGeometry?.dispose()
    crownGeometry?.dispose()
    setDieGeometry(null)
    setCrownGeometry(null)
    sculptHistory.current.forEach(snapshot => snapshot.dispose())
    sculptHistory.current = []
    setSculptMode(false)
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
    setSuggestedMarginPoints([])
    setMarginSuggestionInfo(null)
    setMarginPoints(points => [...points, point.clone()])
  }, [marginClosed])
  const undoMarginPoint = () => {
    setFitResult(null)
    setManufacturingResult(null)
    setManufacturingReviewConfirmed(false)
    dieGeometry?.dispose()
    crownGeometry?.dispose()
    setDieGeometry(null)
    setCrownGeometry(null)
    setMarginPoints(points => points.slice(0, -1))
    setMarginClosed(false)
    setSuggestedMarginPoints([])
    setMarginSuggestionInfo(null)
  }
  const clearMargin = () => {
    setFitResult(null)
    setManufacturingResult(null)
    setManufacturingReviewConfirmed(false)
    dieGeometry?.dispose()
    crownGeometry?.dispose()
    setDieGeometry(null)
    setCrownGeometry(null)
    setMarginPoints([])
    setMarginClosed(false)
    setSuggestedMarginPoints([])
    setMarginSuggestionInfo(null)
  }
  const clearMeasurement = () => setMeasurementPoints([])
  const refineMargin = () => {
    try {
      setBusy(true)
      const result = suggestMarginRefinement(geometry, marginPoints)
      setSuggestedMarginPoints(result.points)
      setMarginSuggestionInfo(result)
      setError('')
    } catch (e) {
      setError(e.message || 'Unable to suggest margin refinements.')
    } finally {
      setBusy(false)
    }
  }
  const applyMarginSuggestions = () => {
    if (!suggestedMarginPoints.length) return
    setFitResult(null)
    setManufacturingResult(null)
    setManufacturingReviewConfirmed(false)
    dieGeometry?.dispose()
    crownGeometry?.dispose()
    setDieGeometry(null)
    setCrownGeometry(null)
    setMarginPoints(suggestedMarginPoints.map(point => point.clone()))
    setSuggestedMarginPoints([])
    setMarginSuggestionInfo(null)
    setMarginClosed(true)
  }
  const generateDie = () => {
    try {
      setManufacturingResult(null)
      setManufacturingReviewConfirmed(false)
      const referenceCenter = new THREE.Vector3(0, 0, 0)
      const next = generateDieGeometry(marginPoints, dieDepth, referenceCenter)
      dieGeometry?.dispose()
      setDieGeometry(next)
      setGeneratedDieParameters({ dieDepth })
      setShowDie(true)
      setShowCrown(false)
      setError('')
    } catch (e) { setError(e.message || 'Unable to generate the preparation die.') }
  }
  const generateCrown = () => {
    try {
      setFitResult(null)
      setManufacturingResult(null)
      setManufacturingReviewConfirmed(false)
      clearClearanceAnalysis()
      const referenceCenter = new THREE.Vector3(0, 0, 0)
      const generated = generateCrownGeometry(marginPoints, cementGap, wallThickness, crownHeight, referenceCenter)
      const next = createSculptableGeometry(generated, 2)
      generated.dispose()
      crownGeometry?.dispose()
      sculptHistory.current.forEach(snapshot => snapshot.dispose())
      sculptHistory.current = []
      setCrownGeometry(next)
      setGeneratedCrownParameters({ cementSpace: cementGap, wallThickness, crownHeight, cuspHeight: anatomyCuspHeight, centralGrooveDepth: anatomyGrooveDepth, occlusalRidgeHeight: anatomyRidgeHeight })
      setSculptMode(false)
      setSculptRevision(value => value + 1)
      setShowCrown(true)
      setShowDie(false)
      setError('')
    } catch (e) { setError(e.message || 'Unable to generate the crown shell.') }
  }
  const beginCrownSculpt = () => {
    if (!crownGeometry) return
    setFitResult(null)
    setManufacturingResult(null)
    setManufacturingReviewConfirmed(false)
    clearClearanceAnalysis()
    sculptHistory.current.push(crownGeometry.clone())
    if (sculptHistory.current.length > 12) sculptHistory.current.shift()?.dispose()
    sculptingRef.current = true
    setSculptRevision(value => value + 1)
  }
  const applyCrownSculpt = (point, normal) => {
    if (!crownGeometry || !sculptingRef.current) return
    sculptCrownGeometry(crownGeometry, point, normal, sculptBrushRadius, sculptStrength, sculptTool)
    setSculptRevision(value => value + 1)
  }
  const endCrownSculpt = () => { sculptingRef.current = false }
  const applyCrownAnatomy = () => {
    if (!crownGeometry) return
    try {
      setFitResult(null)
      setManufacturingResult(null)
      setManufacturingReviewConfirmed(false)
      clearClearanceAnalysis()
      setSculptMode(false)
      sculptingRef.current = false
      sculptHistory.current.push(crownGeometry.clone())
      if (sculptHistory.current.length > 12) sculptHistory.current.shift()?.dispose()
      const changed = applyAnatomicalForm(crownGeometry, { cuspHeight: anatomyCuspHeight, grooveDepth: anatomyGrooveDepth, ridgeHeight: anatomyRidgeHeight })
      if (!changed) throw new Error('No suitable outer occlusal surface vertices were found for anatomical shaping.')
      setSculptRevision(value => value + 1)
      setError('')
    } catch (e) {
      const snapshot = sculptHistory.current.pop()
      snapshot?.dispose()
      setError(e?.message || 'Unable to apply the anatomical crown form.')
    }
  }
  const undoCrownSculpt = () => {
    setFitResult(null)
    setManufacturingResult(null)
    setManufacturingReviewConfirmed(false)
    clearClearanceAnalysis()
    const previous = sculptHistory.current.pop()
    if (!previous) return
    crownGeometry?.dispose()
    const restored = createSculptableGeometry(previous, 0)
    previous.dispose()
    setCrownGeometry(restored)
    setSculptRevision(value => value + 1)
  }
  const resetCrownShape = () => {
    sculptHistory.current.forEach(snapshot => snapshot.dispose())
    sculptHistory.current = []
    generateCrown()
  }
  const exportRestoration = (geometryToExport, suffix) => {
    if (!geometryToExport) return
    try {
      const preflight = analyzeManufacturingMesh(geometryToExport)
      setManufacturingTarget(suffix === 'die' ? 'die' : 'crown')
      setManufacturingResult(preflight)
      if (!preflight.exportPreflight) {
        setError('STL export blocked: fix the reported topology issues before exporting this mesh. Automatic mesh repair is not available.')
        return
      }
    } catch (e) {
      setError(e?.message || 'STL export preflight failed.')
      return
    }
    const exporter = new STLExporter()
    const material = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide })
    const mesh = new THREE.Mesh(geometryToExport, material)
    const data = exporter.parse(mesh, { binary: true })
    material.dispose()
    const blob = new Blob([data], { type: 'model/stl' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${(fileInfo?.name || 'dental-case').replace(/\.[^.]+$/, '')}-${suffix}.stl`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }
  const exportManufacturingReport = () => {
    const targetGeometry = manufacturingTarget === 'die' ? dieGeometry : crownGeometry
    try {
      if (!targetGeometry) throw new Error(`Generate a ${manufacturingTarget} before creating the manufacturing report.`)
      if (!['mm', 'cm', 'in'].includes(manufacturingUnit)) {
        throw new Error('Confirm the scan units (mm, cm, or inches) before exporting the manufacturing report.')
      }
      if (!manufacturingReviewConfirmed) {
        throw new Error('Confirm that you reviewed the restoration and understand the limitations before exporting.')
      }

      const preflight = analyzeManufacturingMesh(targetGeometry)
      setManufacturingResult(preflight)
      if (!preflight.exportPreflight) {
        throw new Error('Manufacturing report blocked: the selected restoration failed topology preflight. Resolve the listed mesh issues before handoff.')
      }

      const report = {
        reportType: 'DentalCAD manufacturing handoff',
        schemaVersion: '1.0',
        generatedAt: new Date().toISOString(),
        case: {
          sourceScan: fileInfo?.name || null,
          sourceFormat: fileInfo?.format || null,
          declaredUnits: manufacturingUnit,
          unitsNote: 'Values are reported in the user-declared source units. No unit conversion was performed.',
          sourceDimensions: fileInfo?.dimensions?.map(Number) || null,
        },
        restoration: {
          type: manufacturingTarget,
          stlFilename: `${(fileInfo?.name || 'dental-case').replace(/\.[^.]+$/, '')}-${manufacturingTarget}.stl`,
          vertexCount: preflight.vertexCount,
          triangleCount: preflight.triangleCount,
          designParameters: manufacturingTarget === 'crown'
            ? { ...(generatedCrownParameters || {}) }
            : { ...(generatedDieParameters || {}) },
        },
        margin: {
          closed: marginClosed,
          pointCount: marginPoints.length,
          points: marginPoints.map((point, index) => ({ index: index + 1, x: point.x, y: point.y, z: point.z })),
        },
        manufacturingPreflight: {
          status: 'passed',
          exportPreflight: preflight.exportPreflight,
          boundaryEdges: preflight.boundaryEdges,
          nonManifoldEdges: preflight.nonManifoldEdges,
          windingConflicts: preflight.windingConflicts,
          degenerateFaces: preflight.degenerateFaces,
          duplicateFaces: preflight.duplicateFaces,
          invalidTriangles: preflight.invalidTriangles,
          enclosedVolumeValid: preflight.volumeValid,
          estimatedWallThickness: {
            minimum: preflight.thickness.minimum,
            percentile10: preflight.thickness.percentile10,
            average: preflight.thickness.average,
            samples: preflight.thickness.samples,
            sampledVertices: preflight.thickness.sampledVertices,
            method: 'Sampled nearest opposing-normal vertex estimate; not an exact thickness calculation.',
          },
        },
        fitAssessment: manufacturingTarget === 'crown' && fitResult
          ? { status: 'available', tolerance: fitResult.tolerance, averageGap: fitResult.average, medianGap: fitResult.median, percentile95Gap: fitResult.percentile95, withinTolerancePercent: fitResult.withinTolerancePercent, samples: fitResult.samples, unmatchedSamples: fitResult.unmatchedSamples, method: 'Unsigned sampled point-to-triangle proximity estimate.' }
          : { status: 'not included; run fit assessment if required' },
        occlusionAssessment: manufacturingTarget === 'crown' && clearanceResult
          ? { status: 'available', threshold: clearanceThreshold, minimumGap: clearanceResult.minimum, averageGap: clearanceResult.average, percentile95Gap: clearanceResult.percentile95, nearContactSamples: clearanceResult.nearContactSamples, evaluatedSamples: clearanceResult.evaluatedVertices, opposingScan: opposingInfo?.name || null, opposingOffset }
          : { status: 'not included; run opposing-arch clearance analysis if required' },
        manualReview: {
          confirmedByOperator: manufacturingReviewConfirmed,
          confirmation: 'Operator confirms that the restoration has been visually reviewed and that the included geometric checks are estimates, not clinical or manufacturing certification.',
        },
        limitations: [
          'A passed topology preflight only means the implemented checks did not detect the listed defects.',
          'Wall thickness is an approximate sampled estimate and may miss thin regions.',
          'Fit and occlusion measurements are sampled, unsigned proximity estimates; they do not detect signed penetration or contact forces.',
          'No automatic mesh repair, exact self-intersection test, undercut analysis, CAM toolpath generation, or machine-specific validation is provided.',
          'This report does not certify clinical suitability or manufacturing readiness. Verify the STL in validated dental CAD/CAM software and follow the manufacturing provider specifications.',
        ],
      }

      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${(fileInfo?.name || 'dental-case').replace(/\.[^.]+$/, '')}-${manufacturingTarget}-manufacturing-report.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setError('')
    } catch (e) {
      setError(e?.message || 'Unable to create the manufacturing handoff report.')
    }
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
          <Canvas shadows dpr={[1, 2]} gl={{ antialias: true, alpha: false, localClippingEnabled: true }} onPointerMissed={() => setSelected(false)}><ViewerScene geometry={geometry} dieGeometry={dieGeometry} crownGeometry={crownGeometry} opposingGeometry={opposingGeometry} opposingOffset={opposingOffset} clearanceActive={Boolean(clearanceResult)} showDie={showDie} showCrown={showCrown} wireframe={wireframe} showGrid={showGrid} color={color} opacity={opacity} controlsRef={controlsRef} activeTool={activeTool} selected={selected} onSelect={() => setSelected(true)} marginMode={marginMode} marginPoints={marginPoints} marginClosed={marginClosed} suggestedMarginPoints={suggestedMarginPoints} onAddMarginPoint={addMarginPoint} measurementMode={measurementMode} measurementPoints={measurementPoints} onAddMeasurementPoint={addMeasurementPoint} sectionEnabled={sectionEnabled} sectionAxis={sectionAxis} sectionOffset={sectionOffset} sectionSize={sectionSize} clippingPlane={clippingPlane} sculptMode={sculptMode} onSculptStart={beginCrownSculpt} onSculpt={applyCrownSculpt} onSculptEnd={endCrownSculpt} /></Canvas>
          {!geometry && <div className="empty-state"><div className="empty-icon"><ScanLine size={28} strokeWidth={1.35} /></div><div className="empty-eyebrow">3D MODEL VIEWPORT</div><h1>Your workspace is ready.</h1><p>Import a dental scan or mesh to begin inspecting your model in 3D.</p><button className="primary-button" onClick={() => inputRef.current?.click()}><Upload size={16} /> Import 3D file</button><div className="file-types"><span>STL</span><span>PLY</span><i /> Up to your browser's available memory</div></div>}
          {dragging && <div className="drop-overlay"><div><FileUp size={30} /><strong>Drop your mesh here</strong><span>STL or PLY files</span></div></div>}
          {geometry && <div className="model-chip"><span className="status-dot" /> {selected ? 'OBJECT SELECTED' : 'MODEL LOADED'} <span>/</span> {fileInfo?.format}</div>}
          {marginMode && <div className="margin-mode-hint">MARGIN TRACE ACTIVE · CLICK THE MESH TO ADD POINTS</div>}
          {sculptMode && <div className="margin-mode-hint sculpt-mode-hint">CROWN SCULPT ACTIVE · CLICK AND DRAG ON THE CROWN</div>}
          {measurementMode && <div className="margin-mode-hint measurement-mode-hint">MEASURE ACTIVE · SELECT TWO POINTS ON THE MESH</div>}
          {error && <div className="error-toast">{error}<button onClick={() => setError('')}>×</button></div>}
          {busy && <div className="loading-cover"><div className="loader" /> Parsing mesh…</div>}
          <div className="viewport-hint"><span><MousePointer2 size={12} /> DRAG TO ORBIT</span><span>SCROLL TO ZOOM</span><span>RIGHT-DRAG TO PAN</span></div>
          <div className="view-cube" aria-label="Standard views"><button type="button" onClick={() => setView('top')} title="Top view">TOP</button><button type="button" onClick={() => setView('front')} title="Front view">FRONT</button><button type="button" onClick={() => setView('right')} title="Right view">RIGHT</button><button type="button" onClick={() => setView('left')} title="Left view">LEFT</button><button type="button" onClick={() => setView('back')} title="Back view">BACK</button><button type="button" onClick={() => setView('bottom')} title="Bottom view">BOTTOM</button></div>
          <div className="zoom-controls"><IconButton icon={ZoomIn} label="Zoom in" onClick={() => controlsRef.current?.dollyIn(1.2)} /><IconButton icon={ZoomOut} label="Zoom out" onClick={() => controlsRef.current?.dollyOut(1.2)} /><div className="zoom-divider" /><IconButton icon={Maximize2} label="Reset camera" onClick={fitModel} /></div>
        </div>
        <div className="timeline-bar"><div className="timeline-left"><span className="timeline-indicator" /> {geometry ? 'Mesh ready for inspection' : 'No active model'} <span className="timeline-sep">·</span> {geometry ? `${fileInfo.vertices.toLocaleString()} vertices` : 'Waiting for import'}</div><div className="timeline-right"><span>WORLD UNITS</span><strong>source</strong><span className="unit-note">*Units from source file</span></div></div>
      </section>

      {showInspector && <aside className="inspector">
        <div className="panel-heading"><div><span className="panel-kicker">SCENE</span><h2>Inspector</h2></div><button className="panel-menu"><SlidersHorizontal size={16} /></button></div>
        <div className="panel-section"><div className="section-title"><span>OBJECTS</span><span className="section-count">{geometry ? '01' : '00'}</span></div>{geometry ? <div className={`object-row ${selected ? 'selected' : ''}`} onClick={() => setSelected(true)}><Box size={16} /><span>{fileInfo.name}</span><span className="object-type">{fileInfo.format}</span><button className="object-remove" type="button" title="Remove model" aria-label="Remove model" onClick={event => { event.stopPropagation(); clearModel() }}><Trash2 size={14} /></button></div> : <div className="empty-object"><Layers3 size={17} /><span>No objects in scene</span></div>}</div>
        <div className="panel-section"><div className="section-title">TRANSFORM</div><div className="transform-grid">{['Position','Rotation','Scale'].map((label, i) => <div className="transform-row" key={label}><span>{label}</span><div>{['X','Y','Z'].map((axis, j) => <label key={axis}><i>{axis}</i><input value={geometry && i === 2 ? '1.00' : '0.00'} readOnly /></label>)}</div></div>)}</div></div>
        <div className="panel-section"><div className="section-title">APPEARANCE</div><div className="appearance-row"><span>Surface color</span><label className="color-picker"><input type="color" value={color} onChange={e => setColor(e.target.value)} /><span>{color.toUpperCase()}</span></label></div><div className="appearance-row opacity-row"><span>Opacity</span><strong>{Math.round(opacity * 100)}%</strong></div><input className="opacity-slider" type="range" min="0.15" max="1" step="0.05" value={opacity} onChange={e => setOpacity(Number(e.target.value))} /></div>
        <div className="panel-section"><div className="section-title">MESH INFORMATION <span className="info-tag">READ ONLY</span></div>{fileInfo ? <div className="stats-grid"><div className="stat-card"><span>VERTICES</span><strong>{fileInfo.vertices.toLocaleString()}</strong></div><div className="stat-card"><span>FACES</span><strong>{Math.round(fileInfo.faces).toLocaleString()}</strong></div><div className="stat-card wide"><span>DIMENSIONS (X × Y × Z)</span><strong>{fileInfo.dimensions.map(v => `${v} source units`).join(' × ')}</strong></div><div className="stat-card wide"><span>FILE SIZE</span><strong>{formatSize(fileInfo.size)}</strong></div></div> : <div className="stats-placeholder">Mesh statistics will appear here after import.</div>}<p className="footnote">Dimensions use source-file units; they are not converted to millimetres.</p></div>
        <div className="panel-section"><div className="section-title">MESH QUALITY <span className="info-tag">ESTIMATED</span></div>{fileInfo ? <div className="quality-list"><div><span>Surface area</span><strong>{fileInfo.analysis.surfaceArea.toFixed(3)} units²</strong></div><div><span>Enclosed volume</span><strong>{fileInfo.analysis.volume === null ? 'Unavailable' : `${fileInfo.analysis.volume.toFixed(3)} units³`}</strong></div><div><span>Boundary edges</span><strong>{fileInfo.analysis.boundaryEdges.toLocaleString()}</strong></div><div><span>Non-manifold edges</span><strong>{fileInfo.analysis.nonManifoldEdges.toLocaleString()}</strong></div><div><span>Winding conflicts</span><strong>{fileInfo.analysis.windingConflicts.toLocaleString()}</strong></div><div><span>Degenerate faces</span><strong>{fileInfo.analysis.degenerateFaces.toLocaleString()}</strong></div><div><span>Closed-edge check</span><strong className={fileInfo.analysis.closedEdgeCheck ? 'quality-good' : 'quality-warn'}>{fileInfo.analysis.closedEdgeCheck ? 'Passed' : 'Open / non-manifold'}</strong></div></div> : <div className="stats-placeholder">Quality checks will appear after importing a mesh.</div>}<p className="footnote">Topology checks are geometric estimates, not a clinical or manufacturing certification.</p></div>
        <div className="panel-section"><div className="section-title">CROSS SECTION <span className="info-tag">LIVE SLICE</span></div><button className={`mini-action ${sectionEnabled ? 'primary' : ''}`} onClick={() => setSectionEnabled(value => !value)} disabled={!geometry}><Scissors size={13} /> {sectionEnabled ? 'Disable section' : 'Enable section'}</button><div className="section-controls"><select value={sectionAxis} onChange={event => setSectionAxis(event.target.value)} disabled={!geometry}><option value="x">X axis</option><option value="y">Y axis</option><option value="z">Z axis</option></select><input type="range" min={-sectionLimit} max={sectionLimit} step={Math.max(sectionLimit / 200, 0.001)} value={Math.max(-sectionLimit, Math.min(sectionLimit, sectionOffset))} onChange={event => setSectionOffset(Number(event.target.value))} disabled={!geometry || !sectionEnabled} /><span>{sectionOffset.toFixed(2)} source units</span></div><p className="footnote">Moves a live clipping plane through the mesh. This view does not generate a capped solid.</p></div>
        <div className="panel-section"><div className="section-title">MEASUREMENTS <span className="info-tag">3D</span></div><div className="margin-tool-card measurement-card"><div className="margin-tool-heading"><Ruler size={15} /><strong>Point-to-point</strong><span>{measurementPoints.length}/2 pts</span></div><p>{measuredDistance === null ? 'Activate Measure, then select two points on the mesh.' : `Distance: ${measuredDistance.toFixed(3)} source units`}</p><div className="margin-actions"><button className={`mini-action ${measurementMode ? 'primary' : ''}`} onClick={() => { setMeasurementMode(value => !value); setMarginMode(false) }} disabled={!geometry}>{measurementMode ? 'Stop measuring' : 'Measure'}</button><button className="mini-action" onClick={clearMeasurement} disabled={!measurementPoints.length}><Trash2 size={13} /> Clear</button></div></div></div>
        <div className="panel-section"><div className="section-title">DENTAL TOOLS <span className="info-tag">MANUAL</span></div><div className="margin-tool-card"><div className="margin-tool-heading"><PenTool size={15} /><strong>Margin curve</strong><span>{marginPoints.length} pts</span></div><p>{marginClosed ? 'Curve closed. Export the selected 3D points as CSV.' : marginMode ? 'Click along the tooth preparation margin in the viewport.' : 'Enable tracing, then select points directly on the mesh.'}</p><div className="margin-actions"><button className="mini-action primary" onClick={() => setMarginMode(value => !value)} disabled={!geometry}>{marginMode ? 'Stop' : 'Trace'}</button><button className="mini-action" onClick={undoMarginPoint} disabled={!marginPoints.length}><Undo2 size={13} /> Undo</button><button className="mini-action" onClick={clearMargin} disabled={!marginPoints.length}><Trash2 size={13} /> Clear</button></div><div className="margin-actions margin-export-row"><button className="mini-action" onClick={() => { setMarginClosed(true); setMarginMode(false) }} disabled={marginPoints.length < 3 || marginClosed}><Check size={13} /> Close curve</button><button className="mini-action" onClick={exportMargin} disabled={!marginPoints.length}><Download size={13} /> CSV</button></div></div></div>
        <div className="panel-section"><div className="section-title">MARGIN ASSIST <span className="info-tag">PHASE 4</span></div><div className="margin-tool-card margin-assist-card"><div className="margin-tool-heading"><WandSparkles size={15} /><strong>Curvature-guided refinement</strong><span>{marginSuggestionInfo ? `${marginSuggestionInfo.matched}/${marginSuggestionInfo.total}` : 'ASSISTED'}</span></div><p>Trace at least 8 points first. The tool searches nearby mesh curvature changes and previews suggested point snaps.</p><div className="margin-actions"><button className="mini-action primary" onClick={refineMargin} disabled={!geometry || marginPoints.length < 8 || busy}><WandSparkles size={13} /> Suggest refinements</button><button className="mini-action" onClick={() => { setSuggestedMarginPoints([]); setMarginSuggestionInfo(null) }} disabled={!suggestedMarginPoints.length}>Discard</button></div>{marginSuggestionInfo && <><div className="margin-assist-metrics"><span>Matched points</span><strong>{marginSuggestionInfo.matched} / {marginSuggestionInfo.total}</strong><span>Heuristic confidence</span><strong>{marginSuggestionInfo.confidence}%</strong></div><div className="margin-actions"><button className="mini-action primary" onClick={applyMarginSuggestions} disabled={!marginSuggestionInfo.matched}><Check size={13} /> Apply suggestions</button></div></>}<p className="footnote">Suggestions are based on local vertex-normal variation near your traced points. Review every point manually; this is not autonomous clinical margin detection.</p></div></div>
        <div className="panel-section"><div className="section-title">RESTORATION DESIGN <span className="info-tag">PHASE 3</span></div><div className="restoration-card"><div className="restoration-status"><span className={marginClosed && marginPoints.length >= 8 ? 'status-green' : 'status-muted'} />{marginClosed && marginPoints.length >= 8 ? `Margin ready · ${marginPoints.length} points` : 'Close a margin with at least 8 points to begin'}</div><div className="restoration-controls"><label><span>Die depth</span><strong>{dieDepth.toFixed(3)}</strong></label><input type="range" min={Math.max(Number(fileInfo?.dimensions?.[0] || 1) * 0.03, 0.01)} max={Math.max(...(fileInfo?.dimensions || ['1','1','1']).map(Number)) * 0.8} step={Math.max(Math.max(...(fileInfo?.dimensions || ['1','1','1']).map(Number)) / 500, 0.001)} value={dieDepth} onChange={e => setDieDepth(Number(e.target.value))} disabled={!geometry} /><label><span>Cement space</span><strong>{cementGap.toFixed(3)}</strong></label><input type="range" min="0" max={Math.max(...(fileInfo?.dimensions || ['1','1','1']).map(Number)) * 0.03} step={Math.max(Math.max(...(fileInfo?.dimensions || ['1','1','1']).map(Number)) / 1000, 0.0005)} value={cementGap} onChange={e => setCementGap(Number(e.target.value))} disabled={!geometry} /><label><span>Wall thickness</span><strong>{wallThickness.toFixed(3)}</strong></label><input type="range" min={Math.max(...(fileInfo?.dimensions || ['1','1','1']).map(Number)) * 0.005} max={Math.max(...(fileInfo?.dimensions || ['1','1','1']).map(Number)) * 0.08} step={Math.max(Math.max(...(fileInfo?.dimensions || ['1','1','1']).map(Number)) / 1000, 0.0005)} value={wallThickness} onChange={e => setWallThickness(Number(e.target.value))} disabled={!geometry} /><label><span>Crown height</span><strong>{crownHeight.toFixed(3)}</strong></label><input type="range" min={Math.max(...(fileInfo?.dimensions || ['1','1','1']).map(Number)) * 0.05} max={Math.max(...(fileInfo?.dimensions || ['1','1','1']).map(Number)) * 0.5} step={Math.max(Math.max(...(fileInfo?.dimensions || ['1','1','1']).map(Number)) / 500, 0.001)} value={crownHeight} onChange={e => setCrownHeight(Number(e.target.value))} disabled={!geometry} /></div><div className="restoration-actions"><button className="mini-action" onClick={generateDie} disabled={!geometry || !marginClosed || marginPoints.length < 8}><Box size={13} /> Generate die</button><button className="mini-action primary" onClick={generateCrown} disabled={!geometry || !marginClosed || marginPoints.length < 8}><Layers3 size={13} /> Generate crown</button></div>{dieGeometry && <div className="restoration-result"><span>Preparation die generated</span><div><button className={showDie ? 'selected' : ''} onClick={() => setShowDie(v => !v)}>View</button><button onClick={() => exportRestoration(dieGeometry, 'die')}><Download size={12} /> STL</button></div></div>}{crownGeometry && <div className="restoration-result"><span>Crown shell generated</span><div><button className={showCrown ? 'selected' : ''} onClick={() => setShowCrown(v => !v)}>View</button><button onClick={() => exportRestoration(crownGeometry, 'crown')}><Download size={12} /> STL</button></div></div>}<p className="footnote">Creates an initial parametric die and crown shell from the manually traced margin. Dimensions use source units. This is a design prototype, not an anatomy-aware or clinically validated restoration.</p></div></div>
        <div className="panel-section"><div className="section-title">CROWN ANATOMY <span className="info-tag">PHASE 5</span></div><div className="margin-tool-card crown-sculpt-card" data-revision={sculptRevision}><div className="margin-tool-heading"><Brush size={15} /><strong>Interactive crown sculpting</strong><span>{sculptHistory.current.length} undo</span></div><p>{crownGeometry ? 'Select a brush and drag directly on the crown surface to shape its outer anatomy.' : 'Generate a crown first. The crown is subdivided to provide a denser surface for sculpting.'}</p><div className="sculpt-controls"><label>Brush mode<select value={sculptTool} onChange={event => setSculptTool(event.target.value)} disabled={!crownGeometry}><option value="raise">Add / raise</option><option value="lower">Reduce / lower</option><option value="smooth">Smooth</option></select></label><label><span>Brush radius</span><strong>{sculptBrushRadius.toFixed(2)} units</strong></label><input type="range" min="0.05" max="2" step="0.05" value={sculptBrushRadius} onChange={event => setSculptBrushRadius(Number(event.target.value))} disabled={!crownGeometry} /><label><span>Brush strength</span><strong>{Math.round(sculptStrength * 100)}%</strong></label><input type="range" min="0.02" max="0.6" step="0.01" value={sculptStrength} onChange={event => setSculptStrength(Number(event.target.value))} disabled={!crownGeometry} /></div><div className="margin-actions"><button className={`mini-action primary ${sculptMode ? 'sculpt-active' : ''}`} onClick={() => { setSculptMode(value => !value); endCrownSculpt() }} disabled={!crownGeometry}><Brush size={13} /> {sculptMode ? 'Finish sculpting' : 'Sculpt crown'}</button><button className="mini-action" onClick={undoCrownSculpt} disabled={!sculptHistory.current.length}><Undo2 size={13} /> Undo stroke</button><button className="mini-action" onClick={resetCrownShape} disabled={!crownGeometry}><Rotate3D size={13} /> Reset shape</button></div><p className="footnote">Brush edits affect the generated crown mesh only. This is manual surface shaping, not automatic cusp anatomy or validated occlusal design.</p></div></div>
        <div className="panel-section"><div className="section-title">ANATOMY ASSIST <span className="info-tag">PHASE 8</span></div><div className="margin-tool-card anatomy-assist-card">
          <div className="margin-tool-heading"><WandSparkles size={15} /><strong>Occlusal form shaping</strong><span>4 CUSPS</span></div>
          <p>Apply a procedural four-cusp occlusal form to the generated crown, aligned to the preparation margin frame.</p>
          <div className="anatomy-controls">
            <label><span>Cusp height</span><strong>{Math.round(anatomyCuspHeight * 100)}%</strong></label><input type="range" min="0" max="0.14" step="0.005" value={anatomyCuspHeight} onChange={event => setAnatomyCuspHeight(Number(event.target.value))} disabled={!crownGeometry} />
            <label><span>Central groove depth</span><strong>{Math.round(anatomyGrooveDepth * 100)}%</strong></label><input type="range" min="0" max="0.07" step="0.002" value={anatomyGrooveDepth} onChange={event => setAnatomyGrooveDepth(Number(event.target.value))} disabled={!crownGeometry} />
            <label><span>Occlusal ridge height</span><strong>{Math.round(anatomyRidgeHeight * 100)}%</strong></label><input type="range" min="0" max="0.08" step="0.002" value={anatomyRidgeHeight} onChange={event => setAnatomyRidgeHeight(Number(event.target.value))} disabled={!crownGeometry} />
          </div>
          <div className="margin-actions"><button className="mini-action primary" onClick={applyCrownAnatomy} disabled={!crownGeometry}><WandSparkles size={13} /> Apply anatomical form</button><button className="mini-action" onClick={undoCrownSculpt} disabled={!crownGeometry || !sculptHistory.current.length}><Undo2 size={13} /> Undo</button><button className="mini-action" onClick={resetCrownShape} disabled={!crownGeometry}><Rotate3D size={13} /> Reset crown</button></div>
          <p className="footnote">This generic four-cusp template is not tooth-specific. It does not infer tooth type, natural anatomy, opposing contacts, or functional occlusion. Inspect and sculpt the result manually; clinical validation is not provided.</p>
        </div></div>
        <div className="panel-section"><div className="section-title">FIT ASSESSMENT <span className="info-tag">PHASE 9</span></div><div className="margin-tool-card fit-assessment-card">
          <div className="margin-tool-heading"><Crosshair size={15} /><strong>Intaglio-to-preparation fit</strong><span>{fitResult ? "ANALYSED" : "NOT CHECKED"}</span></div>
          <p>Compare sampled crown intaglio vertices with sampled surface triangles from the loaded preparation scan.</p>
          <div className="fit-controls"><label><span>User tolerance</span><strong>{fitTolerance.toFixed(4)} source units</strong></label><input type="range" min={Math.max(Number(fileInfo?.dimensions?.[0] || 1) * 0.0005, 0.001)} max={Math.max(Number(fileInfo?.dimensions?.[0] || 1) * 0.03, 0.01)} step={Math.max(Number(fileInfo?.dimensions?.[0] || 1) / 2000, 0.0005)} value={fitTolerance} onChange={event => { setFitTolerance(Number(event.target.value)); setFitResult(null) }} disabled={!geometry || !crownGeometry} /></div>
          <div className="margin-actions"><button className="mini-action primary" onClick={runFitAnalysis} disabled={!geometry || !crownGeometry}><Crosshair size={13} /> Analyse fit</button><button className="mini-action" onClick={() => setFitResult(null)} disabled={!fitResult}>Clear results</button></div>
          {fitResult && <div className="fit-results"><div><span>Mean surface gap</span><strong>{fitResult.average.toFixed(4)}</strong></div><div><span>Median surface gap</span><strong>{fitResult.median.toFixed(4)}</strong></div><div><span>95th percentile gap</span><strong>{fitResult.percentile95.toFixed(4)}</strong></div><div><span>Minimum / maximum</span><strong>{fitResult.minimum.toFixed(4)} / {fitResult.maximum.toFixed(4)}</strong></div><div><span>Samples within tolerance</span><strong>{fitResult.withinTolerance.toLocaleString()} / {fitResult.samples.toLocaleString()} ({fitResult.withinTolerancePercent.toFixed(1)}%)</strong></div><div><span>Preparation triangles sampled</span><strong>{fitResult.sampledPreparationTriangles.toLocaleString()}</strong></div><div><span>Unmatched intaglio samples</span><strong>{fitResult.unmatchedSamples.toLocaleString()}</strong></div></div>}
          <p className="footnote">This is an unsigned proximity estimate using a sampled subset of preparation triangles and crown intaglio vertices. It cannot identify penetration direction, exact surface fit, margin integrity, cement-space quality, or clinical acceptability. Values use source-file units; review the result with a qualified dental professional.</p>
        </div></div>
        <div className="panel-section"><div className="section-title">OCCLUSION & CLEARANCE <span className="info-tag">PHASE 6</span></div><div className="margin-tool-card occlusion-card"><div className="margin-tool-heading"><Crosshair size={15} /><strong>Opposing arch analysis</strong><span>{opposingInfo ? 'LOADED' : 'NEEDED'}</span></div><p>Load the opposing arch scan, position it with the XYZ offsets, then analyse the generated crown.</p><div className="margin-actions"><button className="mini-action primary" onClick={() => opposingInputRef.current?.click()}><Upload size={13} /> {opposingInfo ? 'Replace opposing scan' : 'Load opposing scan'}</button><button className="mini-action" onClick={() => { opposingGeometry?.dispose(); setOpposingGeometry(null); setOpposingInfo(null); clearClearanceAnalysis() }} disabled={!opposingGeometry}>Remove</button></div>{opposingInfo && <div className="occlusion-file"><span>Opposing mesh</span><strong>{opposingInfo.name}</strong><small>{opposingInfo.vertices.toLocaleString()} vertices · centered for alignment</small></div>}<div className="occlusion-controls"><label>Contact / clearance threshold<strong>{clearanceThreshold.toFixed(3)} source units</strong></label><input type="range" min="0.01" max={Math.max(Number(fileInfo?.dimensions?.[0] || 1) * 0.05, 0.02)} step={Math.max(Number(fileInfo?.dimensions?.[0] || 1) / 1000, 0.001)} value={clearanceThreshold} onChange={event => { setClearanceThreshold(Number(event.target.value)); clearClearanceAnalysis() }} disabled={!opposingGeometry || !crownGeometry} /><span className="occlusion-subheading">OPPOSING SCAN ALIGNMENT</span><div className="occlusion-offset-grid">{['X','Y','Z'].map((axis,index) => <label key={axis}>{axis}<input type="number" step="0.1" value={opposingOffset[index]} onChange={event => { const next = [...opposingOffset]; next[index] = Number(event.target.value); setOpposingOffset(next); clearClearanceAnalysis() }} /></label>)}</div></div><div className="margin-actions"><button className="mini-action primary" onClick={runClearanceAnalysis} disabled={!crownGeometry || !opposingGeometry}><Crosshair size={13} /> Analyse clearance</button><button className="mini-action" onClick={clearClearanceAnalysis} disabled={!clearanceResult}>Clear map</button></div>{clearanceResult && <div className="occlusion-results"><div><span>Minimum sampled surface gap</span><strong>{clearanceResult.minimum === null ? 'N/A' : clearanceResult.minimum.toFixed(4)}</strong></div><div><span>Average sampled surface gap</span><strong>{clearanceResult.average === null ? 'N/A' : clearanceResult.average.toFixed(4)}</strong></div><div><span>95th percentile gap</span><strong>{clearanceResult.percentile95.toFixed(4)}</strong></div><div><span>Near-contact samples</span><strong>{clearanceResult.nearContactSamples.toLocaleString()}</strong></div><div><span>Evaluated occlusal samples</span><strong>{clearanceResult.evaluatedVertices.toLocaleString()}</strong></div><div className="occlusion-legend"><span><i className="clearance-red" /> Near / threshold</span><span><i className="clearance-yellow" /> Transition</span><span><i className="clearance-green" /> Greater clearance</span></div></div>}<p className="footnote">Color map: red is at or below the selected threshold, yellow is within twice that threshold, and green is farther away. The tool measures point-to-triangle distances against a sampled subset of opposing-scan triangles on the crown's outer occlusal surface. It is unsigned, does not detect penetration direction or contact forces, and is not a validated clinical occlusion analysis. Align the opposing scan manually.</p></div></div>
        <div className="panel-section"><div className="section-title">MANUFACTURING PREPARATION <span className="info-tag">PHASE 7</span></div><div className="margin-tool-card manufacturing-card"><div className="margin-tool-heading"><ShieldCheck size={15} /><strong>STL mesh preflight</strong><span>{manufacturingResult ? (manufacturingResult.exportPreflight ? 'TOPOLOGY OK' : 'ISSUES FOUND') : 'NOT CHECKED'}</span></div><p>Check a generated crown or die for open edges, non-manifold edges, winding conflicts, degenerate faces, duplicate faces, and invalid triangles before STL export.</p><div className="manufacturing-controls"><label htmlFor="manufacturing-target">Restoration</label><select id="manufacturing-target" value={manufacturingTarget} onChange={event => { setManufacturingTarget(event.target.value); setManufacturingResult(null); setManufacturingReviewConfirmed(false) }}><option value="crown" disabled={!crownGeometry}>Crown</option><option value="die" disabled={!dieGeometry}>Preparation die</option></select></div><div className="margin-actions"><button className="mini-action primary" onClick={runManufacturingCheck} disabled={manufacturingTarget === 'die' ? !dieGeometry : !crownGeometry}><ShieldCheck size={13} /> Run preflight</button></div>{manufacturingResult && <div className="manufacturing-results"><div><span>Topology preflight</span><strong className={manufacturingResult.exportPreflight ? 'quality-good' : 'quality-warn'}>{manufacturingResult.exportPreflight ? 'Passed' : 'Failed'}</strong></div><div><span>Boundary edges</span><strong>{manufacturingResult.boundaryEdges.toLocaleString()}</strong></div><div><span>Non-manifold edges</span><strong>{manufacturingResult.nonManifoldEdges.toLocaleString()}</strong></div><div><span>Winding conflicts</span><strong>{manufacturingResult.windingConflicts.toLocaleString()}</strong></div><div><span>Degenerate / duplicate faces</span><strong>{(manufacturingResult.degenerateFaces + manufacturingResult.duplicateFaces).toLocaleString()}</strong></div><div><span>Invalid triangles</span><strong>{manufacturingResult.invalidTriangles.toLocaleString()}</strong></div><div><span>Estimated minimum wall thickness</span><strong>{manufacturingResult.thickness.minimum === null ? 'Unavailable' : `${manufacturingResult.thickness.minimum.toFixed(4)} source units`}</strong></div><div><span>10th percentile thickness</span><strong>{manufacturingResult.thickness.percentile10 === null ? 'Unavailable' : `${manufacturingResult.thickness.percentile10.toFixed(4)} source units`}</strong></div><div><span>Thickness samples</span><strong>{manufacturingResult.thickness.samples.toLocaleString()} / {manufacturingResult.thickness.sampledVertices.toLocaleString()}</strong></div>{manufacturingResult.issues.length > 0 && <ul>{manufacturingResult.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}</div>}<p className="footnote">Wall thickness is a nearest opposing-normal vertex estimate, not a certified minimum-thickness calculation. No automatic repair, undercut detection, fit validation, or self-intersection test is performed. A passed topology preflight does not certify clinical or manufacturing readiness. All values use source-file units.</p></div></div>
        <div className="panel-section"><div className="section-title">MANUFACTURING HANDOFF <span className="info-tag">PHASE 10</span></div><div className="margin-tool-card handoff-card">
          <div className="margin-tool-heading"><ShieldCheck size={15} /><strong>Production handoff report</strong><span>{manufacturingReviewConfirmed && manufacturingUnit !== 'unconfirmed' ? 'REVIEWED' : 'ACTION NEEDED'}</span></div>
          <p>Create a traceable JSON report for the selected crown or die. The STL remains a separate export from Restoration Design.</p>
          <div className="handoff-controls">
            <label htmlFor="manufacturing-unit">Confirm source scan units</label>
            <select id="manufacturing-unit" value={manufacturingUnit} onChange={event => setManufacturingUnit(event.target.value)}>
              <option value="unconfirmed">Select units…</option>
              <option value="mm">Millimetres (mm)</option>
              <option value="cm">Centimetres (cm)</option>
              <option value="in">Inches (in)</option>
            </select>
          </div>
          <label className="handoff-confirm"><input type="checkbox" checked={manufacturingReviewConfirmed} onChange={event => setManufacturingReviewConfirmed(event.target.checked)} /> <span>I have visually reviewed this restoration and understand that the reported checks are estimates, not certification.</span></label>
          <div className="margin-actions"><button className="mini-action primary" onClick={exportManufacturingReport} disabled={manufacturingTarget === 'die' ? !dieGeometry : !crownGeometry}><Download size={13} /> Export handoff report (JSON)</button></div>
          <p className="footnote">The report records the selected restoration, design parameters, margin coordinates, topology preflight, available fit / clearance results, declared units, and review confirmation. Export the matching STL separately. No units are converted.</p>
        </div></div>
        <div className="panel-footer"><div className="privacy-icon"><ShieldCheck size={15} /></div><div><strong>Private by design</strong><span>Your mesh is processed locally in this browser.</span></div></div>
      </aside>}
    </main>
    <input ref={inputRef} type="file" accept=".stl,.ply,model/stl,application/octet-stream" hidden onChange={e => { loadFile(e.target.files?.[0]); e.target.value = '' }} />
    <input ref={opposingInputRef} type="file" accept=".stl,.ply,model/stl,application/octet-stream" hidden onChange={e => { loadOpposingFile(e.target.files?.[0]); e.target.value = '' }} />
    {helpOpen && <div className="help-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setHelpOpen(false) }}><section className="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title"><div className="help-dialog-heading"><div><span className="panel-kicker">DENTALCAD STUDIO</span><h2 id="help-title">Viewer controls</h2></div><button type="button" className="help-close" onClick={() => setHelpOpen(false)} aria-label="Close help">×</button></div><div className="help-grid"><div><strong>Measure</strong><span>Choose Measure, then click two points on the mesh to read their 3D distance.</span></div><div><strong>Cross section</strong><span>Enable a clipping plane and move it along the selected axis in the inspector.</span></div><div><strong>Orbit</strong><span>Left-drag or choose Orbit in the tool rail.</span></div><div><strong>Pan</strong><span>Right-drag, or choose Pan then left-drag.</span></div><div><strong>Zoom</strong><span>Scroll or use the + / − controls.</span></div><div><strong>Standard views</strong><span>Use the view buttons at the top-right of the viewport.</span></div><div><strong>Select</strong><span>Choose Select, then click the loaded mesh.</span></div><div><strong>Import</strong><span>Choose Import or drop an STL / PLY file into the viewport.</span></div></div><p className="help-note">Mesh files are parsed locally in your browser. Very large scans depend on available device memory.</p><button className="primary-button help-done" type="button" onClick={() => setHelpOpen(false)}>Got it</button></section></div>}
    <footer className="statusbar"><div><span className="status-green" /> SYSTEM READY <span className="status-divider">|</span> WEBGL</div><div><span>{activeTool.toUpperCase()} TOOL</span><span className="status-divider">|</span><span>SOURCE UNITS</span><span className="status-divider">|</span><span>LOCAL SESSION</span></div></footer>
  </div>
}

export default App
