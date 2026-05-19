import { PdfAnnotation, PhraseMatch } from '../types';

export function normalizeText(text: string): string {
  return text
    .replace(/[\s\u00A0]+/g, ' ')
    .trim()
    .toLowerCase();
}

export function sanitizeAnnotations(annotations?: PdfAnnotation[]): PdfAnnotation[] {
  if (!Array.isArray(annotations)) {
    return [];
  }

  const seen = new Set<string>();

  return annotations
    .map((annotation) => ({
      ...annotation,
      text: String(annotation.text ?? '').trim(),
    }))
    .filter((annotation) => {
      const normalizedText = normalizeText(annotation.text);
      if (!normalizedText) {
        return false;
      }

      const key = `${annotation.type}::${normalizedText}`;
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .map((annotation, index) => ({
      ...annotation,
      id: annotation.id ?? `${annotation.type}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    }));
}

export function buildAnnotationsFromInputs(options: {
  sections?: string[];
  subSections?: string[];
  questions?: string[];
  subQuestions?: string[];
}): PdfAnnotation[] {
  const createAnnotations = (type: PdfAnnotation['type'], items?: string[]) =>
    (items ?? [])
      .map((text) => String(text ?? '').trim())
      .filter(Boolean)
      .map((text) => ({ page: 1, text, type }));

  return sanitizeAnnotations([
    ...createAnnotations('section', options.sections),
    ...createAnnotations('sub-section', options.subSections),
    ...createAnnotations('question', options.questions),
    ...createAnnotations('sub-question', options.subQuestions),
  ]);
}

export function findPhraseBounds(phrase: string, textItems: Array<{ str: string }>): PhraseMatch[] {
  const normalizedPhrase = normalizeText(phrase).replace(/\s+/g, '');
  if (!normalizedPhrase || !Array.isArray(textItems) || textItems.length === 0) {
    return [];
  }

  const sourceChars: Array<{ itemIndex: number; char: string }> = [];
  const rawText = textItems.map((item, itemIndex) => {
    const normalizedItem = normalizeText(item.str ?? '').replace(/\s+/g, '');
    for (const char of normalizedItem) {
      sourceChars.push({ itemIndex, char });
    }
    return normalizedItem;
  });

  const source = rawText.join('');
  if (!source) {
    return [];
  }

  const matches: PhraseMatch[] = [];
  let searchIndex = 0;

  while (searchIndex < source.length) {
    const foundIndex = source.indexOf(normalizedPhrase, searchIndex);
    if (foundIndex === -1) {
      break;
    }

    const start = sourceChars[foundIndex];
    const end = sourceChars[foundIndex + normalizedPhrase.length - 1];

    if (start && end) {
      matches.push({
        startSpanIndex: start.itemIndex,
        endSpanIndex: end.itemIndex,
      });
    }

    searchIndex = foundIndex + 1;
  }

  return matches;
}
