import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { PhotoWithStrokes } from '../src/photos/PhotoWithStrokes';

const hooks = vi.hoisted(() => ({ usePhotoUrl: vi.fn() }));
vi.mock('../src/data/hooks', () => hooks);

const PATH = 'reports/CZ/850/r1/women-image/v1_a.jpg';

beforeEach(() => {
  hooks.usePhotoUrl.mockReset().mockReturnValue('https://img.test/a.jpg');
});

describe('PhotoWithStrokes', () => {
  test('shows the photo at its natural proportions, not cropped', () => {
    render(<PhotoWithStrokes path={PATH} strokes={[]} alt="Photo 1" />);
    const img = screen.getByRole('img', { name: 'Photo 1' });
    expect(img).toHaveAttribute('src', 'https://img.test/a.jpg');
    expect(hooks.usePhotoUrl).toHaveBeenCalledWith(PATH);
    expect(img).not.toHaveAttribute('width');
    expect(img).not.toHaveAttribute('height');
  });

  test('draws every stroke as a red polyline in a 0..1 viewBox that stretches over the photo', () => {
    const { container } = render(
      <PhotoWithStrokes path={PATH} strokes={[{ points: [0.1, 0.2, 0.3, 0.4] }, { points: [0.5, 0.5, 0.6, 0.7, 0.8, 0.9] }]} alt="Photo 1" />,
    );
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('viewBox', '0 0 1 1');
    expect(svg).toHaveAttribute('preserveAspectRatio', 'none');
    expect(svg).toHaveAttribute('aria-hidden', 'true');

    const lines = [...svg.querySelectorAll('polyline')];
    expect(lines.map((l) => l.getAttribute('points'))).toEqual(['0.1,0.2 0.3,0.4', '0.5,0.5 0.6,0.7 0.8,0.9']);
    for (const line of lines) {
      expect(line).toHaveAttribute('vector-effect', 'non-scaling-stroke');
      expect(line).toHaveAttribute('stroke-width', '4');
      expect(line).toHaveAttribute('fill', 'none');
      expect(line.getAttribute('stroke')).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  test('without strokes there is nothing to draw', () => {
    const { container } = render(<PhotoWithStrokes path={PATH} strokes={[]} alt="Photo 1" />);
    expect(container.querySelectorAll('polyline')).toHaveLength(0);
  });

  test('while the photo address is not known there is a placeholder and no image', () => {
    hooks.usePhotoUrl.mockReturnValue(null);
    const { container } = render(<PhotoWithStrokes path={PATH} strokes={[{ points: [0, 0, 1, 1] }]} alt="Photo 1" />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('img', { name: 'Photo 1' })).toBeInTheDocument();
  });
});
