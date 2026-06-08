import {
  AnnotationRect,
  PersistedAnnotation,
  UserAnnotation,
  PdfAnnotationType,
  HistoryEntry,
  AnnotationState,
} from '../types';

/**
 * Creates a new user annotation
 */
export function createAnnotation(
  id: string,
  page: number,
  text: string,
  type: PdfAnnotationType,
  rect: AnnotationRect,
  spanIndices?: number[],
  metadata?: Record<string, unknown>,
  rects: AnnotationRect[] = [rect],
): UserAnnotation {
  const now = Date.now();
  return {
    id,
    page,
    text,
    type,
    rect,
    rects,
    metadata,
    startSpanIndex: spanIndices?.[0],
    endSpanIndex: spanIndices?.[spanIndices.length - 1],
    createdAt: now,
    updatedAt: now,
  };
}

export function toPersistedAnnotation(
  annotation: UserAnnotation,
): PersistedAnnotation {
  const persisted: PersistedAnnotation = {
    id: annotation.id,
    page: annotation.page,
    text: annotation.text,
    type: annotation.type,
  };

  if (annotation.metadata) {
    persisted.metadata = annotation.metadata;
  }

  return persisted;
}

export function fromPersistedAnnotation(
  annotation: PersistedAnnotation,
  rect: AnnotationRect,
  spanIndices?: number[],
  fallbackId?: string,
  rects?: AnnotationRect[],
): UserAnnotation {
  return createAnnotation(
    annotation.id ?? fallbackId ?? generateAnnotationId(),
    annotation.page,
    annotation.text,
    annotation.type,
    rect,
    spanIndices,
    annotation.metadata,
    rects,
  );
}

/**
 * Updates an existing annotation
 */
export function updateAnnotation(
  annotation: UserAnnotation,
  updates: Partial<Omit<UserAnnotation, 'id' | 'createdAt'>>,
): UserAnnotation {
  return {
    ...annotation,
    ...updates,
    updatedAt: Date.now(),
  };
}

/**
 * Generates a unique ID for annotations
 */
export function generateAnnotationId(): string {
  return `anno-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * History manager for undo/redo
 */
export class AnnotationHistory {
  private history: HistoryEntry[] = [];
  private currentIndex: number = -1;
  private maxSize: number = 50; // Limit history size to prevent memory bloat

  addEntry(entry: HistoryEntry): void {
    // Remove any redo history when a new action is performed
    this.history = this.history.slice(0, this.currentIndex + 1);

    // Add new entry
    this.history.push(entry);
    this.currentIndex++;

    // Trim history if it exceeds max size
    if (this.history.length > this.maxSize) {
      this.history = this.history.slice(-this.maxSize);
      this.currentIndex = this.history.length - 1;
    }
  }

  canUndo(): boolean {
    return this.currentIndex > -1;
  }

  canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  undo(): HistoryEntry | null {
    if (!this.canUndo()) {
      return null;
    }
    return this.history[this.currentIndex--] || null;
  }

  redo(): HistoryEntry | null {
    if (!this.canRedo()) {
      return null;
    }
    return this.history[++this.currentIndex] || null;
  }

  clear(): void {
    this.history = [];
    this.currentIndex = -1;
  }

  getSize(): number {
    return this.history.length;
  }
}

/**
 * Merges predefined and user annotations
 */
export function mergeAnnotations(
  predefined: any[],
  userAnnotations: UserAnnotation[],
): any[] {
  return [...predefined, ...userAnnotations];
}

/**
 * Exports annotations as JSON
 */
export function exportAnnotationsAsJSON(
  state: AnnotationState,
): string {
  return JSON.stringify(state, null, 2);
}

/**
 * Imports annotations from JSON
 */
export function importAnnotationsFromJSON(json: string): AnnotationState {
  try {
    const parsed = JSON.parse(json);
    return {
      predefined: Array.isArray(parsed.predefined) ? parsed.predefined : [],
      userAnnotations: Array.isArray(parsed.userAnnotations)
        ? parsed.userAnnotations
        : [],
    };
  } catch (error) {
    console.error('Failed to import annotations:', error);
    return {
      predefined: [],
      userAnnotations: [],
    };
  }
}

/**
 * Finds annotation by ID
 */
export function findAnnotation(
  annotations: UserAnnotation[],
  id: string,
): UserAnnotation | undefined {
  return annotations.find((a) => a.id === id);
}

/**
 * Removes annotation by ID
 */
export function removeAnnotation(
  annotations: UserAnnotation[],
  id: string,
): UserAnnotation[] {
  return annotations.filter((a) => a.id !== id);
}

/**
 * Gets annotations for a specific page
 */
export function getAnnotationsForPage(
  annotations: UserAnnotation[],
  page: number,
): UserAnnotation[] {
  return annotations.filter((a) => a.page === page);
}
