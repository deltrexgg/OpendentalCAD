import * as THREE from 'three'

// Sampled point-to-triangle proximity on the crown's occlusal outer surface.
// This is an unsigned screening estimate, not signed collision or force analysis.
export function analyzeOcclusionClearance(crownGeometry, opposingGeometry, offset = [0, 0, 0], threshold = 0.1, options = {}) {
  const crown = crownGeometry?.getAttribute('position')
  const crownNormals = crownGeometry?.getAttribute('normal')
  const opposing = opposingGeometry?.getAttribute('position')
  const frame = crownGeometry?.userData?.anatomyFrame
  if (!crown || !crownNormals || !opposing || !frame?.center || !frame?.normal) {
    throw new Error('Generate a crown with anatomy-frame data and load an opposing scan before analysing clearance.')
  }

  const index = opposingGeometry.getIndex()
  const triangleCount = index ? Math.floor(index.count / 3) : Math.floor(opposing.count / 3)
  if (!triangleCount) throw new Error('The opposing scan does not contain usable triangles.')
  const crownBounds = crownGeometry.boundingBox || new THREE.Box3().setFromBufferAttribute(crown)
  const opposingBounds = opposingGeometry.boundingBox || new THREE.Box3().setFromBufferAttribute(opposing)
  const diagonal = Math.max(
    crownBounds.getSize(new THREE.Vector3()).length(),
    opposingBounds.getSize(new THREE.Vector3()).length(),
    1e-5
  )
  const thresholdValue = Math.max(Number(threshold) || 0, 0)
  const cellSize = Math.max(diagonal / 32, thresholdValue * 2, 1e-5)
  const cell = value => Math.floor(value / cellSize)
  const key = (x, y, z) => `${x},${y},${z}`
  const ox = Number(offset[0]) || 0
  const oy = Number(offset[1]) || 0
  const oz = Number(offset[2]) || 0
  const maxTriangles = options.maxTriangles || 40000
  const triangleStride = Math.max(1, Math.ceil(triangleCount / maxTriangles))
  const grid = new Map()
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  let sampledOpposingTriangles = 0

  for (let face = 0; face < triangleCount; face += triangleStride) {
    const ia = index ? index.getX(face * 3) : face * 3
    const ib = index ? index.getX(face * 3 + 1) : face * 3 + 1
    const ic = index ? index.getX(face * 3 + 2) : face * 3 + 2
    if ([ia, ib, ic].some(value => !Number.isInteger(value) || value < 0 || value >= opposing.count)) continue
    a.fromBufferAttribute(opposing, ia).add(new THREE.Vector3(ox, oy, oz))
    b.fromBufferAttribute(opposing, ib).add(new THREE.Vector3(ox, oy, oz))
    c.fromBufferAttribute(opposing, ic).add(new THREE.Vector3(ox, oy, oz))
    if (![a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z].every(Number.isFinite)) continue
    const cx = (a.x + b.x + c.x) / 3
    const cy = (a.y + b.y + c.y) / 3
    const cz = (a.z + b.z + c.z) / 3
    const gridKey = key(cell(cx), cell(cy), cell(cz))
    const bucket = grid.get(gridKey) || []
    bucket.push([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z])
    grid.set(gridKey, bucket)
    sampledOpposingTriangles += 1
  }
  if (!sampledOpposingTriangles) throw new Error('No valid opposing-scan triangles were available for clearance analysis.')

  const center = new THREE.Vector3().fromArray(frame.center)
  const axis = new THREE.Vector3().fromArray(frame.normal).normalize()
  const height = Math.max(Number(frame.height) || 0, 1e-6)
  let occlusalCount = 0
  for (let i = 0; i < crown.count; i += 1) {
    const point = new THREE.Vector3().fromBufferAttribute(crown, i)
    const normal = new THREE.Vector3().fromBufferAttribute(crownNormals, i)
    if (point.clone().sub(center).dot(axis) > height * 0.48 && normal.dot(axis) > 0.08) occlusalCount += 1
  }
  if (!occlusalCount) throw new Error('No suitable outer occlusal vertices were found on the crown.')
  const maxSamples = options.maxSamples || 12000
  const sampleStride = Math.max(1, Math.ceil(occlusalCount / maxSamples))
  const colors = new Float32Array(crown.count * 3)
  const unknownColor = [0.408, 0.455, 0.486]
  const nearColor = [0.929, 0.443, 0.427]
  const transitionColor = [0.914, 0.765, 0.431]
  const clearColor = [0.388, 0.788, 0.655]
  for (let i = 0; i < crown.count; i += 1) {
    colors[i * 3] = unknownColor[0]
    colors[i * 3 + 1] = unknownColor[1]
    colors[i * 3 + 2] = unknownColor[2]
  }

  const query = new THREE.Vector3()
  const closest = new THREE.Vector3()
  const triangle = new THREE.Triangle()
  const distances = []
  let occlusalIndex = 0
  let nearContactSamples = 0
  let unmatchedVertices = 0

  for (let i = 0; i < crown.count; i += 1) {
    query.fromBufferAttribute(crown, i)
    const normal = new THREE.Vector3().fromBufferAttribute(crownNormals, i)
    if (query.clone().sub(center).dot(axis) <= height * 0.48 || normal.dot(axis) <= 0.08) continue
    const currentSample = occlusalIndex++
    if (currentSample % sampleStride !== 0) continue
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

    if (!Number.isFinite(nearestSquared)) {
      unmatchedVertices += 1
      continue
    }
    const distance = Math.sqrt(nearestSquared)
    distances.push(distance)
    let color = clearColor
    if (distance <= thresholdValue) {
      nearContactSamples += 1
      color = nearColor
    } else if (distance <= thresholdValue * 2) color = transitionColor
    colors[i * 3] = color[0]
    colors[i * 3 + 1] = color[1]
    colors[i * 3 + 2] = color[2]
  }

  if (!distances.length) throw new Error('No crown occlusal samples could be compared. Check opposing-scan alignment and overlap.')
  distances.sort((left, right) => left - right)
  const total = distances.reduce((sum, value) => sum + value, 0)
  crownGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  crownGeometry.attributes.color.needsUpdate = true
  crownGeometry.computeBoundingSphere()
  return {
    minimum: distances[0],
    average: total / distances.length,
    percentile95: distances[Math.floor((distances.length - 1) * 0.95)],
    nearContactSamples,
    sampledOpposingTriangles,
    crownOcclusalSamples: Math.ceil(occlusalCount / sampleStride),
    evaluatedVertices: distances.length,
    unmatchedVertices,
    threshold: thresholdValue,
  }
}

export function clearOcclusionColors(geometry) {
  if (geometry?.getAttribute('color')) geometry.deleteAttribute('color')
}
