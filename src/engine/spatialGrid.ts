export interface SpatialEntity {
  id: string;
  x: number;
  y: number;
  radius: number;
}

const CELL_OFFSET = 32768;
const CELL_STRIDE = 65536;

export class SpatialGrid<T extends SpatialEntity> {
  private readonly cellSize: number;
  private readonly invCellSize: number;
  private readonly cells = new Map<number, T[]>();

  constructor(cellSize = 96) {
    if (cellSize <= 0) {
      throw new Error('SpatialGrid cellSize must be positive');
    }
    this.cellSize = cellSize;
    this.invCellSize = 1 / cellSize;
  }

  clear(): void {
    this.cells.clear();
  }

  insert(item: T): void {
    const r = Math.max(0, item.radius);
    const minCx = Math.floor((item.x - r) * this.invCellSize);
    const maxCx = Math.floor((item.x + r) * this.invCellSize);
    const minCy = Math.floor((item.y - r) * this.invCellSize);
    const maxCy = Math.floor((item.y + r) * this.invCellSize);

    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const key = this.cellKey(cx, cy);
        let bucket = this.cells.get(key);
        if (!bucket) {
          bucket = [];
          this.cells.set(key, bucket);
        }
        bucket.push(item);
      }
    }
  }

  queryRadius(x: number, y: number, radius: number): T[] {
    if (radius < 0) return [];

    const minCx = Math.floor((x - radius) * this.invCellSize);
    const maxCx = Math.floor((x + radius) * this.invCellSize);
    const minCy = Math.floor((y - radius) * this.invCellSize);
    const maxCy = Math.floor((y + radius) * this.invCellSize);

    const results: T[] = [];
    const seen = new Set<string>();

    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const bucket = this.cells.get(this.cellKey(cx, cy));
        if (!bucket) continue;

        for (let i = 0; i < bucket.length; i++) {
          const item = bucket[i];
          if (seen.has(item.id)) continue;

          const dx = item.x - x;
          const dy = item.y - y;
          const maxDist = radius + Math.max(0, item.radius);
          if (dx * dx + dy * dy <= maxDist * maxDist) {
            seen.add(item.id);
            results.push(item);
          }
        }
      }
    }

    return results;
  }

  getCellSize(): number {
    return this.cellSize;
  }

  private cellKey(cx: number, cy: number): number {
    return (cx + CELL_OFFSET) * CELL_STRIDE + (cy + CELL_OFFSET);
  }
}
