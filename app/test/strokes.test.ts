import { describe, expect, test } from 'vitest';
import { strokesToPolylinePoints } from '../src/review/strokes';

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
