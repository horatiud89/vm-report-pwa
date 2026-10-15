import type { Stroke } from '@shared/types';

/** A stroke as the `points` attribute of an SVG polyline: "x0,y0 x1,y1 …" (a trailing x without its y is dropped). */
export function strokesToPolylinePoints(s: Stroke): string {
  const pairs: string[] = [];
  for (let i = 0; i + 1 < s.points.length; i += 2) pairs.push(`${s.points[i]},${s.points[i + 1]}`);
  return pairs.join(' ');
}
