import type { Stroke } from '@shared/types';

/** What the server accepts in one piece of feedback (functions/src/review.ts). */
export const MAX_STROKES = 50;
export const MAX_STROKE_VALUES = 2000;

/** A stroke as the `points` attribute of an SVG polyline: "x0,y0 x1,y1 …" (a trailing x without its y is dropped). */
export function strokesToPolylinePoints(s: Stroke): string {
  const pairs: string[] = [];
  for (let i = 0; i + 1 < s.points.length; i += 2) pairs.push(`${s.points[i]},${s.points[i + 1]}`);
  return pairs.join(' ');
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** A screen point as fractions (0..1, clamped) of a box, e.g. the displayed photo. A box without size gives 0,0. */
export function normalizePoint(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): [number, number] {
  if (!(rect.width > 0) || !(rect.height > 0)) return [0, 0];
  return [clamp01((clientX - rect.left) / rect.width), clamp01((clientY - rect.top) / rect.height)];
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * `points` with (x, y) added, rounded to 3 decimals. A point closer than `minDist` to the last one is skipped
 * (the same list comes back), so a slow finger does not pile up points. `points` itself is never changed.
 */
export function appendPoint(points: number[], x: number, y: number, minDist = 0.005): number[] {
  if (points.length >= 2) {
    const dx = x - (points[points.length - 2] as number);
    const dy = y - (points[points.length - 1] as number);
    if (Math.hypot(dx, dy) < minDist) return points;
  }
  return [...points, round3(x), round3(y)];
}
