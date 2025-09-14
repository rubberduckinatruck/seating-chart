
export function snap(n: number, step = 16) { return Math.round(n / step) * step }

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

export interface Rect { x: number; y: number; w: number; h: number }

export function intersects(a: Rect, b: Rect): boolean {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y)
}
