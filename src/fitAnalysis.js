import * as THREE from 'three'

// Sampled intaglio-to-preparation surface proximity. This is a geometric
// screening estimate, not signed collision detection or a validated clinical fit.
export function analyzeRestorationFit(crownGeometry, preparationGeometry, tolerance = 0.1, options = {}) {
  const crownPosition = crownGeometry?.getAttribute('position')
  const intaglioMask = crownGeometry?.getAttribute('intaglioMask')
  const preparationPosition = preparationGeometry?.getAttribute('position')
  if (!crownPosition || !intaglioMask || !preparationPosition) {
    throw new Error('Generate a crown with intaglio data and load the preparation scan before checking fit.')
  }

  const preparationIndex = preparationGeometry.getIndex()
  const triangleCount = preparationIndex
    ? Math.floor(preparationIndex.count / 3)
    : Math.floor(preparationPosition.count / 3)
  if (!triangleCount) throw new Error('The preparation scan does not contain usable triangles.')

  preparationGeometry.computeBoundingBox()
  const bounds = preparationGeometry.boundingBox
  if (!bounds || bounds.isEmpty()) throw new Error('The preparation scan has invalid bounds.')
  const center = bounds.getCenter(new THREE.Vector3())
  const diagonal = Math.max(bounds.getSize(new THREE.Vector3()).length(), 1e-6)
  const cellSize = Math.max(diagonal / 32, 1e-5)
  const cell = value => Math.floor(value / cellSize)
  const key = (x, y, z) => `${x},${y},${z}`
  const maxTriangles = options.maxTriangles || 30000
  const triangleStride = Math.max(1, Math.ceil(triangleCount / maxTriangles))
  const grid = new Map()
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  let indexedTriangles = 0

  for (let face = 0; face < triangleCount; face += triangleStride) {
    const ia = preparationIndex ? preparationIndex.getX(face * 3) : face * 3
    const ib = preparationIndex ? preparationIndex.getX(face * 3 + 1) : face * 3 + 1
    const ic = preparationIndex ? preparationIndex.getX(face * 3 + 2) : face * 3 + 2
    if ([ia, ib, ic].some(index => !Number.isInteger(index) || index < 0 || index >= preparationPosition.count)) continue
    a.fromBufferAttribute(preparationPosition, ia).sub(center)
    b.fromBufferAttribute(preparationPosition, ib).sub(center)
    c.fromBufferAttribute(preparationPosition, ic).sub(center)
    if (![a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z].every(Number.isFinite)) continue
    const cx = (a.x + b.x + c.x) / 3
    const cy = (a.y + b.y + c.y) / 3
    const cz = (a.z + b.z + c.z) / 3
    const gridKey = key(cell(cx), cell(cy), cell(cz))
    const bucket = grid.get(gridKey) || []
    bucket.push([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z])
    grid.set(gridKey, bucket)
    indexedTriangles += 1
  }
  if (!indexedTriangles) throw new Error('No valid preparation triangles were available for fit analysis.')

  const maxSamples = options.maxSamples || 6000
  let intaglioCount = 0
  for (let i = 0; i < intaglioMask.count; i += 1) {
    if (intaglioMask.getX(i) >= 0.98) intaglioCount += 1
  }
  if (!intaglioCount) throw new Error('The generated crown has no identifiable intaglio surface. Regenerate the crown and try again.')
  const sampleStride = Math.max(1, Math.ceil(intaglioCount / maxSamples))
  const distances = []
  const query = new THREE.Vector3()
  const closest = new THREE.Vector3()
  const triangle = new THREE.Triangle(a, b, c)
  const toleranceValue = Math.max(Number(tolerance) || 0, 0)
  let intaglioIndex = 0
  let unmatchedSamples = 0

  for (let i = 0; i < crownPosition.count; i += 1) {
    if (intaglioMask.getX(i) < 0.98) continue
    const sampleIndex = intaglioIndex++
    if (sampleIndex % sampleStride !== 0) continue
    query.fromBufferAttribute(crownPosition, i)
    const cx = cell(query.x), cy = cell(query.y), cz = cell(query.z)
    let nearestSquared = Infinity

    for (let radius = 2; radius <= 3 && !Number.isFinite(nearestSquared); radius += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        for (let dy = -radius; dy <= radius; dy += 1) {
          for (let dz = -radius; dz <= radius; dz += 1) {
            const bucket = grid.get(key(cx + dx, cy + dy, cz + dz))
            if (!bucket) continue
            for (const values of bucket) {
              a.set(values[0], values[1], values[2])
              b.set(values[3], values[4], values[5])
              c.set(values[6], values[7], values[8])
              triangle.set(a, b, c)
              triangle.closestPointToPoint(query, closest)
              const squared = query.distanceToSquared(closest)
              if (squared < nearestSquared) nearestSquared = squared
            }
          }
        }
      }
    }

    if (Number.isFinite(nearestSquared)) distances.push(Math.sqrt(nearestSquared))
    else unmatchedSamples += 1
  }

  if (!distances.length) throw new Error('No intaglio samples could be compared with the preparation scan. Check scan alignment and overlap.')
  distances.sort((left, right) => left - right)
  const total = distances.reduce((sum, value) => sum + value, 0)
  const withinTolerance = distances.filter(value => value <= toleranceValue).length
  return {
    minimum: distances[0],
    average: total / distances.length,
    median: distances[Math.floor((distances.length - 1) * 0.5)],
    percentile95: distances[Math.floor((distances.length - 1) * 0.95)],
    maximum: distances[distances.length - 1],
    withinTolerance,
    outsideTolerance: distances.length - withinTolerance,
    withinTolerancePercent: (withinTolerance / distances.length) * 100,
    tolerance: toleranceValue,
    samples: distances.length,
    sampledIntaglioVertices: Math.ceil(intaglioCount / sampleStride),
    sampledPreparationTriangles: indexedTriangles,
    unmatchedSamples,
  }
}
