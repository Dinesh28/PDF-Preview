import React, { useState } from 'react';
import {
  Box,
  Button,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Popper,
  Tooltip,
} from '@mui/material';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

import { SelectedParagraph, PdfAnnotationType } from '../types';

type ParagraphToolbarAction = PdfAnnotationType | 'clear';

type ParagraphToolbarProps = {
  selectedParagraph: SelectedParagraph | null;
  anchorElement: HTMLElement | null;
  onAction: (action: ParagraphToolbarAction, paragraph: SelectedParagraph) => void;
  onClose: () => void;
  existingType?: PdfAnnotationType;
};

type AnnotationCommand = {
  value: PdfAnnotationType;
  label: string;
  badge: string;
  color: string;
};

type CommandGroup = {
  id: string;
  label: string;
  badge: string;
  color: string;
  options: AnnotationCommand[];
};

const COMMAND_GROUPS: CommandGroup[] = [
  {
    id: 'section',
    label: 'Section',
    badge: 'S',
    color: '#2f80ed',
    options: [
      { value: 'section', label: 'Section', badge: 'S', color: '#2f80ed' },
      {
        value: 'sub-section',
        label: 'Sub Section',
        badge: 'SS',
        color: '#2f80ed',
      },
    ],
  },
  {
    id: 'question',
    label: 'Question',
    badge: 'Q',
    color: '#27ae60',
    options: [
      { value: 'question', label: 'Question', badge: 'Q', color: '#27ae60' },
      {
        value: 'sub-question',
        label: 'Sub Question',
        badge: 'SQ',
        color: '#27ae60',
      },
    ],
  },
  {
    id: 'answer',
    label: 'Answer Type',
    badge: 'A',
    color: '#bb2ced',
    options: [
      { value: 'answer', label: 'Answer', badge: 'A', color: '#bb2ced' },
    ],
  },
];

const DESCRIPTION_COMMAND: AnnotationCommand = {
  value: 'description',
  label: 'Description',
  badge: 'D',
  color: '#ff6b3a',
};

function getCommandForType(type?: PdfAnnotationType) {
  if (!type) return undefined;

  if (type === DESCRIPTION_COMMAND.value) {
    return DESCRIPTION_COMMAND;
  }

  return COMMAND_GROUPS.flatMap((group) => group.options).find(
    (option) => option.value === type,
  );
}

function TypeBadge({
  badge,
  color,
}: {
  badge: string;
  color: string;
}) {
  return (
    <Box
      component="span"
      sx={{
        width: 16,
        height: 16,
        borderRadius: '4px',
        border: `1.5px solid ${color}`,
        color,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '10px !important',
        fontWeight: 700,
        lineHeight: 1,
        flex: '0 0 auto',
      }}
    >
      {badge}
    </Box>
  );
}

