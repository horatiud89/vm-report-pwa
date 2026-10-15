import { expect, test } from 'vitest';
import { summarize } from '../src/summary';

test('summarize maps every zone id to its state and earliest open deadline', () => {
  expect(summarize([
    { id: 'a', state: 'empty', earliestOpenDeadline: null },
    { id: 'b', state: 'needs_correction', earliestOpenDeadline: '2026-11-01' },
  ])).toEqual({
    a: { state: 'empty', deadline: null },
    b: { state: 'needs_correction', deadline: '2026-11-01' },
  });
});
