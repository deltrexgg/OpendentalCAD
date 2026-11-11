import * as THREE from 'three'

function getMarginFrame(points, referenceCenter) {
  if (!Array.isArray(points) || points.length < 8) {
    throw new Error('Trace at least 8 margin points before generating a restoration.')
  }
  const center = points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / points.length)
  const normal = new THREE.Vector3()
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i].clone().sub(center)
    const next = points[(i + 1) % points.length].clone().sub(center)
    normal.add(new THREE.Vector3().crossVectors(current, next))
  }
  if (normal.lengthSq() < 1e-10) throw new Error('The margin points do not define a stable plane.')
  normal.normalize()
  if (referenceCenter && normal.dot(center.clone().sub(referenceCenter)) < 0) normal.negate()

  const radial = points.map(point => {
    const vector = point.clone().sub(center)
    vector.addScaledVector(normal, -vector.dot(normal))
    return vector
  })
  const averageRadius = radial.reduce((sum, vector) => sum + vector.length(), 0) / radial.length
  if (!Number.isFinite(averageRadius) || averageRadius < 1e-5) {
    throw new Error('The margin curve is too small or degenerate.')
  }
  return { center, normal, radial, averageRadius }
}

function ringFromFrame(frame, scale, height) {
  return frame.radial.map(vector => frame.center.clone()
    .addScaledVector(vector, scale)
    .addScaledVector(frame.normal, height))
}

function addRingFaces(indices, firstStart, secondStart, count, reverse = false) {
  for (let i = 0; i < count; i += 1) {
    const next = (i + 1) % count
    const a = firstStart + i
    const b = firstStart + next
    const c = secondStart + next
    const d = secondStart + i
    if (reverse) indices.push(a, c, b, a, d, c)
    else indices.push(a, b, c, a, c, d)
  }
}

function geometryFromRings(rings, capStart = false, capEnd = false) {
  const positions = []
  const indices = []
  const count = rings[0].length
  rings.forEach(ring => ring.forEach(point => positions.push(point.x, point.y, point.z)))
  for (let ring = 0; ring < rings.length - 1; ring += 1) {
    addRingFaces(indices, ring * count, (ring + 1) * count, count)
  }
  const addCap = (ringIndex, reverse) => {
    const center = rings[ringIndex].reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / count)
    const centerIndex = positions.length / 3
    positions.push(center.x, center.y, center.z)
    const start = ringIndex * count
    for (let i = 0; i < count; i += 1) {
      const next = (i + 1) % count
      if (reverse) indices.push(centerIndex, start + next, start + i)
      else indices.push(centerIndex, start + i, start + next)
    }
  }
  if (capStart) addCap(0, true)
  if (capEnd) addCap(rings.length - 1, false)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

export function generateDieGeometry(points, depth, referenceCenter) {
  const frame = getMarginFrame(points, referenceCenter)
  const safeDepth = Math.max(Number(depth) || 0, frame.averageRadius * 0.1)
  const rings = [
    ringFromFrame(frame, 0.92, -safeDepth),
    ringFromFrame(frame, 0.97, -safeDepth * 0.55),
    ringFromFrame(frame, 1, 0),
  ]
  return geometryFromRings(rings, true, true)
}

export function generateCrownGeometry(points, cementGap, thickness, height, referenceCenter) {
  const frame = getMarginFrame(points, referenceCenter)
  const gap = Math.max(0, Number(cementGap) || 0)
  const wall = Math.max(Number(thickness) || 0, frame.averageRadius * 0.025)
  const crownHeight = Math.max(Number(height) || 0, frame.averageRadius * 0.2)
  const gapScale = gap / frame.averageRadius
  const wallScale = wall / frame.averageRadius

  const outerRings = [
    ringFromFrame(frame, 1 + gapScale + wallScale, 0),
    ringFromFrame(frame, 1.08 + gapScale + wallScale, crownHeight * 0.28),
    ringFromFrame(frame, 1.13 + gapScale + wallScale, crownHeight * 0.62),
    ringFromFrame(frame, 0.78 + wallScale * 0.25, crownHeight * 0.9),
    ringFromFrame(frame, 0.12, crownHeight),
  ]
  const innerRings = [
    ringFromFrame(frame, 1 + gapScale, 0),
    ringFromFrame(frame, 1.035 + gapScale, crownHeight * 0.28),
    ringFromFrame(frame, 1.04 + gapScale, crownHeight * 0.58),
    ringFromFrame(frame, 0.7, crownHeight * 0.86),
    ringFromFrame(frame, 0.06, crownHeight * 0.94),
  ]

  // Outer wall, inner intaglio wall (reversed), and the open-margin rim.
  const positions = []
  const indices = []
  const count = points.length
  const allRings = [...outerRings, ...innerRings.slice().reverse()]
  allRings.forEach(ring => ring.forEach(point => positions.push(point.x, point.y, point.z)))
  for (let ring = 0; ring < outerRings.length - 1; ring += 1) {
    addRingFaces(indices, ring * count, (ring + 1) * count, count)
  }
  const innerStart = outerRings.length * count
  for (let ring = 0; ring < innerRings.length - 1; ring += 1) {
    addRingFaces(indices, innerStart + ring * count, innerStart + (ring + 1) * count, count, true)
  }
  addRingFaces(indices, 0, innerStart + (innerRings.length - 1) * count, count, true)

  // Join the outer and inner crown surfaces across the occlusal roof.
  addRingFaces(indices, (outerRings.length - 1) * count, innerStart, count)

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  const intaglioMask = new Float32Array(positions.length / 3)
  intaglioMask.fill(1, outerRings.length * count)
  geometry.setAttribute('intaglioMask', new THREE.BufferAttribute(intaglioMask, 1))
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  geometry.userData.anatomyFrame = {
    center: frame.center.toArray(),
    normal: frame.normal.toArray(),
    u: (frame.radial.find(vector => vector.lengthSq() > 1e-12) || new THREE.Vector3(1, 0, 0)).clone().normalize().toArray(),
    v: new THREE.Vector3().crossVectors(frame.normal, frame.radial.find(vector => vector.lengthSq() > 1e-12) || new THREE.Vector3(1, 0, 0)).normalize().toArray(),
    height: crownHeight,
    radius: frame.averageRadius,
  }
  return geometry
}
