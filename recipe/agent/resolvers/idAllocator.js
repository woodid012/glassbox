/**
 * ID Allocator - tracks used IDs and allocates unique ones.
 */
export class IdAllocator {
  constructor() {
    this.usedIds = new Set()
  }

  /** Register an ID as used */
  register(id) {
    this.usedIds.add(id)
  }

  /** Register multiple IDs */
  registerAll(ids) {
    for (const id of ids) this.usedIds.add(id)
  }

  /** Allocate a new unique ID starting from `start` */
  allocate(start = 1) {
    let id = start
    while (this.usedIds.has(id)) id++
    this.usedIds.add(id)
    return id
  }

  /** Check if an ID is used */
  isUsed(id) {
    return this.usedIds.has(id)
  }
}
