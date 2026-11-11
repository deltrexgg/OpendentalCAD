import * as THREE from 'three'

// Vertex-to-vertex proximity is a fast visual guide, not a triangle-surface
// distance solver. Results are expressed in the meshes' shared source units.
export function analyzeOcclusionClearance(crownGeometry, opposingGeometry, offset = [0, 0, 0], threshold = 0.1) {
  const crown = crownGeometry?.getAttribute('position')
  const opposing = opposingGeometry?.getAttribute('position')
  if (!crown || !opposing || !crown.count || !opposing.count) {
    throw new Error('Generate a crown and load an opposing scan before analysing clearance.')
  }

  const maxSamples = 50000
  const stride = Math.max(1, Math.ceil(opposing.count / maxSamples))
  const crownBounds = crownGeometry.boundingBox || new THREE.Box3().setFromBufferAttribute(crown)
  const opposingBounds = opposingGeometry.boundingBox || new THREE.Box3().setFromBufferAttribute(opposing)
  const combinedDiagonal = Math.max(crownBounds.getSize(new THREE.Vector3()).length(), opposingBounds.getSize(new THREE.Vector3()).length(), 1e-5)
  const cellSize = Math.max(Number(threshold) * 2, combinedDiagonal / 50, 1e-5)
  const ox = Number(offset[0]) || 0
  const oy = Number(offset[1]) || 0
  const oz = Number(offset[2]) || 0
  const grid = new Map()
  const key = (x, y, z) => `${x},${y},${z}`
  const cell = value => Math.floor(value / cellSize)

  for (let i = 0; i < opposing.count; i += stride) {
    const x = opposing.getX(i) + ox
    const y = opposing.getY(i) + oy
    const z = opposing.getZ(i) + oz
    const gridKey = key(cell(x), cell(y), cell(z))
    const bucket = grid.get(gridKey) || []
    bucket.push([x, y, z])
    grid.set(gridKey, bucket)
  }

  const colors = new Float32Array(crown.count * 3)
  const distances = []
  const searchRadius = 4
  const nearColor = [0.929, 0.443, 0.427]
  const transitionColor = [0.914, 0.765, 0.431]
  const clearColor = [0.388, 0.788, 0.655]
  const unknownColor = [0.408, 0.455, 0.486]
  let contacts = 0
  let minimum = Infinity
  let total = 0
  const thresholdValue = Math.max(Number(threshold) || 0, 0)

  for (let i = 0; i < crown.count; i += 1) {
    const x = crown.getX(i), y = crown.getY(i), z = crown.getZ(i)
    const cx = cell(x), cy = cell(y), cz = cell(z)
    let nearestSquared = Infinity

    for (let dx = -searchRadius; dx <= searchRadius; dx += 1) {
      for (let dy = -searchRadius; dy <= searchRadius; dy += 1) {
        for (let dz = -searchRadius; dz <= searchRadius; dz += 1) {
          const bucket = grid.get(key(cx + dx, cy + dy, cz + dz))
          if (!bucket) continue
          for (const point of bucket) {
            const px = x - point[0], py = y - point[1], pz = z - point[2]
            const squared = px * px + py * py + pz * pz
            if (squared < nearestSquared) nearestSquared = squared
          }
        }
      }
    }

    const distance = Number.isFinite(nearestSquared) ? Math.sqrt(nearestSquared) : null
    let color = unknownColor
    if (distance !== null) {
      distances.push(distance)
      total += distance
      minimum = Math.min(minimum, distance)
      if (distance <= thresholdValue) { contacts += 1; color = nearColor }
      else if (distance <= thresholdValue * 2) color = transitionColor
      else color = clearColor
    }
    colors[i * 3] = color[0]
    colors[i * 3 + 1] = color[1]
    colors[i * 3 + 2] = color[2]
  }

  crownGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  crownGeometry.attributes.color.needsUpdate = true
  crownGeometry.computeBoundingSphere()
  return {
    minimum: Number.isFinite(minimum) ? minimum : null,
    average: distances.length ? total / distances.length : null,
    nearContactVertices: contacts,
    sampledOpposingVertices: Math.ceil(opposing.count / stride),
    crownVertices: crown.count,
    threshold: thresholdValue,
    evaluatedVertices: distances.length,
    unmatchedVertices: crown.count - distances.length,
  }
}

export function clearOcclusionColors(geometry) {
  if (geometry?.getAttribute('color')) geometry.deleteAttribute('color')
}
