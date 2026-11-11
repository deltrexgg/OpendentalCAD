import * as THREE from 'three'

// Manufacturing preflight diagnostics. These are geometric checks and estimates,
// not a substitute for validated dental CAM or clinical verification.
export function analyzeManufacturingMesh(geometry, options = {}) {
  const position = geometry?.getAttribute('position')
  if (!position || position.count < 3) throw new Error('The selected restoration has no usable vertex data.')

  const index = geometry.getIndex()
  const triangleCount = index ? Math.floor(index.count / 3) : Math.floor(position.count / 3)
  if (!triangleCount) throw new Error('The selected restoration contains no triangles.')

  geometry.computeBoundingBox()
  const bounds = geometry.boundingBox
  if (!bounds || bounds.isEmpty()) throw new Error('The selected restoration has invalid bounds.')
  const diagonal = Math.max(bounds.getSize(new THREE.Vector3()).length(), 1e-8)
  const weldTolerance = diagonal * 1e-7
  const areaTolerance = diagonal * diagonal * 1e-12
  const edgeUse = new Map()
  const faceKeys = new Set()
  let degenerateFaces = 0
  let duplicateFaces = 0
  let invalidTriangles = 0
  let signedVolume = 0

  const vertexKey = (vertexIndex) => {
    const x = position.getX(vertexIndex)
    const y = position.getY(vertexIndex)
    const z = position.getZ(vertexIndex)
    if (![x, y, z].every(Number.isFinite)) return null
    return `${Math.round(x / weldTolerance)},${Math.round(y / weldTolerance)},${Math.round(z / weldTolerance)}`
  }

  const addEdge = (a, b) => {
    const first = vertexKey(a)
    const second = vertexKey(b)
    if (!first || !second) return
    const key = first < second ? `${first}|${second}` : `${second}|${first}`
    const edge = edgeUse.get(key) || { count: 0, orientation: 0 }
    edge.count += 1
    edge.orientation += first < second ? 1 : -1
    edgeUse.set(key, edge)
  }

  for (let face = 0; face < triangleCount; face += 1) {
    const a = index ? index.getX(face * 3) : face * 3
    const b = index ? index.getX(face * 3 + 1) : face * 3 + 1
    const c = index ? index.getX(face * 3 + 2) : face * 3 + 2
    if ([a, b, c].some(value => !Number.isInteger(value) || value < 0 || value >= position.count)) {
      invalidTriangles += 1
      continue
    }
    const ka = vertexKey(a), kb = vertexKey(b), kc = vertexKey(c)
    if (!ka || !kb || !kc) {
      invalidTriangles += 1
      continue
    }
    const sortedFace = [ka, kb, kc].sort()
    const faceKey = sortedFace.join('|')
    if (new Set(sortedFace).size < 3) degenerateFaces += 1
    if (faceKeys.has(faceKey)) duplicateFaces += 1
    else faceKeys.add(faceKey)

    const ax = position.getX(a), ay = position.getY(a), az = position.getZ(a)
    const bx = position.getX(b), by = position.getY(b), bz = position.getZ(b)
    const cx = position.getX(c), cy = position.getY(c), cz = position.getZ(c)
    const ab = new THREE.Vector3(bx - ax, by - ay, bz - az)
    const ac = new THREE.Vector3(cx - ax, cy - ay, cz - az)
    const doubleArea = new THREE.Vector3().crossVectors(ab, ac).length()
    if (doubleArea <= areaTolerance) degenerateFaces += 1
    signedVolume += (
      ax * (by * cz - bz * cy) +
      ay * (bz * cx - bx * cz) +
      az * (bx * cy - by * cx)
    ) / 6

    addEdge(a, b)
    addEdge(b, c)
    addEdge(c, a)
  }

  let boundaryEdges = 0
  let nonManifoldEdges = 0
  let windingConflicts = 0
  for (const edge of edgeUse.values()) {
    if (edge.count === 1) boundaryEdges += 1
    else if (edge.count > 2) nonManifoldEdges += 1
    else if (edge.orientation !== 0) windingConflicts += 1
  }

  const finiteCoordinates = invalidTriangles === 0
  const closedSurface = finiteCoordinates && boundaryEdges === 0 && nonManifoldEdges === 0 &&
    windingConflicts === 0 && degenerateFaces === 0 && duplicateFaces === 0
  const volumeValid = closedSurface && Number.isFinite(signedVolume) && Math.abs(signedVolume) > areaTolerance * diagonal
  const thickness = estimateWallThickness(geometry, { diagonal, maxSamples: options.maxThicknessSamples || 2500 })
  const issues = []
  if (invalidTriangles) issues.push(`${invalidTriangles} invalid triangle(s)`)
  if (boundaryEdges) issues.push(`${boundaryEdges} boundary edge(s)`)
  if (nonManifoldEdges) issues.push(`${nonManifoldEdges} non-manifold edge(s)`)
  if (windingConflicts) issues.push(`${windingConflicts} winding conflict(s)`)
  if (degenerateFaces) issues.push(`${degenerateFaces} degenerate face(s)`)
  if (duplicateFaces) issues.push(`${duplicateFaces} duplicate face(s)`)
  if (!volumeValid && closedSurface) issues.push('enclosed volume could not be verified')

  return {
    triangleCount,
    vertexCount: position.count,
    boundaryEdges,
    nonManifoldEdges,
    windingConflicts,
    degenerateFaces,
    duplicateFaces,
    invalidTriangles,
    closedSurface,
    volumeValid,
    volume: volumeValid ? Math.abs(signedVolume) : null,
    thickness,
    issues,
    exportPreflight: closedSurface && volumeValid,
  }
}

