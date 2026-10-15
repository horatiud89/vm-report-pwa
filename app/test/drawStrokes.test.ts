import { describe, expect, test, vi } from 'vitest';
import { STROKE_COLOR } from '../src/review/strokes';
import { drawStrokes, strokeShapes, strokeWidth } from '../src/pdf/drawStrokes';

describe('strokeWidth', () => {
  test('is 0.6% of the long side of the photo', () => {
    expect(strokeWidth(1000, 750)).toBeCloseTo(6, 10);
    expect(strokeWidth(750, 1000)).toBeCloseTo(6, 10);
  });

  test('is never thinner than 3 px', () => {
    expect(strokeWidth(400, 300)).toBe(3);
    expect(strokeWidth(1, 1)).toBe(3);
  });
});

describe('strokeShapes', () => {
  test('scales the 0..1 points to pixels of the photo', () => {
    expect(strokeShapes([{ points: [0.1, 0.2, 0.5, 0.5, 1, 1] }], 1000, 500)).toEqual([
      { kind: 'line', points: [[100, 100], [500, 250], [1000, 500]] },
    ]);
  });

  test('a tap, stored as one point twice, is a dot at that point', () => {
    expect(strokeShapes([{ points: [0.25, 0.5, 0.25, 0.5] }], 800, 600)).toEqual([{ kind: 'dot', x: 200, y: 300 }]);
  });

  test('a stroke of a single point is a dot too', () => {
    expect(strokeShapes([{ points: [0.5, 0.5] }], 100, 100)).toEqual([{ kind: 'dot', x: 50, y: 50 }]);
  });

  test('a stroke that never leaves its first point is a dot however many times the point repeats', () => {
    expect(strokeShapes([{ points: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1] }], 100, 100)).toEqual([{ kind: 'dot', x: 10, y: 10 }]);
  });

  test('zero-length segments inside a stroke that moves are dropped, the line stays one piece', () => {
    expect(strokeShapes([{ points: [0.1, 0.1, 0.1, 0.1, 0.5, 0.5] }], 100, 100)).toEqual([
      { kind: 'line', points: [[10, 10], [50, 50]] },
    ]);
  });

  test('every stroke becomes its own shape, in order, so lines and dots can be mixed', () => {
    const shapes = strokeShapes([{ points: [0, 0, 1, 1] }, { points: [0.5, 0.5, 0.5, 0.5] }, { points: [1, 0, 0, 1] }], 10, 10);
    expect(shapes.map((s) => s.kind)).toEqual(['line', 'dot', 'line']);
  });

  test('a trailing x without its y, an empty stroke and values that are not numbers draw nothing', () => {
    expect(strokeShapes([{ points: [] }], 100, 100)).toEqual([]);
    expect(strokeShapes([{ points: [0.5, 0.5, 0.7] }], 100, 100)).toEqual([{ kind: 'dot', x: 50, y: 50 }]);
    expect(strokeShapes([{ points: [Number.NaN, 0.5, 0.2, Number.POSITIVE_INFINITY] }], 100, 100)).toEqual([]);
  });

  test('no strokes, no shapes', () => {
    expect(strokeShapes([], 100, 100)).toEqual([]);
  });
});

/** Records what is drawn; a real canvas is not available here. */
function fakeContext() {
  const calls: string[] = [];
  const ctx = {
    strokeStyle: '', fillStyle: '', lineWidth: 0, lineCap: '', lineJoin: '',
    beginPath: vi.fn(() => calls.push('beginPath')),
    moveTo: vi.fn((x: number, y: number) => calls.push(`moveTo ${x},${y}`)),
    lineTo: vi.fn((x: number, y: number) => calls.push(`lineTo ${x},${y}`)),
    stroke: vi.fn(() => calls.push('stroke')),
    arc: vi.fn((x: number, y: number, r: number) => calls.push(`arc ${x},${y},${r}`)),
    fill: vi.fn(() => calls.push('fill')),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, raw: ctx };
}

describe('drawStrokes', () => {
  test('draws a line red with round caps and joins, as wide as strokeWidth says', () => {
    const { ctx, calls, raw } = fakeContext();
    drawStrokes(ctx, [{ points: [0.1, 0.1, 0.5, 0.5] }], 1000, 1000);
    expect(calls).toEqual(['beginPath', 'moveTo 100,100', 'lineTo 500,500', 'stroke']);
    expect(raw.strokeStyle).toBe(STROKE_COLOR);
    expect(raw.lineCap).toBe('round');
    expect(raw.lineJoin).toBe('round');
    expect(raw.lineWidth).toBeCloseTo(6, 10);
  });

  test('draws a tap as a filled red circle as wide as the line, since a zero-length line may draw nothing', () => {
    const { ctx, calls, raw } = fakeContext();
    drawStrokes(ctx, [{ points: [0.5, 0.5, 0.5, 0.5] }], 1000, 1000);
    expect(calls).toEqual(['beginPath', 'arc 500,500,3', 'fill']);
    expect(raw.fillStyle).toBe(STROKE_COLOR);
    expect(raw.stroke).not.toHaveBeenCalled();
    expect(raw.lineTo).not.toHaveBeenCalled();
  });

  test('draws nothing for no strokes', () => {
    const { ctx, calls } = fakeContext();
    drawStrokes(ctx, [], 1000, 1000);
    expect(calls).toEqual([]);
  });
});
