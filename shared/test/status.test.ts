import { describe, expect, test } from 'vitest';
import {
  MAX_PHOTOS, TransitionError, canSend, countStates, draftState, nextState, openCorrections, reportStatus,
} from '../src/status';
import type { ZoneAction } from '../src/status';
import type { ZoneState, ZoneSummary } from '../src/types';

const z = (state: ZoneState, deadline: string | null = null): ZoneSummary => ({ state, deadline });

describe('nextState', () => {
  test.each<[ZoneState, ZoneAction, ZoneState]>([
    ['photo_added', 'send', 'submitted'],
    ['not_in_campaign', 'send', 'not_in_campaign'],
    ['submitted', 'feedback', 'needs_correction'],
    ['needs_correction', 'feedback', 'needs_correction'],
    ['correction_sent', 'feedback', 'needs_correction'],
    ['approved', 'feedback', 'needs_correction'],
    ['needs_correction', 'correction', 'correction_sent'],
    ['submitted', 'approve', 'approved'],
    ['correction_sent', 'approve', 'approved'],
  ])('%s + %s -> %s', (from, action, to) => expect(nextState(from, action)).toBe(to));

  test.each<[ZoneState, ZoneAction]>([
    ['empty', 'send'],
    ['needs_correction', 'approve'],
    ['approved', 'correction'],
    ['not_in_campaign', 'feedback'],
  ])('%s + %s throws TransitionError', (from, action) =>
    expect(() => nextState(from, action)).toThrow(TransitionError));

  test('every state/action pair outside the table throws', () => {
    const states: ZoneState[] = ['empty', 'photo_added', 'not_in_campaign', 'submitted', 'needs_correction', 'correction_sent', 'approved'];
    const actions: ZoneAction[] = ['send', 'feedback', 'correction', 'approve'];
    const allowed = new Set([
      'photo_added/send', 'not_in_campaign/send',
      'submitted/feedback', 'needs_correction/feedback', 'correction_sent/feedback', 'approved/feedback',
      'needs_correction/correction', 'submitted/approve', 'correction_sent/approve',
    ]);
    for (const s of states) for (const a of actions) {
      if (allowed.has(`${s}/${a}`)) expect(() => nextState(s, a)).not.toThrow();
      else expect(() => nextState(s, a)).toThrow(TransitionError);
    }
  });

  test('TransitionError carries state, action and a readable message', () => {
    let caught: unknown;
    try { nextState('needs_correction', 'approve'); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(TransitionError);
    expect(caught).toBeInstanceOf(Error);
    const err = caught as TransitionError;
    expect(err.state).toBe('needs_correction');
    expect(err.action).toBe('approve');
    expect(err.name).toBe('TransitionError');
    expect(err.message).toBe("cannot apply 'approve' to zone in state 'needs_correction'");
  });
});

describe('draftState', () => {
  test('MAX_PHOTOS is 3', () => expect(MAX_PHOTOS).toBe(3));
  test('no photos, in campaign -> empty', () => expect(draftState(0, false)).toBe('empty'));
  test('photos, in campaign -> photo_added', () => {
    expect(draftState(1, false)).toBe('photo_added');
    expect(draftState(2, false)).toBe('photo_added');
    expect(draftState(MAX_PHOTOS, false)).toBe('photo_added');
  });
  test('not in campaign without photos -> not_in_campaign', () => expect(draftState(0, true)).toBe('not_in_campaign'));
  test('not in campaign with photos throws', () => expect(() => draftState(1, true)).toThrow(Error));
  test('more than MAX_PHOTOS throws', () => expect(() => draftState(4, false)).toThrow(Error));
  test('negative or fractional photo count throws', () => {
    expect(() => draftState(-1, false)).toThrow(Error);
    expect(() => draftState(1.5, false)).toThrow(Error);
  });
});

describe('canSend', () => {
  test('photo_added + not_in_campaign -> true', () => expect(canSend(['photo_added', 'not_in_campaign'])).toBe(true));
  test('only not_in_campaign -> false', () => expect(canSend(['not_in_campaign'])).toBe(false));
  test('an empty zone blocks sending', () => expect(canSend(['photo_added', 'empty'])).toBe(false));
  test('no zones -> false', () => expect(canSend([])).toBe(false));
  test('a zone in a post-send state blocks sending', () => expect(canSend(['photo_added', 'submitted'])).toBe(false));
});

describe('reportStatus', () => {
  test('draft stays draft', () => expect(reportStatus('draft', { a: z('photo_added') })).toBe('draft'));
  test('all included zones approved -> approved', () =>
    expect(reportStatus('sent', { a: z('approved'), b: z('not_in_campaign') })).toBe('approved'));
  test('a correction_sent zone -> corrections_open', () =>
    expect(reportStatus('sent', { a: z('approved'), b: z('correction_sent', '2026-11-01'), c: z('not_in_campaign') })).toBe('corrections_open'));
  test('a needs_correction zone -> corrections_open', () =>
    expect(reportStatus('sent', { a: z('approved'), b: z('needs_correction', '2026-11-01') })).toBe('corrections_open'));
  test('only submitted -> sent', () => expect(reportStatus('sent', { a: z('submitted') })).toBe('sent'));
  test('submitted plus approved -> sent', () =>
    expect(reportStatus('sent', { a: z('submitted'), b: z('approved') })).toBe('sent'));
});

describe('countStates / openCorrections', () => {
  test('countStates has all 7 keys, zero-filled', () => {
    expect(countStates({})).toEqual({
      empty: 0, photo_added: 0, not_in_campaign: 0, submitted: 0, needs_correction: 0, correction_sent: 0, approved: 0,
    });
  });
  test('countStates counts each state', () => {
    expect(countStates({ a: z('approved'), b: z('approved'), c: z('submitted'), d: z('not_in_campaign') }))
      .toEqual({ empty: 0, photo_added: 0, not_in_campaign: 1, submitted: 1, needs_correction: 0, correction_sent: 0, approved: 2 });
  });
  test('openCorrections counts needs_correction + correction_sent', () =>
    expect(openCorrections({ a: z('needs_correction'), b: z('correction_sent'), c: z('approved') })).toBe(2));
});
