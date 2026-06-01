import { detectParagraphs, getParagraphAtPoint } from '../utils/paragraphDetection';
import { TextItemWithIndex } from '../types';
import { describe, test, expect } from 'vitest';

// Mock viewport that maps PDF coordinates to simple viewport coordinates
const makeViewport = (offsetY = 0) => ({
  width: 800,
  height: 1000,
  transform: [1, 0, 0, 1, 0, offsetY],
  convertToViewportPoint: (x: number, y: number) => [x, y + offsetY],
});

describe('paragraphDetection', () => {
  test('groups nearby spans into a single paragraph and finds by point', () => {
    const items: TextItemWithIndex[] = [
      { str: 'This', transform: [0,0,0,0,10,10], width: 30, height: 10, index: 0 },
      { str: 'is', transform: [0,0,0,0,50,10], width: 20, height: 10, index: 1 },
      { str: 'a', transform: [0,0,0,0,80,10], width: 8, height: 10, index: 2 },
      { str: 'paragraph.', transform: [0,0,0,0,100,10], width: 80, height: 10, index: 3 },
    ];

    const viewport = makeViewport();

    const paragraphs = detectParagraphs(items, viewport as any, 1);

    expect(paragraphs.length).toBe(1);
    const p = paragraphs[0];
    expect(p.spanIndices).toEqual([0,1,2,3]);
    // point inside paragraph
    const found = getParagraphAtPoint(paragraphs, 50, 15);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(p.id);
  });

  test('separates paragraphs with larger vertical spacing', () => {
    const items: TextItemWithIndex[] = [
      { str: 'First', transform: [0,0,0,0,10,10], width: 40, height: 10, index: 0 },
      { str: 'line', transform: [0,0,0,0,60,10], width: 30, height: 10, index: 1 },
      // second paragraph further down
      { str: 'Second', transform: [0,0,0,0,10,50], width: 50, height: 10, index: 2 },
      { str: 'para', transform: [0,0,0,0,70,50], width: 40, height: 10, index: 3 },
    ];

    const viewport = makeViewport();

    const paragraphs = detectParagraphs(items, viewport as any, 1);

    expect(paragraphs.length).toBe(2);

    const first = getParagraphAtPoint(paragraphs, 20, 15);
    expect(first).not.toBeNull();
    const second = getParagraphAtPoint(paragraphs, 20, 55);
    expect(second).not.toBeNull();
    expect(first?.id).not.toBe(second?.id);
  });
});
