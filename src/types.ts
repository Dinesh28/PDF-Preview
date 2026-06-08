export type PdfAnnotationType =
  | 'section'
  | 'sub-section'
  | 'question'
  | 'sub-question'
  | 'answer'
  | 'description'
  | 'instruction';

export type PersistedAnnotation = {
  id?: string;
  page: number;
  text: string;
  type: PdfAnnotationType;
  metadata?: Record<string, unknown>;
};

export type PdfAnnotation = PersistedAnnotation;

export type AnnotationRect = {
  left: number;
  top: number;
  width: number;
  height: number;
  right?: number;
  bottom?: number;
};

/**
 * Internal rendering annotation with geometry used only by the viewer.
 */
export type InternalAnnotation = {
  id: string;
  page: number;
  text: string;
  type: PdfAnnotationType;
  rect: AnnotationRect;
  rects: AnnotationRect[];
  metadata?: Record<string, unknown>;
  startSpanIndex?: number;
  endSpanIndex?: number;
  createdAt: number;
  updatedAt: number;
};

export type UserAnnotation = InternalAnnotation;

/**
 * Combined annotation (predefined + user)
 */
export type CombinedAnnotation = InternalAnnotation;

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

export type ParagraphBlock = {
  id: string;
  page: number;
  text: string;
  spanIndices: number[];
  rect: {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  };
};

export type SelectedParagraph = {
  id: string;
  page: number;
  text: string;
  rect: {
    left: number;
    top: number;
    right?: number;
    bottom?: number;
    width: number;
    height: number;
  };
  selectionRects?: Array<{
    left: number;
    top: number;
    width: number;
    height: number;
  }>;
  spanIndices?: number[];
  startSpanIndex?: number;
  endSpanIndex?: number;
};

/**
 * History entry for undo/redo
 */
export type HistoryEntry = {
  id: string;
  action: 'create' | 'update' | 'delete';
  annotation: UserAnnotation;
  timestamp: number;
};

/**
 * Annotation state for export
 */
export type AnnotationState = {
  predefined: PdfAnnotation[];
  userAnnotations: PersistedAnnotation[];
};