function estimateWallThickness(geometry, { diagonal, maxSamples }) {
  const position = geometry.getAttribute('position')
  if (!position || position.count < 8) return { minimum: null, percentile10: null, average: null, samples: 0, sampledVertices: 0 }
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals()
  const normals = geometry.getAttribute('normal')
  const cellSize = Math.max(diagonal / 40, 1e-7)
  const cell = value => Math.floor(value / cellSize)
  const key = (x, y, z) => `${x},${y},${z}`
  const grid = new Map()

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i)
    const nx = normals.getX(i), ny = normals.getY(i), nz = normals.getZ(i)
    if (![x, y, z, nx, ny, nz].every(Number.isFinite)) continue
    const gridKey = key(cell(x), cell(y), cell(z))
    const bucket = grid.get(gridKey) || []
    bucket.push([x, y, z, nx, ny, nz])
    grid.set(gridKey, bucket)
  }

  const stride = Math.max(1, Math.ceil(position.count / maxSamples))
  const thicknesses = []
  const minDistance = diagonal * 1e-5
  const maxDistance = diagonal * 0.2
  for (let i = 0; i < position.count; i += stride) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i)
    const nx = normals.getX(i), ny = normals.getY(i), nz = normals.getZ(i)
    const normalLength = Math.hypot(nx, ny, nz)
    if (normalLength < 1e-8) continue
    const cx = cell(x), cy = cell(y), cz = cell(z)
    let nearest = Infinity

    for (let dx = -2; dx <= 2; dx += 1) {
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dz = -2; dz <= 2; dz += 1) {
          const bucket = grid.get(key(cx + dx, cy + dy, cz + dz))
          if (!bucket) continue
          for (const candidate of bucket) {
            const dot = (nx * candidate[3] + ny * candidate[4] + nz * candidate[5]) / (
              normalLength * Math.max(Math.hypot(candidate[3], candidate[4], candidate[5]), 1e-8)
            )
            if (dot > -0.35) continue
            const distance = Math.hypot(x - candidate[0], y - candidate[1], z - candidate[2])
            if (distance > minDistance && distance < nearest && distance <= maxDistance) nearest = distance
          }
        }
      }
    }
    if (Number.isFinite(nearest)) thicknesses.push(nearest)
  }

  if (!thicknesses.length) return { minimum: null, percentile10: null, average: null, samples: 0, sampledVertices: Math.ceil(position.count / stride) }
  thicknesses.sort((a, b) => a - b)
  const total = thicknesses.reduce((sum, value) => sum + value, 0)
  return {
    minimum: thicknesses[0],
    percentile10: thicknesses[Math.floor((thicknesses.length - 1) * 0.1)],
    average: total / thicknesses.length,
    samples: thicknesses.length,
    sampledVertices: Math.ceil(position.count / stride),
  }
}
