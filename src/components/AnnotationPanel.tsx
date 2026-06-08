import React, { useState } from 'react';
import {
  Paper,
  Box,
  Typography,
  Button,
  Stack,
  Divider,
  TextField,
  IconButton,
  Chip,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DownloadIcon from '@mui/icons-material/Download';
import { UserAnnotation, PdfAnnotation } from '../types';
import {
  exportAnnotationsAsJSON,
  toPersistedAnnotation,
} from '../utils/annotationManager';

type AnnotationPanelProps = {
  userAnnotations: UserAnnotation[];
  predefinedAnnotations: PdfAnnotation[];
  onRefresh?: () => void;
};

export default function AnnotationPanel({
  userAnnotations,
  predefinedAnnotations,
  onRefresh,
}: AnnotationPanelProps) {
  const [copied, setCopied] = useState(false);

  const annotationState = {
    predefined: [],
    userAnnotations: userAnnotations.map(toPersistedAnnotation),
  };

  const jsonExport = exportAnnotationsAsJSON(annotationState);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonExport);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const element = document.createElement('a');
    const file = new Blob([jsonExport], { type: 'application/json' });
    element.href = URL.createObjectURL(file);
    element.download = `annotations-${Date.now()}.json`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const typeStats = userAnnotations.reduce(
    (acc, annotation) => {
      acc[annotation.type] = (acc[annotation.type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <Paper
      sx={{
        p: 2,
        height: '100%',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        backgroundColor: '#f9f9f9',
      }}
    >
      {/* Statistics */}
      <Box>
        <Typography variant="h6" gutterBottom>
          Annotation Statistics
        </Typography>
        <Stack spacing={1}>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="body2">Total Annotations:</Typography>
            <Chip
              label={userAnnotations.length}
              size="small"
              variant="outlined"
            />
          </Box>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="body2">Predefined:</Typography>
            <Chip
              label={predefinedAnnotations.length}
              size="small"
              variant="outlined"
            />
          </Box>
          <Divider sx={{ my: 1 }} />
          {Object.entries(typeStats).map(([type, count]) => (
            <Box
              key={type}
              display="flex"
              justifyContent="space-between"
              alignItems="center"
            >
              <Typography variant="body2">{type}:</Typography>
              <Chip
                label={count}
                size="small"
                color={
                  type === 'section'
                    ? 'success'
                    : type === 'question'
                      ? 'warning'
                      : 'info'
                }
              />
            </Box>
          ))}
        </Stack>
      </Box>

      <Divider />

      {/* JSON Export */}
      <Box>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
          <Typography variant="h6">JSON Export</Typography>
          <Box gap={0.5} display="flex">
            <IconButton
              size="small"
              onClick={handleCopy}
              title={copied ? 'Copied!' : 'Copy to clipboard'}
            >
              <ContentCopyIcon sx={{ fontSize: 18 }} />
            </IconButton>
            <IconButton size="small" onClick={handleDownload} title="Download">
              <DownloadIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Box>
        </Box>

        <TextField
          fullWidth
          multiline
          rows={12}
          value={jsonExport}
          InputProps={{
            readOnly: true,
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              fontFamily: 'monospace',
              fontSize: 11,
            },
          }}
          variant="outlined"
          size="small"
        />

        {copied && (
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              mt: 1,
              color: 'success.main',
              textAlign: 'center',
            }}
          >
            ✓ Copied to clipboard!
          </Typography>
        )}
      </Box>

      {/* Download Button */}
      <Button
        fullWidth
        variant="contained"
        startIcon={<DownloadIcon />}
        onClick={handleDownload}
        size="small"
      >
        Download JSON
      </Button>
    </Paper>
  );
}
