import type { Stroke } from '@shared/types';
import { STROKE_COLOR } from '../review/strokes';

/** One stroke as it is drawn: a line through points, or a dot for a stroke that never moved. Pixels of the photo. */
export type StrokeShape =
  | { kind: 'line'; points: Array<[number, number]> }
  | { kind: 'dot'; x: number; y: number };

/** Line width on a photo of this size: 0.6% of the long side, but at least 3 px. */
export function strokeWidth(width: number, height: number): number {
  return Math.max(3, 0.006 * Math.max(width, height));
}

/**
 * The strokes (flat 0..1 points of the photo) as shapes in pixels of a width x height photo, one per stroke.
 * A tap is stored as one point twice, a zero-length segment that some canvases draw as nothing, so a stroke that
 * never leaves its first point becomes a dot; repeated points inside a longer stroke are dropped. A trailing x
 * without its y and points that are not numbers are ignored.
 */
export function strokeShapes(strokes: Stroke[], width: number, height: number): StrokeShape[] {
  const shapes: StrokeShape[] = [];
  for (const stroke of strokes) {
    const points: Array<[number, number]> = [];
    for (let i = 0; i + 1 < stroke.points.length; i += 2) {
      const x = (stroke.points[i] as number) * width;
      const y = (stroke.points[i + 1] as number) * height;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const last = points.at(-1);
      if (!last || last[0] !== x || last[1] !== y) points.push([x, y]);
    }
    const [first] = points;
    if (!first) continue;
    shapes.push(points.length === 1 ? { kind: 'dot', x: first[0], y: first[1] } : { kind: 'line', points });
  }
  return shapes;
}

/** Draws the strokes red on a canvas of the photo's size, round like the 4 px lines on screen; a dot is as wide as the line. */
export function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], width: number, height: number): void {
  const lineWidth = strokeWidth(width, height);
  ctx.strokeStyle = STROKE_COLOR;
  ctx.fillStyle = STROKE_COLOR;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const shape of strokeShapes(strokes, width, height)) {
    ctx.beginPath();
    if (shape.kind === 'dot') {
      ctx.arc(shape.x, shape.y, lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      shape.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.stroke();
    }
  }
}
