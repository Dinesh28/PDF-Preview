import { buildAnnotationsFromInputs, findPhraseBounds, normalizeText, sanitizeAnnotations } from '../utils/pdfAnnotations';

describe('pdfAnnotations utilities', () => {
  test('normalizeText collapses spaces and lowercases', () => {
    expect(normalizeText('  Hello \n WORLD  ')).toBe('hello world');
  });

  test('sanitizeAnnotations returns empty array when annotations undefined', () => {
    expect(sanitizeAnnotations(undefined)).toEqual([]);
  });

  test('sanitizeAnnotations removes duplicate annotations case-insensitively', () => {
    const input = [
      { page: 1, type: 'section' as const, text: 'Title' },
      { page: 1, type: 'section' as const, text: 'title' },
      { page: 1, type: 'question' as const, text: 'Address' },
      { page: 1, type: 'question' as const, text: ' address ' },
    ];

    const sanitized = sanitizeAnnotations(input);
    expect(sanitized).toHaveLength(2);
    expect(sanitized.map((item) => item.type).sort()).toEqual(['question', 'section']);
    expect(sanitized.map((item) => item.text)).toEqual(['Title', 'Address']);
  });

  test('findPhraseBounds matches text split across spans', () => {
    const textItems = [
      { str: 'REQUEST' },
      { str: ' FOR' },
      { str: ' PROPOSALS' },
      { str: ' Address' },
    ];

    const matches = findPhraseBounds('REQUEST FOR PROPOSALS', textItems as any);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ startSpanIndex: 0, endSpanIndex: 2 });
  });

  test('buildAnnotationsFromInputs converts inputs into annotations', () => {
    const annotations = buildAnnotationsFromInputs({
      sections: ['REQUEST FOR PROPOSALS'],
      questions: ['Address'],
    });

    expect(annotations).toHaveLength(2);
    expect(annotations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ page: 1, text: 'REQUEST FOR PROPOSALS', type: 'section' }),
        expect.objectContaining({ page: 1, text: 'Address', type: 'question' }),
      ]),
    );
  });
});
