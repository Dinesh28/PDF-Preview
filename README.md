# react-pdf-tag-viewer

A reusable React + TypeScript library for PDF tagging and annotation preview using PDF.js.

## Usage

Install the library in your application:

```bash
npm install react-pdf-tag-viewer pdfjs-dist @mui/material @mui/icons-material @emotion/react @emotion/styled react react-dom
```

Use the `PdfTagViewer` component in your React app:

```tsx
import React from 'react';
import { PdfTagViewer, PdfAnnotation } from 'react-pdf-tag-viewer';

const annotations: PdfAnnotation[] = [
  { page: 1, text: 'Example section', type: 'section' },
  { page: 1, text: 'Example question', type: 'question' },
];

export default function App() {
  return (
    <PdfTagViewer
      fileUrl="https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf"
      annotations={annotations}
    />
  );
}
```
