import React, { useState } from 'react';
import {
  Box,
  Button,
  Menu,
  MenuItem,
  Popper,
  Paper,
  Divider,
  IconButton,
} from '@mui/material';
import ClearIcon from '@mui/icons-material/Clear';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

import { SelectedParagraph, PdfAnnotationType } from '../types';

type ParagraphToolbarAction = PdfAnnotationType | 'clear';

type ParagraphToolbarProps = {
  selectedParagraph: SelectedParagraph | null;
  anchorElement: HTMLElement | null;
  onAction: (action: ParagraphToolbarAction, paragraph: SelectedParagraph) => void;
  onClose: () => void;
  existingType?: PdfAnnotationType;
};

const ANNOTATION_TYPES: Array<{ value: PdfAnnotationType; label: string }> = [
  { value: 'section', label: 'Section' },
  { value: 'sub-section', label: 'Sub-Section' },
  { value: 'question', label: 'Question' },
  { value: 'sub-question', label: 'Sub-Question' },
];

export default function ParagraphToolbar({
  selectedParagraph,
  anchorElement,
  onAction,
  onClose,
  existingType,
}: ParagraphToolbarProps) {
  const [typeMenuAnchor, setTypeMenuAnchor] =
    useState<HTMLElement | null>(null);

  if (!selectedParagraph || !anchorElement) {
    return null;
  }

  const open = Boolean(anchorElement);

  const handleTypeMenuOpen = (
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    setTypeMenuAnchor(event.currentTarget);
  };

  const handleTypeMenuClose = () => {
    setTypeMenuAnchor(null);
  };

  const handleTypeSelect = (type: PdfAnnotationType) => {
    onAction(type, selectedParagraph);
    handleTypeMenuClose();
  };

  const handleClear = () => {
    onAction('clear', selectedParagraph);
    onClose();
  };

  const currentTypeLabel =
    existingType &&
    ANNOTATION_TYPES.find((t) => t.value === existingType)?.label;

  return (
    <Popper
      open={open}
      anchorEl={anchorElement}
      placement="bottom-start"
      modifiers={[
        {
          name: 'offset',
          options: {
            offset: [0, 10],
          },
        },
        {
          name: 'preventOverflow',
          options: {
            padding: 8,
          },
        },
      ]}
      disablePortal={false}
    >
      <Paper
        elevation={8}
        sx={{
          p: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          backgroundColor: '#fff',
          border: '1px solid #e0e0e0',
          borderRadius: 1,
          zIndex: 1300,
        }}
      >
        {/* Type Selection Button */}
        <Button
          variant="outlined"
          size="small"
          endIcon={<ExpandMoreIcon sx={{ fontSize: 16 }} />}
          onClick={handleTypeMenuOpen}
          sx={{
            fontSize: 12,
            py: 0.5,
            px: 1,
            textTransform: 'none',
            minWidth: 100,
          }}
        >
          {currentTypeLabel || 'Assign Type'}
        </Button>

        {/* Type Menu */}
        <Menu
          anchorEl={typeMenuAnchor}
          open={Boolean(typeMenuAnchor)}
          onClose={handleTypeMenuClose}
        >
          {ANNOTATION_TYPES.map((type) => (
            <MenuItem
              key={type.value}
              onClick={() => handleTypeSelect(type.value)}
              selected={existingType === type.value}
            >
              {type.label}
            </MenuItem>
          ))}
        </Menu>

        <Divider orientation="vertical" flexItem />

        {/* Clear Button */}
        <IconButton
          size="small"
          onClick={handleClear}
          color="error"
          title="Remove annotation"
          sx={{
            p: 0.5,
          }}
        >
          <ClearIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Paper>
    </Popper>
  );
}
