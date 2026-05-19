import { Container, Typography } from '@mui/material';
import PdfTagViewer from './PdfTagViewer';
import { PdfAnnotation } from '../types';

const sampleFileUrl = 'https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf';

const sampleAnnotations: PdfAnnotation[] = [
  { page: 1, text: 'Mozilla', type: 'section' },
  { page: 1, text: 'annotation', type: 'question' },
  { page: 1, text: 'PDF.js', type: 'sub-section' },
];

export default function PdfTagViewerDemo() {
  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>
        react-pdf-tag-viewer Demo
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        This demo shows the reusable <code>PdfTagViewer</code> component with a sample PDF and annotations.
      </Typography>
      <PdfTagViewer fileUrl={sampleFileUrl} annotations={sampleAnnotations} />
    </Container>
  );
}
