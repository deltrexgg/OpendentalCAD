import * as THREE from 'three'

// Suggests a refined margin by snapping manually traced seed points toward
// nearby high-curvature mesh regions. This is an assistive geometric heuristic,
// not an autonomous or clinically validated margin detector.
export function suggestMarginRefinement(geometry, seedPoints) {
  if (!geometry?.getAttribute('position')) throw new Error('Load a mesh before refining the margin.')
  if (!Array.isArray(seedPoints) || seedPoints.length < 8) {
    throw new Error('Trace at least 8 seed points before requesting margin suggestions.')
  }

  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  if (!normal) throw new Error('The mesh needs vertex normals before margin refinement.')

  const bounds = geometry.boundingBox || new THREE.Box3().setFromBufferAttribute(position)
  const diagonal = Math.max(bounds.getSize(new THREE.Vector3()).length(), 1e-8)
  const weldTolerance = diagonal * 1e-6
  const vertices = []
  const normalSums = []
  const weldMap = new Map()
  const triangleIndices = []
  const keyFor = (x, y, z) => `${Math.round(x / weldTolerance)},${Math.round(y / weldTolerance)},${Math.round(z / weldTolerance)}`

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i)
    const key = keyFor(x, y, z)
    let id = weldMap.get(key)
    if (id === undefined) {
      id = vertices.length
      weldMap.set(key, id)
      vertices.push(new THREE.Vector3(x, y, z))
      normalSums.push(new THREE.Vector3())
    }
    normalSums[id].add(new THREE.Vector3(normal.getX(i), normal.getY(i), normal.getZ(i)))
    triangleIndices.push(id)
  }

  const index = geometry.index
  const faces = index ? index.count / 3 : Math.floor(position.count / 3)
  if (!faces) throw new Error('The mesh does not contain triangular faces.')

  const adjacency = Array.from({ length: vertices.length }, () => new Set())
  for (let face = 0; face < faces; face += 1) {
    const a = index ? index.getX(face * 3) : face * 3
    const b = index ? index.getX(face * 3 + 1) : face * 3 + 1
    const c = index ? index.getX(face * 3 + 2) : face * 3 + 2
    const ia = index ? a : triangleIndices[a]
    const ib = index ? b : triangleIndices[b]
    const ic = index ? c : triangleIndices[c]
    if (ia === ib || ib === ic || ic === ia) continue
    adjacency[ia].add(ib); adjacency[ia].add(ic)
    adjacency[ib].add(ia); adjacency[ib].add(ic)
    adjacency[ic].add(ia); adjacency[ic].add(ib)
  }

  const vertexNormals = normalSums.map(value => value.lengthSq() ? value.normalize() : new THREE.Vector3())
  const curvature = new Float32Array(vertices.length)
  for (let i = 0; i < vertices.length; i += 1) {
    const neighbors = adjacency[i]
    if (!neighbors.size || !vertexNormals[i].lengthSq()) continue
    let total = 0, count = 0
    for (const neighbor of neighbors) {
      if (!vertexNormals[neighbor].lengthSq()) continue
      total += Math.acos(THREE.MathUtils.clamp(vertexNormals[i].dot(vertexNormals[neighbor]), -1, 1))
      count += 1
    }
    if (count) curvature[i] = total / count
  }

  const searchRadius = diagonal * 0.045
  const minimumCurvature = 0.025
  const used = new Set()
  let matched = 0
  let confidenceTotal = 0
  const refinedPoints = seedPoints.map(seed => {
    let bestIndex = -1
    let bestScore = -Infinity
    for (let i = 0; i < vertices.length; i += 1) {
      if (used.has(i) || curvature[i] < minimumCurvature) continue
      const distance = vertices[i].distanceTo(seed)
      if (distance > searchRadius) continue
      const proximity = 1 - distance / searchRadius
      const score = curvature[i] * (0.35 + proximity * 0.65)
      if (score > bestScore) { bestScore = score; bestIndex = i }
    }
    if (bestIndex < 0) return seed.clone()
    used.add(bestIndex)
    matched += 1
    confidenceTotal += curvature[bestIndex]
    return vertices[bestIndex].clone()
  })

  const meanCurvature = matched ? confidenceTotal / matched : 0
  const confidence = Math.round(THREE.MathUtils.clamp(meanCurvature / 0.35, 0, 1) * 100)
  return { points: refinedPoints, matched, total: seedPoints.length, confidence, searchRadius }
}
