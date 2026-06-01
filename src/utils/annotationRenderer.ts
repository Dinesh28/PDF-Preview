import {
  UserAnnotation,
  TextItemWithIndex,
  PageMatchRect,
} from '../types';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

/**
 * Computes the display rectangle for a user annotation
 */
export function computeUserAnnotationRect(
  viewport: pdfjsLib.PageViewport,
  items: TextItemWithIndex[],
  annotation: UserAnnotation,
): PageMatchRect | null {
  if (
    !annotation.startSpanIndex ||
    annotation.endSpanIndex === undefined
  ) {
    // Use pre-computed rect if available
    return {
      id: annotation.id,
      page: annotation.page,
      type: annotation.type,
      text: annotation.text,
      left: annotation.rect.left,
      top: annotation.rect.top,
      width: annotation.rect.width,
      height: annotation.rect.height,
    };
  }

  const selectedItems = items.slice(
    annotation.startSpanIndex,
    annotation.endSpanIndex + 1,
  );

  if (!selectedItems.length) {
    return null;
  }

  const boxes = selectedItems.map((item) => {
    const points = [
      viewport.convertToViewportPoint(item.transform[4], item.transform[5]),
      viewport.convertToViewportPoint(
        item.transform[4] + item.width,
        item.transform[5],
      ),
      viewport.convertToViewportPoint(
        item.transform[4],
        item.transform[5] + item.height,
      ),
      viewport.convertToViewportPoint(
        item.transform[4] + item.width,
        item.transform[5] + item.height,
      ),
    ];

    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);

    return {
      left: Math.min(...xs),
      top: Math.min(...ys),
      right: Math.max(...xs),
      bottom: Math.max(...ys),
    };
  });

  const left = Math.min(...boxes.map((box) => box.left));
  const top = Math.min(...boxes.map((box) => box.top));
  const right = Math.max(...boxes.map((box) => box.right));
  const bottom = Math.max(...boxes.map((box) => box.bottom));

  return {
    id: annotation.id,
    page: annotation.page,
    type: annotation.type,
    text: annotation.text,
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}

/**
 * Gets the color scheme for an annotation type
 */
export function getAnnotationColorScheme(
  type: string,
): { backgroundColor: string; borderColor: string; badgeColor: string } {
  switch (type) {
    case 'section':
      return {
        backgroundColor: 'rgba(79, 255, 91, 0.28)',
        borderColor: 'rgba(7, 255, 69, 0.8)',
        badgeColor: 'rgb(5, 137, 14)',
      };
    case 'sub-section':
      return {
        backgroundColor: 'rgba(100, 200, 255, 0.28)',
        borderColor: 'rgba(0, 150, 255, 0.8)',
        badgeColor: 'rgb(0, 100, 200)',
      };
    case 'question':
      return {
        backgroundColor: 'rgba(255, 213, 79, 0.28)',
        borderColor: 'rgba(255, 193, 7, 0.8)',
        badgeColor: 'rgb(159, 120, 12)',
      };
    case 'sub-question':
      return {
        backgroundColor: 'rgba(255, 167, 38, 0.28)',
        borderColor: 'rgba(255, 111, 0, 0.8)',
        badgeColor: 'rgb(230, 81, 0)',
      };
    default:
      return {
        backgroundColor: 'rgba(200, 200, 200, 0.28)',
        borderColor: 'rgba(100, 100, 100, 0.8)',
        badgeColor: 'rgb(80, 80, 80)',
      };
  }
}

/**
 * Gets label for annotation type
 */
export function getAnnotationTypeLabel(type: string): string {
  switch (type) {
    case 'section':
      return 'S';
    case 'sub-section':
      return 'SS';
    case 'question':
      return 'Q';
    case 'sub-question':
      return 'SQ';
    default:
      return 'A';
  }
}
