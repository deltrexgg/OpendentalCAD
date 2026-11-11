import * as THREE from 'three'

function midpoint(a, b) { return new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5) }

export function createSculptableGeometry(source, levels = 2) {
  const sourcePosition = source.getAttribute('position')
  const positions = Array.from({ length: sourcePosition.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(sourcePosition, i))
  let indices = source.index ? Array.from(source.index.array) : Array.from({ length: sourcePosition.count }, (_, i) => i)
  for (let level = 0; level < levels; level += 1) {
    const nextIndices = [], edgeCache = new Map()
    const midpointIndex = (a, b) => {
      const low = Math.min(a, b), high = Math.max(a, b), key = `${low}:${high}`
      if (edgeCache.has(key)) return edgeCache.get(key)
      const index = positions.length
      positions.push(midpoint(positions[a], positions[b]))
      edgeCache.set(key, index)
      return index
    }
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i], b = indices[i + 1], c = indices[i + 2]
      const ab = midpointIndex(a, b), bc = midpointIndex(b, c), ca = midpointIndex(c, a)
      nextIndices.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca)
    }
    indices = nextIndices
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions.flatMap(point => point.toArray()), 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  const adjacency = Array.from({ length: positions.length }, () => new Set())
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i], b = indices[i + 1], c = indices[i + 2]
    adjacency[a].add(b); adjacency[a].add(c)
    adjacency[b].add(a); adjacency[b].add(c)
    adjacency[c].add(a); adjacency[c].add(b)
  }
  geometry.userData.sculptAdjacency = adjacency
  return geometry
}

export function sculptCrownGeometry(geometry, center, brushNormal, radius, strength, mode) {
  const position = geometry?.getAttribute('position'), normal = geometry?.getAttribute('normal')
  if (!position || !normal) return 0
  const safeRadius = Math.max(Number(radius) || 0, 1e-5)
  const safeStrength = THREE.MathUtils.clamp(Number(strength) || 0, 0, 1)
  const adjacency = geometry.userData.sculptAdjacency
  const original = mode === 'smooth' ? Array.from({ length: position.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(position, i)) : null
  const changes = []
  for (let i = 0; i < position.count; i += 1) {
    const vertex = new THREE.Vector3().fromBufferAttribute(position, i)
    const distance = vertex.distanceTo(center)
    if (distance >= safeRadius) continue
    const vertexNormal = new THREE.Vector3().fromBufferAttribute(normal, i)
    if (vertexNormal.dot(brushNormal) < 0.2) continue
    const t = 1 - distance / safeRadius, falloff = t * t * (3 - 2 * t), amount = safeStrength * falloff
    if (mode === 'smooth' && adjacency?.[i]?.size) {
      const average = new THREE.Vector3()
      adjacency[i].forEach(neighbor => average.add(original[neighbor]))
      average.multiplyScalar(1 / adjacency[i].size)
      vertex.lerp(average, amount)
    } else {
      vertex.addScaledVector(vertexNormal, (mode === 'lower' ? -1 : 1) * amount * safeRadius * 0.22)
    }
    changes.push([i, vertex])
  }
  changes.forEach(([index, vertex]) => position.setXYZ(index, vertex.x, vertex.y, vertex.z))
  if (changes.length) {
    position.needsUpdate = true
    geometry.computeVertexNormals()
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
  }
  return changes.length
}
