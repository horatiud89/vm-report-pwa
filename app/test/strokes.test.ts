import { describe, expect, test } from 'vitest';
import { appendPoint, normalizePoint, strokesToPolylinePoints } from '../src/review/strokes';

describe('strokesToPolylinePoints', () => {
  test('turns the flat x,y list into an SVG points string', () => {
    expect(strokesToPolylinePoints({ points: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6] })).toBe('0.1,0.2 0.3,0.4 0.5,0.6');
  });

  test('a single point and an empty stroke', () => {
    expect(strokesToPolylinePoints({ points: [0.25, 0.75] })).toBe('0.25,0.75');
    expect(strokesToPolylinePoints({ points: [] })).toBe('');
  });

  test('ignores a trailing x without its y', () => {
    expect(strokesToPolylinePoints({ points: [0, 0, 1, 1, 0.5] })).toBe('0,0 1,1');
  });
});

describe('normalizePoint', () => {
  const rect = { left: 100, top: 50, width: 200, height: 100 };

  test('a point inside the box becomes a fraction of its width and height', () => {
    expect(normalizePoint(150, 100, rect)).toEqual([0.25, 0.5]);
    expect(normalizePoint(100, 50, rect)).toEqual([0, 0]);
    expect(normalizePoint(300, 150, rect)).toEqual([1, 1]);
  });

  test('a point outside the box is clamped to its edge', () => {
    expect(normalizePoint(500, -20, rect)).toEqual([1, 0]);
    expect(normalizePoint(0, 400, rect)).toEqual([0, 1]);
  });

  test('a box without size (photo not laid out yet) gives 0,0 instead of NaN', () => {
    expect(normalizePoint(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toEqual([0, 0]);
  });
});

describe('appendPoint', () => {
  test('adds a point that is far enough from the last one', () => {
    expect(appendPoint([0.1, 0.1], 0.2, 0.2)).toEqual([0.1, 0.1, 0.2, 0.2]);
  });

  test('skips a point closer than minDist to the last one', () => {
    expect(appendPoint([0.1, 0.1], 0.102, 0.1)).toEqual([0.1, 0.1]);
    expect(appendPoint([0.1, 0.1], 0.2, 0.2, 0.5)).toEqual([0.1, 0.1]);
  });

  test('the first point of a stroke is always added', () => {
    expect(appendPoint([], 0.5, 0.5)).toEqual([0.5, 0.5]);
  });

  test('rounds to 3 decimals, and does not change the list it was given', () => {
    const points = [0.1, 0.1];
    expect(appendPoint(points, 0.123456, 0.987654)).toEqual([0.1, 0.1, 0.123, 0.988]);
    expect(points).toEqual([0.1, 0.1]);
  });
});
