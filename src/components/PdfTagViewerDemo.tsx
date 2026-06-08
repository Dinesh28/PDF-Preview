import { Container, Typography } from '@mui/material';
import PdfTagViewer from './PdfTagViewer';
import { PdfAnnotation } from '../types';

const sampleFileUrl = 'https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf';

const sampleAnnotations: PdfAnnotation[] = [
  { page: 1, text: '1. introduction', type: 'section' },
  { page: 1, text:  "Trace-based Just-in-Time Type Specialization for Dynamic Languages",
      "type": "section" },
  { page: 1, text: '"Dynamic languages such as JavaScript are more difficult to com-\npile than statically typed ones. Since no concrete type information\nis available, traditional compilers need to emit generic code that can\nhandle all possible type combinations at runtime.",', type: 'section' },
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
