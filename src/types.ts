export type PdfAnnotationType = 'section' | 'sub-section' | 'question' | 'sub-question';

export type PdfAnnotation = {
  page: number;
  text: string;
  type: PdfAnnotationType;
  id?: string;
};

export interface TextItemWithIndex {
  str: string;
  transform: number[];
  width: number;
  height: number;
  dir?: string;
  index: number;
}

export type PhraseMatch = {
  startSpanIndex: number;
  endSpanIndex: number;
};

export type DetectedTag = {
  id: string;
  page: number;
  annotationType: PdfAnnotationType;
  annotationText: string;
  startSpanIndex: number;
  endSpanIndex: number;
};

export type PageMatchRect = {
  id: string;
  page: number;
  type: PdfAnnotationType;
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
};
