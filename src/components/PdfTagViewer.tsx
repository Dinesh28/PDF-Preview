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

import {
  DetectedTag,
  PageMatchRect,
  PdfAnnotation,
  TextItemWithIndex,
} from '../types';

import { findPhraseBounds } from '../utils/pdfAnnotations';

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

  const viewerRef = useRef<HTMLDivElement | null>(null);

  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());

  const pageTextItems =
    useRef<Map<number, TextItemWithIndex[]>>(new Map());

  const pageViewportCache =
    useRef<Map<number, pdfjsLib.PageViewport>>(new Map());

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

        await page.render(renderContext).promise;
      } catch (err) {
        console.error(`Failed to render page ${pageNumber}`, err);
      }
    },
    [pdfDoc, scale],
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
        }

        for (const annotation of annotations) {
          const phraseMatches = findPhraseBounds(
            annotation.text,
            items,
          );

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

  return (
    <Box display="flex" flexDirection="column" gap={2}>
      {/* Toolbar */}
      <Box display="flex" alignItems="center" gap={1}>
        <Typography variant="subtitle1" fontWeight={600}>
          Viewer controls:
        </Typography>

        <IconButton onClick={handleZoomIn} size="small">
          <ZoomInIcon />
        </IconButton>

        <IconButton onClick={handleZoomOut} size="small">
          <ZoomOutIcon />
        </IconButton>

        <IconButton onClick={handleReset} size="small">
          <RestoreIcon />
        </IconButton>

        <IconButton onClick={handleFitWidth} size="small">
          <FitScreenIcon />
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
                    ref={(element: HTMLDivElement | null) => {
                      if (element) {
                        pageRefs.current.set(pageNumber, element);
                      } else {
                        pageRefs.current.delete(pageNumber);
                      }
                    }}
                    sx={{
                      position: 'relative',
                      mb: 3,
                      display: 'flex',
                      justifyContent: 'center',
                    }}
                  >
                    <Box sx={{ position: 'relative' }}>
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
                        }}
                      />

                      {viewport ? (
                        <Box
                          sx={{
                            position: 'absolute',
                            inset: 0,
                            pointerEvents: 'none',
                          }}
                        >
                          {pageRects
                            .filter(
                              (rect) =>
                                rect.page === pageNumber,
                            )
                            .map((rect) => (
                              <>
                              <Box
                                key={rect.id}
                                sx={{
                                  position: 'absolute',
                                  left: rect.left - 2,
                                  top: rect.top ,
                                  width: rect.width + 4,
                                  height: rect.height + 4,
                                  backgroundColor: rect.type.includes('section') ?'rgba(79, 255, 91, 0.28)':
                                    'rgba(255, 213, 79, 0.28)',
                                  border:rect.type.includes('section') ?'1px solid rgba(7, 255, 69, 0.8)':
                                    '1px solid rgba(255, 193, 7, 0.8)',
                                  borderRadius: 2,
                                  boxSizing: 'border-box',
                                  pointerEvents: 'none',
                                }}
                              />
                              <Box
                                key={`badge-${rect.id}`}
                                onClick={() => scrollToTag(rect)}
                                sx={{
                                  position: 'absolute',
                                  left: Math.max(8, rect.left - 40),
                                  top: rect.top - 4,
                                  bgcolor: rect.type.includes('section') ?'rgb(5, 137, 14)':
                                    'rgb(159, 120, 12)',
                                  color: '#ffffff',
                                  px: 1.25,
                                  py: 0.4,
                                  borderRadius: '999px',
                                  boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                                  textTransform: 'uppercase',
                                  fontSize: 11,
                                  fontWeight: 600,
                                  border:rect.type.includes('section') ?'1px solid rgba(7, 255, 69, 0.8)':
                                    '1px solid rgba(255, 193, 7, 0.8)',
                                  whiteSpace: 'nowrap',
                                  pointerEvents: 'auto',
                                  cursor: 'pointer',
                                  zIndex: 10,
                                  userSelect: 'none',
                                }}
                              >
                                {rect.type[0]}
                              </Box>
                              </>
                            ))}
                        </Box>
                      ) : null}
                    </Box>
                  </Box>
                );
              })
            )}
          </Box>
        </Paper>
      </Box>
    </Box>
  );
}