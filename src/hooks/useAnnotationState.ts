import { useCallback, useRef, useState } from 'react';
import {
  UserAnnotation,
  PdfAnnotationType,
  HistoryEntry,
  AnnotationState,
} from '../types';
import {
  AnnotationHistory,
  createAnnotation,
  generateAnnotationId,
  removeAnnotation,
  toPersistedAnnotation,
  updateAnnotation,
} from '../utils/annotationManager';

/**
 * Hook for managing annotations with undo/redo support
 */
export function useAnnotationState(initialAnnotations: UserAnnotation[] = []) {
  const [userAnnotations, setUserAnnotations] =
    useState<UserAnnotation[]>(initialAnnotations);
  const historyRef = useRef<AnnotationHistory>(new AnnotationHistory());

  const addAnnotation = useCallback(
    (
      page: number,
      text: string,
      type: PdfAnnotationType,
      rect: UserAnnotation['rect'],
      spanIndices?: number[],
      rects?: UserAnnotation['rects'],
    ): UserAnnotation => {
      const id = generateAnnotationId();
      const annotation = createAnnotation(
        id,
        page,
        text,
        type,
        rect,
        spanIndices,
        undefined,
        rects,
      );

      setUserAnnotations((prev) => [...prev, annotation]);

      // Add to history
      historyRef.current.addEntry({
        id: `hist-${Date.now()}`,
        action: 'create',
        annotation,
        timestamp: Date.now(),
      });

      return annotation;
    },
    [],
  );

  const updateAnnotationType = useCallback(
    (annotationId: string, newType: PdfAnnotationType): void => {
      setUserAnnotations((prev) => {
        const annotation = prev.find((a) => a.id === annotationId);
        if (!annotation) {
          return prev;
        }

        const updated = updateAnnotation(annotation, { type: newType });

        // Add to history
        historyRef.current.addEntry({
          id: `hist-${Date.now()}`,
          action: 'update',
          annotation: updated,
          timestamp: Date.now(),
        });

        return prev.map((a) => (a.id === annotationId ? updated : a));
      });
    },
    [],
  );

  const removeAnnotationById = useCallback(
    (annotationId: string): void => {
      setUserAnnotations((prev) => {
        const annotation = prev.find((a) => a.id === annotationId);
        if (!annotation) {
          return prev;
        }

        // Add to history
        historyRef.current.addEntry({
          id: `hist-${Date.now()}`,
          action: 'delete',
          annotation,
          timestamp: Date.now(),
        });

        return removeAnnotation(prev, annotationId);
      });
    },
    [],
  );

  const undo = useCallback((): void => {
    const entry = historyRef.current.undo();
    if (!entry) {
      return;
    }

    setUserAnnotations((prev) => {
      switch (entry.action) {
        case 'create':
          return removeAnnotation(prev, entry.annotation.id);
        case 'delete':
          return [...prev, entry.annotation];
        case 'update': {
          // Find the previous version in history
          // For now, we'll restore by finding in current state
          return prev.map((a) =>
            a.id === entry.annotation.id ? entry.annotation : a,
          );
        }
        default:
          return prev;
      }
    });
  }, []);

  const redo = useCallback((): void => {
    const entry = historyRef.current.redo();
    if (!entry) {
      return;
    }

    setUserAnnotations((prev) => {
      switch (entry.action) {
        case 'create':
          return [...prev, entry.annotation];
        case 'delete':
          return removeAnnotation(prev, entry.annotation.id);
        case 'update':
          return prev.map((a) =>
            a.id === entry.annotation.id ? entry.annotation : a,
          );
        default:
          return prev;
      }
    });
  }, []);

  const canUndo = useCallback(() => {
    return historyRef.current.canUndo();
  }, []);

  const canRedo = useCallback(() => {
    return historyRef.current.canRedo();
  }, []);

  const clearHistory = useCallback((): void => {
    historyRef.current.clear();
  }, []);

  const setAnnotations = useCallback(
    (annotations: UserAnnotation[], resetHistory = true): void => {
      setUserAnnotations(annotations);
      if (resetHistory) {
        historyRef.current.clear();
      }
    },
    [],
  );

  const exportState = useCallback(
    (predefined: any[]): AnnotationState => {
      return {
        predefined,
        userAnnotations: userAnnotations.map(toPersistedAnnotation),
      };
    },
    [userAnnotations],
  );

  const importState = useCallback((state: AnnotationState): void => {
    setUserAnnotations([]);
    historyRef.current.clear();
  }, []);

  return {
    userAnnotations,
    setAnnotations,
    addAnnotation,
    updateAnnotationType,
    removeAnnotation: removeAnnotationById,
    undo,
    redo,
    canUndo,
    canRedo,
    clearHistory,
    exportState,
    importState,
  };
}
