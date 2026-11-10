export function analyzeMesh(geometry) {
  const position = geometry.getAttribute('position')
  const index = geometry.getIndex()
  const triangleCount = index ? Math.floor(index.count / 3) : Math.floor(position.count / 3)
  const bounds = geometry.boundingBox
  const extent = bounds
    ? Math.max(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z, 1)
    : 1
  const tolerance = extent * 1e-7
  const edgeUse = new Map()
  let surfaceArea = 0
  let signedVolume = 0
  let degenerateFaces = 0

  const vertexKey = (vertexIndex) => {
    const x = Math.round(position.getX(vertexIndex) / tolerance)
    const y = Math.round(position.getY(vertexIndex) / tolerance)
    const z = Math.round(position.getZ(vertexIndex) / tolerance)
    return `${x},${y},${z}`
  }

  const addEdge = (a, b) => {
    const first = vertexKey(a)
    const second = vertexKey(b)
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
    const ax = position.getX(a), ay = position.getY(a), az = position.getZ(a)
    const bx = position.getX(b), by = position.getY(b), bz = position.getZ(b)
    const cx = position.getX(c), cy = position.getY(c), cz = position.getZ(c)
    const abx = bx - ax, aby = by - ay, abz = bz - az
    const acx = cx - ax, acy = cy - ay, acz = cz - az
    const crossX = aby * acz - abz * acy
    const crossY = abz * acx - abx * acz
    const crossZ = abx * acy - aby * acx
    const doubleArea = Math.hypot(crossX, crossY, crossZ)

    if (doubleArea <= extent * extent * 1e-12) degenerateFaces += 1
    surfaceArea += doubleArea * 0.5
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

  const closedEdgeCheck = boundaryEdges === 0 && nonManifoldEdges === 0 && windingConflicts === 0 && triangleCount > 0
  return {
    surfaceArea,
    volume: closedEdgeCheck ? Math.abs(signedVolume) : null,
    boundaryEdges,
    nonManifoldEdges,
    windingConflicts,
    degenerateFaces,
    closedEdgeCheck,
    triangleCount,
  }
}
