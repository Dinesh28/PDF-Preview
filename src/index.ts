export { default as PdfTagViewer } from './components/PdfTagViewer';
export type {
  InternalAnnotation,
  PdfAnnotation,
  PdfAnnotationType,
  PersistedAnnotation,
  PageMatchRect,
  DetectedTag,
  ParagraphBlock,
  SelectedParagraph,
} from './types';
export {
  fromPersistedAnnotation,
  toPersistedAnnotation,
} from './utils/annotationManager';
