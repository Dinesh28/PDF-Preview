import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

import {
  Box,
  CircularProgress,
  IconButton,
  Paper,
  Typography,
} from '@mui/material';

import FitScreenIcon from '@mui/icons-material/FitScreen';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import RestoreIcon from '@mui/icons-material/Restore';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';

import {
  DetectedTag,
  PageMatchRect,
  PdfAnnotation,
  PdfAnnotationType,
  SelectedParagraph,
  TextItemWithIndex,
  UserAnnotation,
} from '../types';

import { findPhraseBounds } from '../utils/pdfAnnotations';
import { useAnnotationState } from '../hooks/useAnnotationState';
import { fromPersistedAnnotation } from '../utils/annotationManager';
import ParagraphToolbar from './ParagraphToolbar';
import AnnotationPanel from './AnnotationPanel';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const MIN_SCALE = 0.6;
const MAX_SCALE = 2.4;
const SCALE_STEP = 0.2;

type PdfTagViewerProps = {
  fileUrl: string;
  annotations?: PdfAnnotation[];
};

function computeMatchRect(
  viewport: pdfjsLib.PageViewport,
  items: TextItemWithIndex[],
  startIndex: number,
  endIndex: number,
  id: string,
  annotationType: PdfAnnotation['type'],
  text: string,
  page: number,
): PageMatchRect | null {
  const selectedItems = items.slice(startIndex, endIndex + 1);

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
    id,
    page,
    type: annotationType,
    text,
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}