export default function ParagraphToolbar({
  selectedParagraph,
  anchorElement,
  onAction,
  onClose,
  existingType,
}: ParagraphToolbarProps) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  if (!selectedParagraph || !anchorElement) {
    return null;
  }

  const open = Boolean(anchorElement);
  const selectedCommand = getCommandForType(existingType);

  const handleMenuOpen = (
    event: React.MouseEvent<HTMLButtonElement>,
    groupId: string,
  ) => {
    setMenuAnchor(event.currentTarget);
    setActiveGroupId(groupId);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
    setActiveGroupId(null);
  };

  const handleTypeSelect = (type: PdfAnnotationType) => {
    onAction(type, selectedParagraph);
    handleMenuClose();
  };

  const handleClear = () => {
    onAction('clear', selectedParagraph);
    onClose();
  };

  const activeGroup = COMMAND_GROUPS.find(
    (group) => group.id === activeGroupId,
  );

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
      sx={{ zIndex: 1300 }}
    >
      <Box
        data-pdf-annotation-toolbar="true"
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 0.5,
        }}
      >
        <Paper
          elevation={6}
          sx={{
            height: 32,
            px: 0.75,
            display: 'flex',
            alignItems: 'center',
            gap: 0.25,
            backgroundColor: '#fff',
            border: '1px solid #2f80ed',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(47, 128, 237, 0.18)',
            overflow: 'hidden',
          }}
        >
          {COMMAND_GROUPS.map((group, index) => {
            const groupSelected = group.options.some(
              (option) => option.value === existingType,
            );
            const displayCommand = groupSelected ? selectedCommand : group;

            return (
              <React.Fragment key={group.id}>
                {index > 0 ? (
                  <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
                ) : null}
                <Button
                  size="small"
                  endIcon={<ExpandMoreIcon sx={{ fontSize: 15 }} />}
                  onClick={(event) => handleMenuOpen(event, group.id)}
                  sx={{
                    height: 26,
                    px: 0.65,
                    minWidth: 0,
                    borderRadius: '5px',
                    color: '#111827',
                    backgroundColor: groupSelected
                      ? `${group.color}12`
                      : 'transparent',
                    border: groupSelected
                      ? `1px solid ${group.color}`
                      : '1px solid transparent',
                    fontSize: 11,
                    fontWeight: 500,
                    textTransform: 'none',
                    gap: 0.5,
                    '& .MuiButton-startIcon': {
                      mr: 0.25,
                    },
                    '& .MuiButton-endIcon': {
                      ml: 0.25,
                    },
                    '&:hover': {
                      backgroundColor: `${group.color}12`,
                    },
                  }}
                  startIcon={
                    <TypeBadge
                      badge={displayCommand?.badge ?? group.badge}
                      color={displayCommand?.color ?? group.color}
                    />
                  }
                >
                  {displayCommand?.label ?? group.label}
                </Button>
              </React.Fragment>
            );
          })}

          <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />

          <Button
            size="small"
            endIcon={<ExpandMoreIcon sx={{ fontSize: 15 }} />}
            onClick={() => handleTypeSelect(DESCRIPTION_COMMAND.value)}
            sx={{
              height: 26,
              px: 0.65,
              minWidth: 0,
              borderRadius: '5px',
              color: '#111827',
              backgroundColor:
                existingType === DESCRIPTION_COMMAND.value
                  ? `${DESCRIPTION_COMMAND.color}12`
                  : 'transparent',
              border:
                existingType === DESCRIPTION_COMMAND.value
                  ? `1px solid ${DESCRIPTION_COMMAND.color}`
                  : '1px solid transparent',
              fontSize: 11,
              fontWeight: 500,
              textTransform: 'none',
              '& .MuiButton-startIcon': {
                mr: 0.25,
              },
              '& .MuiButton-endIcon': {
                display: 'none',
              },
              '&:hover': {
                backgroundColor: `${DESCRIPTION_COMMAND.color}12`,
              },
            }}
            startIcon={
              <TypeBadge
                badge={DESCRIPTION_COMMAND.badge}
                color={DESCRIPTION_COMMAND.color}
              />
            }
          >
            {DESCRIPTION_COMMAND.label}
          </Button>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />

          <Tooltip title="Open details">
            <IconButton
              size="small"
              sx={{
                width: 24,
                height: 24,
                borderRadius: '5px',
                color: '#4b5563',
              }}
            >
              <OpenInNewIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Tooltip>

          <Tooltip title="More actions">
            <IconButton
              size="small"
              sx={{
                width: 24,
                height: 24,
                borderRadius: '5px',
                color: '#4b5563',
              }}
            >
              <MoreVertIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Paper>

        <Paper
          elevation={6}
          sx={{
            height: 29,
            display: 'flex',
            alignItems: 'center',
            backgroundColor: '#fff',
            border: '1px solid #2f80ed',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(47, 128, 237, 0.14)',
            overflow: 'hidden',
          }}
        >
          <Button
            size="small"
            startIcon={<AutoFixHighIcon sx={{ fontSize: 16 }} />}
            sx={{
              height: 29,
              px: 0.9,
              borderRadius: 0,
              color: '#0875f5',
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'none',
              whiteSpace: 'nowrap',
              '& .MuiButton-startIcon': {
                mr: 0.35,
              },
            }}
          >
            Auto-Identify
          </Button>

          <Divider orientation="vertical" flexItem />

          <Button
            size="small"
            startIcon={<CloseIcon sx={{ fontSize: 15 }} />}
            onClick={handleClear}
            sx={{
              height: 29,
              px: 0.8,
              borderRadius: 0,
              color: '#9ca3af',
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'none',
              whiteSpace: 'nowrap',
              '& .MuiButton-startIcon': {
                mr: 0.25,
              },
              '&:hover': {
                color: '#ef4444',
                backgroundColor: '#fee2e2',
              },
            }}
          >
            Clear
          </Button>
        </Paper>

        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={handleMenuClose}
          PaperProps={{
            'data-pdf-annotation-toolbar': 'true',
            sx: {
              mt: 0.5,
              borderRadius: '6px',
              border: '1px solid #dbeafe',
              boxShadow: '0 8px 18px rgba(15, 23, 42, 0.12)',
            },
          } as any}
        >
          {(activeGroup?.options ?? []).map((type) => (
            <MenuItem
              key={type.value}
              onClick={() => handleTypeSelect(type.value)}
              selected={existingType === type.value}
              sx={{
                gap: 1,
                fontSize: 12,
                minHeight: 32,
              }}
            >
              <TypeBadge badge={type.badge} color={type.color} />
              {type.label}
            </MenuItem>
          ))}
        </Menu>
      </Box>
    </Popper>
  );
}
