import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { en } from '@shared/i18n/en';
import type { Stroke } from '@shared/types';
import { AnnotationCanvas } from '../src/review/AnnotationCanvas';
import { MAX_STROKES, MAX_STROKE_VALUES } from '../src/review/strokes';
import { renderApp } from './helpers';

vi.mock('firebase/firestore', () => ({ doc: vi.fn(), updateDoc: vi.fn() }));
vi.mock('../src/firebase', () => ({ auth: {}, db: {} }));

const onChange = vi.fn<(strokes: Stroke[]) => void>();

/** Keeps the strokes like the form does, so that what is drawn shows. */
function Harness({ initial = [] }: { initial?: Stroke[] }) {
  const [strokes, setStrokes] = useState(initial);
  return <AnnotationCanvas photoUrl="https://img.test/a.jpg" strokes={strokes} onChange={(next) => { onChange(next); setStrokes(next); }} />;
}

const surface = () => screen.getByRole('group', { name: en['review.markOnPhoto'] });
const lines = () => surface().querySelectorAll('polyline');
const lastStrokes = () => onChange.mock.calls.at(-1)?.[0];

/** The photo is displayed 200 x 100 px, with its top-left corner at (10, 20) on the screen. */
function placePhoto() {
  const img = surface().querySelector('img') as HTMLImageElement;
  vi.spyOn(img, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 20, width: 200, height: 100, right: 210, bottom: 120, x: 10, y: 20, toJSON: () => ({}) });
}

const down = (x: number, y: number, extra: object = {}) => fireEvent.pointerDown(surface(), { pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: y, ...extra });
const move = (x: number, y: number, extra: object = {}) => fireEvent.pointerMove(surface(), { pointerId: 1, isPrimary: true, clientX: x, clientY: y, ...extra });
const up = (x: number, y: number, extra: object = {}) => fireEvent.pointerUp(surface(), { pointerId: 1, isPrimary: true, clientX: x, clientY: y, ...extra });

beforeEach(() => {
  onChange.mockReset();
});

describe('AnnotationCanvas', () => {
  test('shows the photo, a hint, and keeps the page from scrolling under the finger', () => {
    renderApp(<Harness />);
    expect(surface().querySelector('img')).toHaveAttribute('src', 'https://img.test/a.jpg');
    expect(surface().style.touchAction).toBe('none');
    expect(screen.getByText(en['review.drawHint'])).toBeInTheDocument();
  });

  test('a stroke is recorded as fractions of the displayed photo box, when the finger lifts', () => {
    renderApp(<Harness />);
    placePhoto();
    down(10, 20);
    move(110, 70);
    expect(onChange).not.toHaveBeenCalled(); // still drawing
    expect(lines()).toHaveLength(1); // but already visible
    move(210, 120);
    up(210, 120);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(lastStrokes()).toEqual([{ points: [0, 0, 0.5, 0.5, 1, 1] }]);
    expect(lines()).toHaveLength(1);
  });

  test('points outside the photo are held at its edge', () => {
    renderApp(<Harness />);
    placePhoto();
    down(100, 60);
    move(900, -50);
    up(900, -50);
    expect(lastStrokes()).toEqual([{ points: [0.45, 0.4, 1, 0] }]);
  });

  test('a single tap leaves a mark: one point (twice, so that it is drawn as a dot), never an empty stroke', () => {
    renderApp(<Harness />);
    placePhoto();
    down(110, 70);
    up(110, 70);

    expect(lastStrokes()).toEqual([{ points: [0.5, 0.5, 0.5, 0.5] }]);
    expect(lines()).toHaveLength(1);
  });

  test('Undo removes the last stroke only, and is disabled when there is nothing to take back', async () => {
    const user = userEvent.setup();
    renderApp(<Harness />);
    placePhoto();
    const undo = screen.getByRole('button', { name: en['review.undo'] });
    expect(undo).toBeDisabled();

    down(10, 20); move(60, 40); up(60, 40);
    down(100, 60); move(150, 90); up(150, 90);
    expect(lines()).toHaveLength(2);
    expect(undo).toBeEnabled();

    await user.click(undo);
    expect(lines()).toHaveLength(1);
    expect(lastStrokes()).toEqual([{ points: [0, 0, 0.25, 0.2] }]);

    await user.click(undo);
    expect(lines()).toHaveLength(0);
    expect(lastStrokes()).toEqual([]);
    expect(undo).toBeDisabled();
  });

  test('no more than 50 strokes: further ones are ignored', () => {
    const existing = Array.from({ length: MAX_STROKES }, () => ({ points: [0.1, 0.1, 0.2, 0.2] }));
    renderApp(<Harness initial={existing} />);
    placePhoto();
    down(10, 20); move(60, 40); up(60, 40);
    expect(onChange).not.toHaveBeenCalled();
    expect(lines()).toHaveLength(MAX_STROKES);
  });

  test('a very long scribble stops at the number of values the server accepts', () => {
    renderApp(<Harness />);
    placePhoto();
    down(10, 20);
    for (let i = 0; i < 1010; i += 1) move(10 + (i % 2 === 0 ? 0 : 200), 20 + (i % 100)); // zigzag, every point far from the last
    up(10, 20);
    const points = (lastStrokes() as Stroke[])[0]!.points;
    expect(points.length).toBeLessThanOrEqual(MAX_STROKE_VALUES);
    expect(points.length % 2).toBe(0);
    expect(points.every((n) => n >= 0 && n <= 1)).toBe(true);
  });

  test('a second finger or a pointer that did not start the stroke does not add to it', () => {
    renderApp(<Harness />);
    placePhoto();
    down(10, 20);
    move(60, 40, { pointerId: 2, isPrimary: false });
    fireEvent.pointerDown(surface(), { pointerId: 2, isPrimary: false, clientX: 100, clientY: 100 });
    up(60, 40);
    expect(lastStrokes()).toEqual([{ points: [0, 0, 0.25, 0.2] }]);
  });

  test('a cancelled gesture (the system took the touch) leaves no stroke', () => {
    renderApp(<Harness />);
    placePhoto();
    down(10, 20);
    move(60, 40);
    fireEvent.pointerCancel(surface(), { pointerId: 1, isPrimary: true });
    expect(onChange).not.toHaveBeenCalled();
    expect(lines()).toHaveLength(0);
  });

  test('moving without having pressed draws nothing', () => {
    renderApp(<Harness />);
    placePhoto();
    move(60, 40);
    up(60, 40);
    expect(onChange).not.toHaveBeenCalled();
  });

  test('strokes that were already there are drawn', () => {
    renderApp(<Harness initial={[{ points: [0.1, 0.1, 0.9, 0.9] }]} />);
    expect(lines()).toHaveLength(1);
  });
});
