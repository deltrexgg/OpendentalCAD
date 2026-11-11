import * as THREE from 'three'

// Procedural four-cusp occlusal shaping aligned to the traced preparation frame.
// This is a visual design aid, not tooth-specific anatomy or a clinical design.
export function applyAnatomicalForm(geometry, options = {}) {
  const position = geometry?.getAttribute('position')
  const normal = geometry?.getAttribute('normal')
  const frame = geometry?.userData?.anatomyFrame
  if (!position || !normal || !frame?.center || !frame?.normal || !frame?.u || !frame?.v) {
    throw new Error('Generate a crown from a closed margin before applying anatomical shaping.')
  }
  const center = new THREE.Vector3().fromArray(frame.center)
  const axis = new THREE.Vector3().fromArray(frame.normal).normalize()
  const u = new THREE.Vector3().fromArray(frame.u).normalize()
  const v = new THREE.Vector3().fromArray(frame.v).normalize()
  const height = Math.max(Number(frame.height) || 0, 1e-6)
  const radius = Math.max(Number(frame.radius) || 0, 1e-6)
  const cuspHeight = THREE.MathUtils.clamp(Number(options.cuspHeight) || 0, 0, 0.14) * height
  const grooveDepth = THREE.MathUtils.clamp(Number(options.grooveDepth) || 0, 0, 0.07) * height
  const ridgeHeight = THREE.MathUtils.clamp(Number(options.ridgeHeight) || 0, 0, 0.08) * height
  const cuspOffset = radius * 0.34
  const cuspSpread = radius * 0.22
  const grooveWidth = radius * 0.075
  const ridgeWidth = radius * 0.095
  const cusps = [[-cuspOffset, -cuspOffset], [cuspOffset, -cuspOffset], [-cuspOffset, cuspOffset], [cuspOffset, cuspOffset]]
  const falloff = (distance, spread) => Math.exp(-(distance * distance) / (2 * spread * spread))
  let changed = 0

  for (let i = 0; i < position.count; i += 1) {
    const point = new THREE.Vector3().fromBufferAttribute(position, i)
    const vertexNormal = new THREE.Vector3().fromBufferAttribute(normal, i)
    const relative = point.clone().sub(center)
    const axialHeight = relative.dot(axis)
    if (axialHeight < height * 0.48 || vertexNormal.dot(axis) < 0.08) continue
    const x = relative.dot(u)
    const z = relative.dot(v)
    if (Math.hypot(x, z) > radius * 0.95) continue

    let displacement = 0
    for (const [cx, cz] of cusps) displacement += cuspHeight * falloff(Math.hypot(x - cx, z - cz), cuspSpread)

    const grooveAlongX = Math.exp(-(z * z) / (2 * grooveWidth * grooveWidth)) * Math.exp(-(x * x) / (2 * (radius * 0.58) ** 2))
    const grooveAlongZ = Math.exp(-(x * x) / (2 * grooveWidth * grooveWidth)) * Math.exp(-(z * z) / (2 * (radius * 0.58) ** 2))
    const centralPit = Math.exp(-(x * x + z * z) / (2 * (radius * 0.11) ** 2))
    displacement -= grooveDepth * (0.58 * grooveAlongX + 0.58 * grooveAlongZ + 0.35 * centralPit)

    for (const [cx, cz] of cusps) {
      const startX = cx * 0.12, startZ = cz * 0.12
      const dx = cx - startX, dz = cz - startZ
      const lengthSquared = dx * dx + dz * dz
      const t = THREE.MathUtils.clamp(((x - startX) * dx + (z - startZ) * dz) / lengthSquared, 0, 1)
      const distance = Math.hypot(x - (startX + dx * t), z - (startZ + dz * t))
      displacement += ridgeHeight * falloff(distance, ridgeWidth) * Math.sin(Math.PI * t)
    }

    if (Math.abs(displacement) < height * 1e-5) continue
    const moved = point.addScaledVector(axis, displacement)
    position.setXYZ(i, moved.x, moved.y, moved.z)
    changed += 1
  }

  if (changed) {
    position.needsUpdate = true
    geometry.computeVertexNormals()
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
  }
  return changed
}
