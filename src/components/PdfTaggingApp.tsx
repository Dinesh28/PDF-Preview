import { FormEvent, useMemo, useState } from 'react';
import { Autocomplete, Box, Button, Chip, Container, Grid, Paper, TextField, Typography, Alert } from '@mui/material';
import PdfBadgeViewer from './PdfBadgeViewer';
import { buildAnnotationsFromInputs, sanitizeAnnotations } from '../utils/pdfAnnotations';
import { PdfAnnotation } from '../types';

const INPUT_FIELDS = [
  { id: 'sections', label: 'Sections' },
  { id: 'subSections', label: 'Sub-sections' },
  { id: 'questions', label: 'Questions' },
  { id: 'subQuestions', label: 'Sub-questions' },
] as const;

type InputFieldId = (typeof INPUT_FIELDS)[number]['id'];

type InputState = Record<InputFieldId, string[]>;

const initialInputs: InputState = {
  sections: [],
  subSections: [],
  questions: [],
  subQuestions: [],
};

function normalizeChipValues(values: Array<string | unknown>): string[] {
  const seen = new Set<string>();
  return values.reduce<string[]>((acc, value) => {
    const normalized = String(value ?? '').trim().replace(/\s+/g, ' ');
    const key = normalized.toLowerCase();
    if (normalized && !seen.has(key)) {
      seen.add(key);
      acc.push(normalized);
    }
    return acc;
  }, []);
}

export default function PdfTaggingApp() {
  const [pdfUrl, setPdfUrl] = useState('');
  const [inputs, setInputs] = useState<InputState>(initialInputs);
  const [annotations, setAnnotations] = useState<PdfAnnotation[]>([]);
  const [error, setError] = useState<string | null>(null);

  const exampleUrl = useMemo(
    () => 'https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf',
    [],
  );

  const handleChipChange = (field: InputFieldId, values: Array<string | unknown>) => {
    setInputs((prev) => ({
      ...prev,
      [field]: normalizeChipValues(values),
    }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!pdfUrl.trim()) {
      setError('Enter a valid PDF URL.');
      return;
    }

    try {
      new URL(pdfUrl.trim());
    } catch {
      setError('Enter a valid PDF URL with http:// or https://.');
      return;
    }

    const built = buildAnnotationsFromInputs({
      sections: inputs.sections,
      subSections: inputs.subSections,
      questions: inputs.questions,
      subQuestions: inputs.subQuestions,
    });

    setAnnotations(sanitizeAnnotations(built));
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, mb: 4 }}>
        <Typography variant="h4" gutterBottom>
          PDF Tagging Preview
        </Typography>
        <Typography variant="body1" color="text.secondary" paragraph>
          Paste a PDF URL, add tag phrases, and preview matched text with badges and scroll navigation.
        </Typography>

        <Box component="form" onSubmit={handleSubmit} noValidate>
          <Grid container spacing={2}>
            <Grid item xs={12} md={8}>
              <TextField
                label="PDF URL"
                placeholder={exampleUrl}
                value={pdfUrl}
                fullWidth
                onChange={(event) => setPdfUrl(event.target.value)}
                helperText="The PDF must be accessible via the browser and may require CORS support."
              />
            </Grid>
            <Grid item xs={12} md={4} display="flex" alignItems="end">
              <Button type="submit" variant="contained" size="large" fullWidth>
                Submit
              </Button>
            </Grid>

            {INPUT_FIELDS.map((field) => (
              <Grid item xs={12} md={6} key={field.id}>
                <Autocomplete
                  freeSolo
                  multiple
                  filterSelectedOptions
                  onChange={(_, value) => handleChipChange(field.id, value)}
                  options={[]}
                  value={inputs[field.id]}
                  renderTags={(value, getTagProps) =>
                    value.map((option, index) => (
                      <Chip label={option} {...getTagProps({ index })} />
                    ))
                  }
                  renderInput={(params) => (
                    <TextField {...params} label={field.label} placeholder="Add phrase and press Enter" />
                  )}
                />
              </Grid>
            ))}
          </Grid>
          {error ? (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          ) : null}
        </Box>
      </Paper>

      <PdfBadgeViewer pdfUrl={pdfUrl} annotations={annotations} />
    </Container>
  );
}
