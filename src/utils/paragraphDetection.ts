import { ParagraphBlock, TextItemWithIndex } from '../types';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

type ItemWithViewport = TextItemWithIndex & {
  viewportX: number;
  viewportY: number;
  viewportX2: number;
  viewportY2: number;
  centerY: number;
  centerX: number;
};
/**
 * Detects paragraphs from text items using vertical spacing and alignment.
 * Groups nearby text spans into logical paragraph blocks.
 */
export function detectParagraphs(
  items: TextItemWithIndex[],
  viewport: pdfjsLib.PageViewport,
  pageNumber: number,
): ParagraphBlock[] {
  if (!items || items.length === 0) {
    return [];
  }

  // Calculate viewport coordinates for all items
  const itemsWithViewportCoords = items.map((item) => {
    const [x, y] = viewport.convertToViewportPoint(
      item.transform[4],
      item.transform[5],
    );

    const [x2, y2] = viewport.convertToViewportPoint(
      item.transform[4] + item.width,
      item.transform[5] + item.height,
    );

    return {
      ...item,
      viewportX: x,
      viewportY: y,
      viewportX2: x2,
      viewportY2: y2,
      centerY: (y + y2) / 2,
      centerX: (x + x2) / 2,
    };
  });

  // Group items into lines by Y-coordinate proximity
  const lines = groupItemsIntoLines(itemsWithViewportCoords);

  // Group lines into paragraphs by vertical spacing
  const paragraphs = groupLinesIntoParagraphs(lines);

  // Convert to ParagraphBlock format
  const paragraphBlocks = paragraphs.map((paragraph, index) => {
    const allItems = paragraph.flat();

    if (allItems.length === 0) {
      return null;
    }

    const spanIndices = allItems.map((item) => item.index);
    const text = allItems.map((item) => item.str).join(' ');

    const left = Math.min(...allItems.map((item) => item.viewportX));
    const right = Math.max(...allItems.map((item) => item.viewportX2));
    const top = Math.min(...allItems.map((item) => item.viewportY));
    const bottom = Math.max(...allItems.map((item) => item.viewportY2));

    return {
      id: `para-${pageNumber}-${index}`,
      page: pageNumber,
      text,
      spanIndices,
      rect: {
        left,
        top,
        right,
        bottom,
        width: right - left,
        height: bottom - top,
      },
    };
  });

  return paragraphBlocks.filter(
    (block): block is ParagraphBlock => block !== null,
  );
}

/**
 * Groups text items into lines based on Y-coordinate proximity.
 */
function groupItemsIntoLines(
  items: ItemWithViewport[],
): ItemWithViewport[][] {
  if (items.length === 0) {
    return [];
  }

  // Sort items by Y coordinate (top to bottom)
  const sortedItems = [...items].sort(
    (a, b) => a.viewportY - b.viewportY,
  );

  const lines: ItemWithViewport[][] = [];
  let currentLine: ItemWithViewport[] = [sortedItems[0]];

  const LINE_HEIGHT_THRESHOLD = 8; // pixels

  for (let i = 1; i < sortedItems.length; i++) {
    const prevItem = currentLine[currentLine.length - 1];
    const currItem = sortedItems[i];

    // Check if item is on same line (Y coordinate within threshold)
    const yDiff = Math.abs(
      currItem.centerY - prevItem.centerY,
    );

    if (yDiff <= LINE_HEIGHT_THRESHOLD) {
      currentLine.push(currItem);
    } else {
      lines.push(currentLine);
      currentLine = [currItem];
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  // Sort items within each line by X coordinate (left to right)
  return lines.map((line) =>
    line.sort((a, b) => a.viewportX - b.viewportX),
  );
}

/**
 * Groups lines into paragraphs based on vertical spacing.
 */
function groupLinesIntoParagraphs(
  lines: ItemWithViewport[][],
): ItemWithViewport[][][] {
  if (lines.length === 0) {
    return [];
  }

  const paragraphs: ItemWithViewport[][][] = [];
  let currentParagraph: ItemWithViewport[][] = [lines[0]];

  // Calculate average line height from first few lines
  const avgLineHeight =
    lines.slice(0, Math.min(5, lines.length)).reduce((sum, line) => {
      const lineTop = Math.min(...line.map((item) => item.viewportY));
      const lineBottom = Math.max(
        ...line.map((item) => item.viewportY2),
      );
      return sum + (lineBottom - lineTop);
    }, 0) / Math.min(5, lines.length);

  const PARAGRAPH_SPACING_THRESHOLD = avgLineHeight * 1.5;

  for (let i = 1; i < lines.length; i++) {
    const prevLine = currentParagraph[currentParagraph.length - 1];
    const currLine = lines[i];

    const prevLineBottom = Math.max(
      ...prevLine.map((item) => item.viewportY2),
    );
    const currLineTop = Math.min(
      ...currLine.map((item) => item.viewportY),
    );

    const spacing = currLineTop - prevLineBottom;

    // Check if spacing indicates a new paragraph
    if (spacing > PARAGRAPH_SPACING_THRESHOLD) {
      paragraphs.push(currentParagraph);
      currentParagraph = [currLine];
    } else {
      currentParagraph.push(currLine);
    }
  }

  if (currentParagraph.length > 0) {
    paragraphs.push(currentParagraph);
  }

  return paragraphs;
}

/**
 * Finds the paragraph that contains the given point (click coordinates).
 */
export function getParagraphAtPoint(
  paragraphs: ParagraphBlock[],
  x: number,
  y: number,
): ParagraphBlock | null {
  for (const paragraph of paragraphs) {
    const { rect } = paragraph;

    // Check if point is inside paragraph bounding box with padding
    const padding = 2;
    if (
      x >= rect.left - padding &&
      x <= rect.right + padding &&
      y >= rect.top - padding &&
      y <= rect.bottom + padding
    ) {
      return paragraph;
    }
  }

  return null;
}

/**
 * Converts viewport coordinates to PDF coordinates.
 */
export function viewportToPdfCoordinates(
  viewport: pdfjsLib.PageViewport,
  viewportX: number,
  viewportY: number,
): [number, number] {
  // Inverse of convertToViewportPoint
  const transform = viewport.transform;

  // viewport point is in canvas space, need to convert back to PDF space
  // The transform is [a, b, c, d, e, f] representing the transformation matrix
  // For PDF.js, typically: [scale, 0, 0, scale, offsetX, offsetY]

  const pdfX = (viewportX - transform[4]) / transform[0];
  const pdfY = (viewportY - transform[5]) / transform[3];

  return [pdfX, pdfY];
}

/**
 * Gets the viewport coordinates of a canvas click event.
 */
export function getViewportCoordsFromCanvasClick(
  canvas: HTMLCanvasElement,
  event: React.MouseEvent<HTMLCanvasElement>,
): [number, number] {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  return [x, y];
}