export default function PdfTagViewer({
  fileUrl,
  annotations = [],
}: PdfTagViewerProps) {
  const [pdfDoc, setPdfDoc] =
    useState<pdfjsLib.PDFDocumentProxy | null>(null);

  const [pageCount, setPageCount] = useState(0);

  const [pdfLoading, setPdfLoading] = useState(false);
  const [detecting, setDetecting] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [detectedTags, setDetectedTags] = useState<DetectedTag[]>([]);

  const [scale, setScale] = useState(1.2);

  const [selectedParagraph, setSelectedParagraph] =
    useState<SelectedParagraph | null>(null);

  const [toolbarAnchor, setToolbarAnchor] =
    useState<HTMLElement | null>(null);

  const [selectedAnnotationId, setSelectedAnnotationId] = useState<
    string | null
  >(null);

  const [pageTextItemsState, setPageTextItemsState] =
    useState<Record<number, TextItemWithIndex[]>>({});

  const annotationState = useAnnotationState();
  const setAnnotations = annotationState.setAnnotations;

  const viewerRef = useRef<HTMLDivElement | null>(null);

  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());

  const pageTextItems =
    useRef<Map<number, TextItemWithIndex[]>>(new Map());

  const pageViewportCache =
    useRef<Map<number, pdfjsLib.PageViewport>>(new Map());

  const textLayerRefs = useRef<Map<number, any>>(new Map());
  const loadedAnnotationKeyRef = useRef<string>('');

  const pages = useMemo(
    () => Array.from({ length: pageCount }, (_, i) => i + 1),
    [pageCount],
  );

  /*
   * LOAD PDF
   */
  useEffect(() => {
    let cancelled = false;

    async function loadDocument() {
      if (!fileUrl) {
        setPdfDoc(null);
        setPageCount(0);
        setDetectedTags([]);
        setError(null);

        pageTextItems.current.clear();
        pageViewportCache.current.clear();

        return;
      }

      setPdfLoading(true);
      setError(null);

      try {
        const loadingTask = pdfjsLib.getDocument({
          url: fileUrl,
          useSystemFonts: true,
        });

        const doc = await loadingTask.promise;

        if (cancelled) return;

        setPdfDoc(doc);
        setPageCount(doc.numPages);
      } catch (err: any) {
        const message = String(err?.message ?? err);

        if (message.toLowerCase().includes('cors')) {
          setError(
            'Failed to load PDF due to CORS. Use a CORS-enabled URL or proxy.',
          );
        } else {
          setError(`Failed to load PDF: ${message}`);
        }

        setPdfDoc(null);
        setPageCount(0);
      } finally {
        if (!cancelled) {
          setPdfLoading(false);
        }
      }
    }

    loadDocument();

    return () => {
      cancelled = true;
    };
  }, [fileUrl]);

  /*
   * RENDER PAGE
   */
  const renderTextLayer = useCallback(
    async (pageNumber: number, page: pdfjsLib.PDFPageProxy, viewport: pdfjsLib.PageViewport) => {
      const pageContainer = pageRefs.current.get(pageNumber);
      if (!pageContainer) return;

      const textLayerDiv = pageContainer.querySelector(
        '.pdf-text-layer',
      ) as HTMLDivElement | null;
      if (!textLayerDiv) return;

      const previousTextLayer = textLayerRefs.current.get(pageNumber);
      if (previousTextLayer?.cancel) {
        previousTextLayer.cancel();
      }

      textLayerDiv.innerHTML = '';
      textLayerDiv.style.setProperty('--total-scale-factor', `${viewport.scale}`);
      textLayerDiv.style.position = 'absolute';
      textLayerDiv.style.inset = '0';
      textLayerDiv.style.pointerEvents = 'auto';
      textLayerDiv.style.userSelect = 'text';

      const textContent = await page.getTextContent();
      const textLayer = new (pdfjsLib as any).TextLayer({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport,
      });

      textLayerRefs.current.set(pageNumber, textLayer);

      await textLayer.render();
      textLayer.textDivs?.forEach((div: HTMLElement, index: number) => {
        if (div instanceof HTMLElement) {
          div.dataset.spanIndex = String(index);
        }
      });
    },
    [],
  );

  const renderPage = useCallback(
    async (pageNumber: number) => {
      if (!pdfDoc) return;

      const canvas = canvasRefs.current.get(pageNumber);

      if (!canvas) return;

      try {
        const page = await pdfDoc.getPage(pageNumber);

        const viewport = page.getViewport({ scale });

        pageViewportCache.current.set(pageNumber, viewport);

        const ctx = canvas.getContext('2d');

        if (!ctx) return;

        const pixelRatio = window.devicePixelRatio || 1;

        canvas.width = Math.floor(viewport.width * pixelRatio);

        canvas.height = Math.floor(viewport.height * pixelRatio);

        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const renderContext = {
          canvas,
          canvasContext: ctx,
          viewport,
        };

        await Promise.all([
          page.render(renderContext).promise,
          renderTextLayer(pageNumber, page, viewport),
        ]);
      } catch (err) {
        console.error(`Failed to render page ${pageNumber}`, err);
      }
    },
    [pdfDoc, renderTextLayer, scale],
  );

  /*
   * INITIAL RENDER
   */
  useEffect(() => {
    if (!pdfDoc || !pageCount || pdfLoading) return;

    let cancelled = false;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;

        pages.forEach((pageNumber) => {
          renderPage(pageNumber).catch(console.error);
        });
      });
    });

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pageCount, pages, renderPage, pdfLoading]);

  /*
   * DETECT TAGS
   */
  const detectDocument = useCallback(
    async (doc: pdfjsLib.PDFDocumentProxy) => {
      const matches: DetectedTag[] = [];
      const reconstructedAnnotations: UserAnnotation[] = [];

      for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
        const page = await doc.getPage(pageNumber);

        const viewport = page.getViewport({ scale });

        pageViewportCache.current.set(pageNumber, viewport);

        let items = pageTextItems.current.get(pageNumber);

        if (!items) {
          const textContent = await page.getTextContent();

          items = (textContent.items as any[]).map((item, index) => ({
            ...item,
            index,
          }));

          pageTextItems.current.set(pageNumber, items);
          setPageTextItemsState((prev) => {
            const nextState = {
              ...(prev as Record<number, TextItemWithIndex[]>),
              [pageNumber]: items,
            } as Record<number, TextItemWithIndex[]>;
            return nextState;
          });
        }

        for (const annotation of annotations) {
          if (annotation.page !== pageNumber) {
            continue;
          }

          const phraseMatches = findPhraseBounds(
            annotation.text,
            items,
          );

          for (const match of phraseMatches) {
            const matchId =
              annotation.id ??
              `${annotation.type}-${pageNumber}-${match.startSpanIndex}-${match.endSpanIndex}`;

            matches.push({
              id: matchId,

              page: pageNumber,

              annotationType: annotation.type,

              annotationText: annotation.text,

              startSpanIndex: match.startSpanIndex,

              endSpanIndex: match.endSpanIndex,
            });

            const matchRect = computeMatchRect(
              viewport,
              items,
              match.startSpanIndex,
              match.endSpanIndex,
              matchId,
              annotation.type,
              annotation.text,
              pageNumber,
            );

            if (matchRect) {
              reconstructedAnnotations.push(
                fromPersistedAnnotation(
                  annotation,
                  {
                    left: matchRect.left - 2,
                    top: matchRect.top,
                    width: matchRect.width + 4,
                    height: matchRect.height + 4,
                  },
                  Array.from(
                    { length: match.endSpanIndex - match.startSpanIndex + 1 },
                    (_, index) => match.startSpanIndex + index,
                  ),
                  matchId,
                ),
              );
            }
          }
        }
      }

      setDetectedTags(matches);
      const annotationKey = JSON.stringify({
        fileUrl,
        annotations,
        scale
      });

      if (loadedAnnotationKeyRef.current !== annotationKey) {
        loadedAnnotationKeyRef.current = annotationKey;
        setAnnotations(reconstructedAnnotations);
      }
    },
    [annotations, fileUrl, scale, setAnnotations],
  );

  /*
   * RUN DETECTION
   */
  useEffect(() => {
    if (!pdfDoc) return;

    let cancelled = false;

    async function detect() {
      if (!pdfDoc) return;
      setDetecting(true);

      try {
        await detectDocument(pdfDoc);
      } catch (err: any) {
        if (!cancelled) {
          setError(String(err?.message ?? err));
        }
      } finally {
        if (!cancelled) {
          setDetecting(false);
        }
      }
    }

    detect();

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, detectDocument]);

  /*
   * PAGE RECTS
   */
  const pageRects = useMemo(() => {
    return detectedTags
      .map((tag) => {
        const viewport = pageViewportCache.current.get(tag.page);

        const items = pageTextItems.current.get(tag.page);

        if (!viewport || !items) {
          return null;
        }

        return computeMatchRect(
          viewport,
          items,
          tag.startSpanIndex,
          tag.endSpanIndex,
          tag.id,
          tag.annotationType,
          tag.annotationText,
          tag.page,
        );
      })
      .filter((rect): rect is PageMatchRect => rect !== null);
  }, [detectedTags]);

  /*
   * SCROLL TO TAG
   */
  const scrollToTag = useCallback((rect: PageMatchRect) => {
    const viewer = viewerRef.current;

    const pageElement = pageRefs.current.get(rect.page);

    if (!viewer || !pageElement) return;

    const pageBounds = pageElement.getBoundingClientRect();

    const viewerBounds = viewer.getBoundingClientRect();

    const currentScroll = viewer.scrollTop;

    const targetTop =
      currentScroll +
      (pageBounds.top - viewerBounds.top) +
      rect.top -
      20;

    viewer.scrollTo({
      top: targetTop,
      behavior: 'smooth',
    });
  }, []);

  /*
   * ZOOM CONTROLS
   */
  const handleZoomIn = () => {
    setScale((prev) =>
      Math.min(MAX_SCALE, prev + SCALE_STEP),
    );
  };

  const handleZoomOut = () => {
    setScale((prev) =>
      Math.max(MIN_SCALE, prev - SCALE_STEP),
    );
  };

  const handleReset = () => {
    setScale(1.2);
  };

  const handleFitWidth = () => {
    const viewer = viewerRef.current;

    if (!viewer) return;

    const firstPage = pageViewportCache.current.get(1);

    if (!firstPage) return;

    const wrapperWidth = viewer.clientWidth - 32;

    const newScale = Math.max(
      MIN_SCALE,
      Math.min(MAX_SCALE, wrapperWidth / firstPage.width),
    );

    setScale(newScale);
  };

  const getAnnotationStyles = (type: PdfAnnotationType) => {
    if (type === 'section') {
      return {
        bgColor: 'rgba(47, 128, 237, 0.08)',
        borderColor: 'rgba(47, 128, 237, 0.45)',
        badgeBgColor: '#2f80ed',
      };
    }

    if (type === 'sub-section') {
      return {
        bgColor: 'rgba(47, 128, 237, 0.08)',
        borderColor: 'rgba(47, 128, 237, 0.45)',
        badgeBgColor: '#2f80ed',
      };
    }

    if (type === 'question') {
      return {
        bgColor: 'rgba(39, 174, 96, 0.08)',
        borderColor: 'rgba(39, 174, 96, 0.45)',
        badgeBgColor: '#27ae60',
      };
    }

    if (type === 'sub-question') {
      return {
        bgColor: 'rgba(39, 174, 96, 0.08)',
        borderColor: 'rgba(39, 174, 96, 0.45)',
        badgeBgColor: '#27ae60',
      };
    }

    if (type === 'answer') {
      return {
        bgColor: 'rgba(187, 44, 237, 0.08)',
        borderColor: 'rgba(187, 44, 237, 0.45)',
        badgeBgColor: '#bb2ced',
      };
    }

    if (type === 'description') {
      return {
        bgColor: 'rgba(255, 107, 58, 0.08)',
        borderColor: 'rgba(255, 107, 58, 0.45)',
        badgeBgColor: '#ff6b3a',
      };
    }

    return {
      bgColor: 'rgba(107, 114, 128, 0.08)',
      borderColor: 'rgba(107, 114, 128, 0.45)',
      badgeBgColor: '#6b7280',
    };
  };

  const getBadgeLabel = (type: PdfAnnotationType) =>
    type === 'section'
      ? 'S'
      : type === 'sub-section'
      ? 'SS'
      : type === 'question'
      ? 'Q'
      : type === 'sub-question'
      ? 'SQ'
      : type === 'answer'
      ? 'A'
      : type === 'description'
      ? 'D'
      : 'I';

  const renderAnnotationOverlay = (
    key: string,
    left: number,
    top: number,
    width: number,
    height: number,
    type: PdfAnnotationType,
    badgeLabel: string,
    onBadgeClick: (event: any) => void,
    onBoxClick?: (event: any) => void,
  ) => {
    const { bgColor, borderColor, badgeBgColor } = getAnnotationStyles(type);

    return (
      <Box
        key={key}
        data-pdf-annotation="true"
        sx={{
          position: 'absolute',
          left,
          top,
          width,
          height,
          pointerEvents: 'auto',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            backgroundColor: bgColor,
            border: `1.5px solid ${borderColor}`,
            borderRadius: '3px',
            boxSizing: 'border-box',
            pointerEvents: onBoxClick ? 'auto' : 'none',
            cursor: onBoxClick ? 'pointer' : 'default',
            transition: 'all 150ms ease-out',
            '&:hover': onBoxClick
              ? {
                  backgroundColor: bgColor.replace('0.08', '0.12'),
                }
              : undefined,
          }}
          onClick={onBoxClick}
        />

        <Box
          sx={{
            position: 'absolute',
            left: -48,
            top: 0,
            bgcolor: badgeBgColor,
            color: '#ffffff',
            px: 0.8,
            py: 0.3,
            borderRadius: '3px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
            fontSize: '11px',
            fontWeight: 700,
            whiteSpace: 'nowrap',
            pointerEvents: 'auto',
            cursor: 'pointer',
            zIndex: 11,
            userSelect: 'none',
            transition: 'all 150ms ease-out',
            '&:hover': {
              boxShadow: '0 2px 5px rgba(0,0,0,0.18)',
              transform: 'translateY(-1px)',
            },
          }}
          onClick={onBadgeClick}
        >
          [{badgeLabel}]
        </Box>
      </Box>
    );
  };

  /*
   * UNDO / REDO
   */
  const handleUndo = useCallback(() => {
    annotationState.undo();
  }, [annotationState]);

  const handleRedo = useCallback(() => {
    annotationState.redo();
  }, [annotationState]);

  const getSelectedSpanIndices = useCallback(
    (pageNumber: number, selection: Selection): number[] => {
      const pageContainer = pageRefs.current.get(pageNumber);
      if (!pageContainer) {
        return [];
      }

      const textLayer = pageContainer.querySelector(
        '.pdf-text-layer',
      ) as HTMLElement | null;
      if (!textLayer || selection.rangeCount === 0) {
        return [];
      }

      const range = selection.getRangeAt(0);
      const selectionRects = Array.from(range.getClientRects());
      if (!selectionRects.length) {
        return [];
      }

      const spans = Array.from(
        textLayer.querySelectorAll('span[data-span-index]'),
      ) as HTMLElement[];

      const selectedIndices = new Set<number>();
      spans.forEach((span) => {
        const spanIndex = Number(span.dataset.spanIndex);
        if (Number.isNaN(spanIndex)) return;

        const spanRects = Array.from(span.getClientRects());
        for (const spanRect of spanRects) {
          for (const selectionRect of selectionRects) {
            const intersects =
              spanRect.left < selectionRect.right &&
              spanRect.right > selectionRect.left &&
              spanRect.top < selectionRect.bottom &&
              spanRect.bottom > selectionRect.top;

            if (intersects) {
              selectedIndices.add(spanIndex);
              return;
            }
          }
        }
      });

      return Array.from(selectedIndices).sort((a, b) => a - b);
    },
    [],
  );

  const getSelectionFromRange = useCallback(
    (pageNumber: number, selection: Selection): SelectedParagraph | null => {
      const pageContainer = pageRefs.current.get(pageNumber);
      if (!pageContainer || selection.rangeCount === 0) {
        return null;
      }

      const range = selection.getRangeAt(0);
      const selectionRects = Array.from(range.getClientRects());
      if (!selectionRects.length) {
        return null;
      }

      const pageBounds = pageContainer.getBoundingClientRect();
      const rects = selectionRects
        .map((selectionRect) => ({
          left: selectionRect.left - pageBounds.left,
          top: selectionRect.top - pageBounds.top,
          width: selectionRect.width,
          height: selectionRect.height,
        }))
        .filter((rect) => rect.width > 0 && rect.height > 0);

      if (!rects.length) {
        return null;
      }

      const left = Math.min(...rects.map((rect) => rect.left));
      const top = Math.min(...rects.map((rect) => rect.top));
      const right = Math.max(
        ...rects.map((rect) => rect.left + rect.width),
      );
      const bottom = Math.max(
        ...rects.map((rect) => rect.top + rect.height),
      );

      const selectedSpanIndices = getSelectedSpanIndices(
        pageNumber,
        selection,
      );
      if (!selectedSpanIndices.length) {
        return null;
      }

      const selectedText = selection.toString().trim();
      if (!selectedText.length) {
        return null;
      }

      return {
        id: `selection-${Date.now()}`,
        page: pageNumber,
        text: selectedText,
        rect: {
          left,
          top,
          right,
          bottom,
          width: right - left,
          height: bottom - top,
        },
        spanIndices: selectedSpanIndices,
        startSpanIndex: Math.min(...selectedSpanIndices),
        endSpanIndex: Math.max(...selectedSpanIndices),
        selectionRects: rects,
      } as SelectedParagraph;
    },
    [getSelectedSpanIndices],
  );

  const handleTextLayerMouseUp = useCallback(
    (
      event: React.MouseEvent<HTMLDivElement>,
      pageNumber: number,
    ) => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        return;
      }

      const paragraphSelection = getSelectionFromRange(
        pageNumber,
        selection,
      );
      if (!paragraphSelection) {
        return;
      }

      setSelectedParagraph(paragraphSelection);
      setSelectedAnnotationId(null);

      const existingAnnotation = annotationState.userAnnotations.find(
        (annotation) =>
          annotation.page === pageNumber &&
          annotation.startSpanIndex === paragraphSelection.startSpanIndex &&
          annotation.endSpanIndex === paragraphSelection.endSpanIndex,
      );

      if (existingAnnotation) {
        setSelectedAnnotationId(existingAnnotation.id);
      }

      const rects = Array.from(
        selection.getRangeAt(0).getClientRects(),
      );
      if (!rects.length) {
        return;
      }

      const lastRect = rects[rects.length - 1];
      const virtualAnchor = document.createElement('div');
      virtualAnchor.style.position = 'fixed';
      virtualAnchor.style.top = `${lastRect.bottom}px`;
      virtualAnchor.style.left = `${lastRect.left}px`;
      virtualAnchor.style.width = `${lastRect.width}px`;
      virtualAnchor.style.height = '0px';
      virtualAnchor.style.pointerEvents = 'none';
      virtualAnchor.style.visibility = 'hidden';
      document.body.appendChild(virtualAnchor);

      setToolbarAnchor(virtualAnchor);

      const cleanup = () => {
        if (virtualAnchor.parentNode) {
          virtualAnchor.parentNode.removeChild(virtualAnchor);
        }
      };

      (virtualAnchor as any).__cleanup = cleanup;
    },
    [annotationState.userAnnotations, getSelectionFromRange],
  );

  /*
   * TOOLBAR ACTIONS
   */
  const handleToolbarAction = useCallback(
    (
      action: string,
      paragraph: SelectedParagraph,
    ) => {
      if (action === 'clear') {
        // Remove annotation if it exists
        if (selectedAnnotationId) {
          annotationState.removeAnnotation(selectedAnnotationId);
          setSelectedAnnotationId(null);
        }
        setSelectedParagraph(null);
        setToolbarAnchor(null);
        // Clear browser selection
        window.getSelection()?.removeAllRanges();
      } else {
        // Assign/change annotation type
        const annotationType = action as any;

        if (selectedAnnotationId) {
          // Update existing annotation
          annotationState.updateAnnotationType(
            selectedAnnotationId,
            annotationType,
          );
          // Clear selection and hide toolbar after update
          setSelectedParagraph(null);
          setToolbarAnchor(null);
          window.getSelection()?.removeAllRanges();
        } else {
          // Create new annotation
          const annotation = annotationState.addAnnotation(
            paragraph.page,
            paragraph.text,
            annotationType,
            {
              left: paragraph.rect.left,
              top: paragraph.rect.top,
              width: paragraph.rect.width,
              height: paragraph.rect.height,
              right: paragraph.rect.right,
              bottom: paragraph.rect.bottom,
            },
            paragraph.spanIndices,
            paragraph.selectionRects,
          );
          setSelectedAnnotationId(annotation.id);
          // Clear selection and hide toolbar after creation
          setSelectedParagraph(null);
          setToolbarAnchor(null);
          window.getSelection()?.removeAllRanges();
        }
      }
    },
    [selectedAnnotationId, annotationState],
  );

  const handleToolbarClose = useCallback(() => {
    if (toolbarAnchor && (toolbarAnchor as any).__cleanup) {
      (toolbarAnchor as any).__cleanup();
    }
    setSelectedParagraph(null);
    setSelectedAnnotationId(null);
    setToolbarAnchor(null);
  }, [toolbarAnchor]);

  useEffect(() => {
    return () => {
      if (toolbarAnchor && (toolbarAnchor as any).__cleanup) {
        (toolbarAnchor as any).__cleanup();
      }
    };
  }, [toolbarAnchor]);

  useEffect(() => {
    if (!toolbarAnchor && !selectedParagraph) {
      return undefined;
    }

    const handleDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }

      if (
        target.closest('[data-pdf-annotation-toolbar="true"]') ||
        target.closest('[data-pdf-annotation="true"]')
      ) {
        return;
      }

      handleToolbarClose();
      window.getSelection()?.removeAllRanges();
    };

    document.addEventListener('mousedown', handleDocumentMouseDown);

    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown);
    };
  }, [handleToolbarClose, selectedParagraph, toolbarAnchor]);

  return (
    <Box display="flex" flexDirection="column" gap={2}>
      {/* Toolbar */}
      <Box display="flex" alignItems="center" gap={1}>
        <Typography variant="subtitle1" fontWeight={600}>
          Viewer controls:
        </Typography>

        <IconButton onClick={handleZoomIn} size="small" title="Zoom in">
          <ZoomInIcon />
        </IconButton>

        <IconButton onClick={handleZoomOut} size="small" title="Zoom out">
          <ZoomOutIcon />
        </IconButton>

        <IconButton onClick={handleReset} size="small" title="Reset zoom">
          <RestoreIcon />
        </IconButton>

        <IconButton onClick={handleFitWidth} size="small" title="Fit to width">
          <FitScreenIcon />
        </IconButton>

        <IconButton
          onClick={handleUndo}
          size="small"
          disabled={!annotationState.canUndo()}
          title="Undo"
        >
          <UndoIcon />
        </IconButton>

        <IconButton
          onClick={handleRedo}
          size="small"
          disabled={!annotationState.canRedo()}
          title="Redo"
        >
          <RedoIcon />
        </IconButton>

        <Typography variant="body2" ml={2}>
          Scale: {scale.toFixed(1)}x
        </Typography>

        {detecting ? (
          <Typography variant="body2" color="text.secondary">
            Detecting tags...
          </Typography>
        ) : null}
      </Box>

      {/* Error */}
      {error ? (
        <Paper
          variant="outlined"
          sx={{
            p: 2,
            borderColor: 'error.main',
            backgroundColor: '#ffebee',
          }}
        >
          <Typography color="error" fontWeight={600}>
            {error}
          </Typography>
        </Paper>
      ) : null}

      {/* Viewer */}
      <Box
        display="grid"
        gridTemplateColumns={{ xs: '1fr', md: '3fr 1fr' }}
        gap={2}
        minHeight="70vh"
      >
        <Paper
          sx={{
            position: 'relative',
            overflow: 'hidden',
            minHeight: 520,
          }}
        >
          <Box
            ref={viewerRef}
            sx={{
              height: '100%',
              overflowY: 'auto',
              position: 'relative',
              p: 2,
            }}
          >
            {pdfLoading ? (
              <Box
                display="flex"
                justifyContent="center"
                alignItems="center"
                height="100%"
              >
                <CircularProgress />
              </Box>
            ) : !fileUrl ? (
              <Box p={4} textAlign="center">
                <Typography>
                  Provide a fileUrl to preview the document.
                </Typography>
              </Box>
            ) : (
              pages.map((pageNumber) => {
                const viewport =
                  pageViewportCache.current.get(pageNumber);

                return (
                  <Box
                    key={pageNumber}
                    sx={{
                      position: 'relative',
                      mb: 3,
                      display: 'flex',
                      justifyContent: 'center',
                    }}
                  >
                    <Box sx={{ position: 'relative' }} 
                      ref={(element: HTMLDivElement | null) => {
                      if (element) {
                        pageRefs.current.set(pageNumber, element);
                      } else {
                        pageRefs.current.delete(pageNumber);
                      }
                      }}
                    >
                      <canvas
                        ref={(canvas) => {
                          if (canvas) {
                            canvasRefs.current.set(
                              pageNumber,
                              canvas,
                            );
                          }
                        }}
                        style={{
                          width: viewport
                            ? `${viewport.width}px`
                            : '800px',
                          height: viewport
                            ? `${viewport.height}px`
                            : '1000px',
                          display: 'block',
                          border: '1px solid #e0e0e0',
                          borderRadius: 4,
                          backgroundColor: '#fff',
                          pointerEvents: 'none',
                        }}
                      />

                      {/* {viewport ? ( */}
                        <Box sx={{ position: 'absolute', inset: 0 }}>
                          <Box
                            className="pdf-text-layer textLayer"
                            onMouseUp={(e) =>
                              handleTextLayerMouseUp(e, pageNumber)
                            }
                            sx={{
                              position: 'absolute',
                              inset: 0,
                              pointerEvents: 'auto',
                              userSelect: 'text',
                              WebkitUserSelect: 'text',
                              MozUserSelect: 'text',
                            }}
                          />

                          <Box
                            sx={{
                              position: 'absolute',
                              inset: 0,
                              pointerEvents: 'none',
                            }}
                          >
                          {/* Highlight overlays render only from browser text selection, not custom overlays */}


                          {annotationState.userAnnotations
                            .filter((a) => a.page === pageNumber)
                            .map((annotation) => {
                              const handleAnnotationSelect = (event: any) => {
                                if (event?.stopPropagation) {
                                  event.stopPropagation();
                                }

                                setSelectedAnnotationId(annotation.id);
                                setSelectedParagraph({
                                  id: annotation.id,
                                  page: annotation.page,
                                  text: annotation.text,
                                  rect: annotation.rect,
                                });

                                const targetRect =
                                  event?.currentTarget?.getBoundingClientRect?.();
                                const rect = targetRect ?? annotation.rect;
                                if (rect) {
                                  const virtualAnchor = document.createElement('div');
                                  virtualAnchor.style.position = 'fixed';
                                  virtualAnchor.style.top = `${rect.bottom ?? rect.top + rect.height}px`;
                                  virtualAnchor.style.left = `${rect.left}px`;
                                  virtualAnchor.style.width = `${rect.width}px`;
                                  virtualAnchor.style.height = '0px';
                                  virtualAnchor.style.pointerEvents = 'none';
                                  virtualAnchor.style.visibility = 'hidden';
                                  document.body.appendChild(virtualAnchor);
                                  setToolbarAnchor(virtualAnchor);
                                  (virtualAnchor as any).__cleanup = () => {
                                    if (virtualAnchor.parentNode) {
                                      virtualAnchor.parentNode.removeChild(virtualAnchor);
                                    }
                                  };
                                }
                              };

                              return renderAnnotationOverlay(
                                annotation.id,
                                annotation.rect.left,
                                annotation.rect.top,
                                annotation.rect.width,
                                annotation.rect.height,
                                annotation.type,
                                getBadgeLabel(annotation.type),
                                handleAnnotationSelect,
                                handleAnnotationSelect,
                              );
                            })}


                        </Box>
                        </Box>
                      {/* ) : null} */}
                    </Box>
                  </Box>
                );
              })
            )}
          </Box>
        </Paper>

        {/* Annotation Panel */}
        <AnnotationPanel
          userAnnotations={annotationState.userAnnotations}
          predefinedAnnotations={annotations}
        />
      </Box>

      {/* Paragraph Toolbar */}
      {selectedParagraph && (
        <ParagraphToolbar
          selectedParagraph={selectedParagraph}
          anchorElement={toolbarAnchor}
          onAction={handleToolbarAction}
          onClose={handleToolbarClose}
          existingType={
            selectedAnnotationId
              ? annotationState.userAnnotations.find(
                  (a) => a.id === selectedAnnotationId,
                )?.type
              : undefined
          }
        />
      )}
    </Box>
  );
}
