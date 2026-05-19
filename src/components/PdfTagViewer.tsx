import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { Box, CircularProgress, Divider, IconButton, Paper, Typography } from '@mui/material';
import FitScreenIcon from '@mui/icons-material/FitScreen';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import RestoreIcon from '@mui/icons-material/Restore';
import { DetectedTag, PageMatchRect, PdfAnnotation, TextItemWithIndex } from '../types';
import { findPhraseBounds } from '../utils/pdfAnnotations';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const MIN_SCALE = 0.6;
const MAX_SCALE = 2.4;
const SCALE_STEP = 0.2;

type PdfTagViewerProps = {
  fileUrl: string;
  annotations: PdfAnnotation[];
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
  if (selectedItems.length === 0) {
    return null;
  }

  const boxes = selectedItems.map((item) => {
    const points = [
      viewport.convertToViewportPoint(item.transform[4], item.transform[5]),
      viewport.convertToViewportPoint(item.transform[4] + item.width, item.transform[5]),
      viewport.convertToViewportPoint(item.transform[4], item.transform[5] + item.height),
      viewport.convertToViewportPoint(item.transform[4] + item.width, item.transform[5] + item.height),
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

export default function PdfTagViewer({ fileUrl, annotations }: PdfTagViewerProps) {
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detectedTags, setDetectedTags] = useState<DetectedTag[]>([]);
  const [scale, setScale] = useState(1.2);

  const viewerRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const pageTextItems = useRef<Map<number, TextItemWithIndex[]>>(new Map());
  const pageViewportCache = useRef<Map<number, pdfjsLib.PageViewport>>(new Map());
  const renderTask = useRef<Map<number, Promise<void>>>(new Map());

  const pages = useMemo(() => Array.from({ length: pageCount }, (_, index) => index + 1), [pageCount]);

  useEffect(() => {
    let canceled = false;

    async function loadDocument() {
      if (!fileUrl) {
        setPdfDoc(null);
        setPageCount(0);
        setDetectedTags([]);
        setError(null);
        pageTextItems.current.clear();
        pageViewportCache.current.clear();
        renderTask.current.clear();
        return;
      }

      setLoading(true);
      setError(null);
      setDetectedTags([]);
      pageTextItems.current.clear();
      pageViewportCache.current.clear();
      renderTask.current.clear();

      try {
        const loadingTask = pdfjsLib.getDocument({ url: fileUrl, useSystemFonts: true });
        const doc = await loadingTask.promise;
        if (canceled) {
          return;
        }

        setPdfDoc(doc);
        setPageCount(doc.numPages);
      } catch (loadError: any) {
        const message = String(loadError?.message ?? loadError);
        if (message.toLowerCase().includes('cors')) {
          setError('Failed to load PDF due to CORS. Use a CORS-enabled URL or proxy.');
        } else {
          setError(`Failed to load PDF: ${message}`);
        }
        setPdfDoc(null);
        setPageCount(0);
      } finally {
        if (!canceled) {
          setLoading(false);
        }
      }
    }

    loadDocument();

    return () => {
      canceled = true;
    };
  }, [fileUrl]);

  const detectDocument = useCallback(
    async (doc: pdfjsLib.PDFDocumentProxy) => {
      const matches: DetectedTag[] = [];
      const annotationsToSearch = annotations || [];

      for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
        const page = await doc.getPage(pageNumber);
        const viewport = page.getViewport({ scale });
        pageViewportCache.current.set(pageNumber, viewport);

        let items = pageTextItems.current.get(pageNumber);
        if (!items) {
          const textContent = await page.getTextContent();
          items = (textContent.items as any[]).map((item, index) => ({ ...item, index }));
          pageTextItems.current.set(pageNumber, items);
        }

        for (const annotation of annotationsToSearch) {
          const phraseMatches = findPhraseBounds(annotation.text, items);
          for (const match of phraseMatches) {
            matches.push({
              id: `${annotation.type}-${pageNumber}-${match.startSpanIndex}-${match.endSpanIndex}`,
              page: pageNumber,
              annotationType: annotation.type,
              annotationText: annotation.text,
              startSpanIndex: match.startSpanIndex,
              endSpanIndex: match.endSpanIndex,
            });
          }
        }
      }

      setDetectedTags(matches);
    },
    [annotations, scale],
  );

  useEffect(() => {
    if (!pdfDoc) {
      return;
    }

    const pdfDocument = pdfDoc;
    let canceled = false;

    async function detect() {
      setLoading(true);
      setDetectedTags([]);

      try {
        await detectDocument(pdfDocument);
      } catch (detectError: any) {
        if (!canceled) {
          setError(String(detectError?.message ?? detectError));
        }
      } finally {
        if (!canceled) {
          setLoading(false);
        }
      }
    }

    detect();

    return () => {
      canceled = true;
    };
  }, [pdfDoc, detectDocument]);

  const renderPage = useCallback(
    async (pageNumber: number) => {
      if (!pdfDoc) {
        return;
      }

      const existingPromise = renderTask.current.get(pageNumber);
      if (existingPromise) {
        return existingPromise;
      }

      const canvas = canvasRefs.current.get(pageNumber);
      if (!canvas) {
        return;
      }

      const promise = pdfDoc.getPage(pageNumber).then((page) => {
        const viewport = page.getViewport({ scale });
        pageViewportCache.current.set(pageNumber, viewport);
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return;
        }

        const renderContext = {
          canvas,
          canvasContext: ctx,
          viewport,
        };

        return page.render(renderContext).promise;
      });

      renderTask.current.set(pageNumber, promise);
      promise.finally(() => renderTask.current.delete(pageNumber));

      await promise;
    },
    [pdfDoc, scale],
  );

  useEffect(() => {
    if (!pdfDoc || pageCount === 0 || !viewerRef.current) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pageNumber = Number(entry.target.getAttribute('data-page'));
          if (entry.isIntersecting) {
            renderPage(pageNumber).catch(() => {
              /* ignore */
            });
          }
        }
      },
      {
        root: viewerRef.current,
        rootMargin: '800px',
        threshold: 0.1,
      },
    );

    pageRefs.current.forEach((element) => {
      if (element) {
        observer.observe(element);
      }
    });

    return () => observer.disconnect();
  }, [pdfDoc, pageCount, renderPage, scale]);

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
  }, [detectedTags, scale]);

  const scrollToTag = useCallback((rect: PageMatchRect) => {
    const viewer = viewerRef.current;
    const pageElement = pageRefs.current.get(rect.page);
    if (!viewer || !pageElement) {
      return;
    }

    const pageBounds = pageElement.getBoundingClientRect();
    const viewerBounds = viewer.getBoundingClientRect();
    const currentScroll = viewer.scrollTop;
    const targetTop = currentScroll + (pageBounds.top - viewerBounds.top) + rect.top - 20;

    viewer.scrollTo({ top: targetTop, behavior: 'smooth' });
  }, []);

  const handleZoomIn = () => setScale((prev) => Math.min(MAX_SCALE, prev + SCALE_STEP));
  const handleZoomOut = () => setScale((prev) => Math.max(MIN_SCALE, prev - SCALE_STEP));
  const handleReset = () => setScale(1.2);
  const handleFitWidth = () => {
    const viewer = viewerRef.current;
    if (!viewer || pageCount === 0) {
      return;
    }

    const firstPageViewport = pageViewportCache.current.get(1);
    if (!firstPageViewport) {
      return;
    }

    const wrapperWidth = viewer.clientWidth - 32;
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, wrapperWidth / firstPageViewport.width));
    setScale(newScale);
  };

  return (
    <Box display="flex" flexDirection="column" gap={2}>
      <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
        <Typography variant="subtitle1" fontWeight={600}>
          Viewer controls:
        </Typography>
        <IconButton aria-label="Zoom in" onClick={handleZoomIn} size="small">
          <ZoomInIcon />
        </IconButton>
        <IconButton aria-label="Zoom out" onClick={handleZoomOut} size="small">
          <ZoomOutIcon />
        </IconButton>
        <IconButton aria-label="Reset zoom" onClick={handleReset} size="small">
          <RestoreIcon />
        </IconButton>
        <IconButton aria-label="Fit width" onClick={handleFitWidth} size="small">
          <FitScreenIcon />
        </IconButton>
        <Typography variant="body2" color="textSecondary" ml={2}>
          Scale: {scale.toFixed(1)}x
        </Typography>
      </Box>

      {error ? (
        <Paper variant="outlined" sx={{ p: 2, borderColor: 'error.main', backgroundColor: '#ffebee' }}>
          <Typography color="error" fontWeight={600}>
            {error}
          </Typography>
        </Paper>
      ) : null}

      <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: '3fr 1fr' }} gap={2} minHeight="70vh">
        <Paper sx={{ position: 'relative', overflow: 'hidden', minHeight: 520 }}>
          <Box ref={viewerRef} sx={{ height: '100%', overflowY: 'auto', position: 'relative', p: 2 }}>
            {loading ? (
              <Box display="flex" justifyContent="center" alignItems="center" height="100%">
                <CircularProgress />
              </Box>
            ) : !fileUrl ? (
              <Box p={4} textAlign="center">
                <Typography variant="body1">Provide a fileUrl to preview the document.</Typography>
              </Box>
            ) : pageCount === 0 ? (
              <Box p={4} textAlign="center">
                <Typography variant="body1">Loading document...</Typography>
              </Box>
            ) : (
              pages.map((pageNumber) => {
                const viewport = pageViewportCache.current.get(pageNumber);
                return (
                  <Box
                    key={pageNumber}
                    data-page={pageNumber}
                    ref={(element: HTMLDivElement | null) => {
                      if (element) {
                        pageRefs.current.set(pageNumber, element);
                      } else {
                        pageRefs.current.delete(pageNumber);
                      }
                    }}
                    sx={{ position: 'relative', mb: 3, display: 'flex', justifyContent: 'center' }}
                  >
                    <Box sx={{ position: 'relative' }}>
                      <canvas
                        ref={(canvas) => {
                          if (canvas) {
                            canvasRefs.current.set(pageNumber, canvas);
                          }
                        }}
                        style={{
                          width: viewport ? `${viewport.width}px` : '100%',
                          height: viewport ? `${viewport.height}px` : 'auto',
                          display: 'block',
                          border: '1px solid #e0e0e0',
                          borderRadius: 4,
                          backgroundColor: '#fff',
                        }}
                      />
                      {viewport ? (
                        <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                          {pageRects
                            .filter((rect) => rect.page === pageNumber)
                            .map((rect) => (
                              <Box
                                key={rect.id}
                                sx={{
                                  position: 'absolute',
                                  left: rect.left,
                                  top: rect.top,
                                  width: rect.width,
                                  height: rect.height,
                                  backgroundColor: 'rgba(255, 213, 79, 0.28)',
                                  border: '1px solid rgba(255, 193, 7, 0.8)',
                                  borderRadius: 2,
                                }}
                              />
                            ))}
                          {pageRects
                            .filter((rect) => rect.page === pageNumber)
                            .map((rect) => (
                              <Box
                                key={`badge-${rect.id}`}
                                sx={{
                                  position: 'absolute',
                                  left: rect.left + rect.width + 10,
                                  top: rect.top - 4,
                                  bgcolor: 'background.paper',
                                  color: 'text.primary',
                                  px: 1,
                                  py: 0.25,
                                  borderRadius: 1.5,
                                  boxShadow: 2,
                                  fontSize: 11,
                                  border: '1px solid rgba(0,0,0,0.08)',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {rect.type}
                              </Box>
                            ))}
                        </Box>
                      ) : null}
                    </Box>
                    <Box sx={{ position: 'absolute', top: 8, left: 8, bgcolor: 'rgba(255,255,255,0.92)', px: 1, py: 0.5, borderRadius: 1, boxShadow: 1 }}>
                      <Typography variant="caption">Page {pageNumber}</Typography>
                    </Box>
                  </Box>
                );
              })
            )}
          </Box>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2, maxHeight: 520, overflowY: 'auto' }}>
          <Typography variant="h6" mb={1}>
            Detected tags
          </Typography>
          <Divider sx={{ mb: 2 }} />
          {pageRects.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {annotations.length === 0
                ? 'No annotations were provided. Pass annotations via props to visualize matches.'
                : 'No matches were found for the provided annotations.'}
            </Typography>
          ) : (
            pageRects.map((rect) => (
              <Paper
                key={rect.id}
                onClick={() => scrollToTag(rect)}
                sx={{
                  p: 1.25,
                  mb: 1,
                  cursor: 'pointer',
                  '&:hover': { backgroundColor: 'action.hover' },
                }}
                variant="outlined"
              >
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textTransform: 'capitalize' }}>
                  {rect.type} • page {rect.page}
                </Typography>
                <Typography variant="body2" noWrap>
                  {rect.text}
                </Typography>
              </Paper>
            ))
          )}
        </Paper>
      </Box>
    </Box>
  );
}
