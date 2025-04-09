import React, { Fragment } from 'react';
import { cn } from "@/lib/utils";

export type CategoryType = 'Important Info' | 'Calendar' | 'Payments' | 'Travel' | 'Newsletters' | 'Notifications';
type HighlightType = 'date' | 'warning' | 'entity' | 'amount' | 'meeting';

interface ProcessedSegment {
  text: string;
  type?: HighlightType;
  messageId?: string;
}

// Process text with double-bracket markers [[ ]] and curly brace markers { } for highlighting and linking
function processMarkedText(text: string): ProcessedSegment[] {
  const segments: ProcessedSegment[] = [];
  // Handle both [[ ]] highlights and message IDs
  const markerPattern = /\[\[(.*?)(?:\|(.*?))?\]\]|\{(.*?)\|(.*?)\}/g;
  let lastIndex = 0;
  let match;

  while ((match = markerPattern.exec(text)) !== null) {
    // Add non-highlighted text before the marker
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index) });
    }

    // If it's a [[ ]] match, match[1] has text and match[2] might have messageId
    // If it's a { } match, match[3] has text and match[4] has messageId
    const isHighlighted = match[1] !== undefined;
    const content = isHighlighted ? match[1] : match[3];
    const messageId = isHighlighted ? match[2] : match[4];

    segments.push({
      text: content,
      type: isHighlighted ? determineHighlightType(content) : undefined,
      messageId: messageId || undefined
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last marker
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ text }];
}

// Determine highlight type based on content
function determineHighlightType(text: string): HighlightType {
  const lowerText = text.toLowerCase();
  
  // Check for dates
  if (/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|next week|\d{1,2}(st|nd|rd|th)?( at | )?\d{1,2}(:\d{2})?\s*(am|pm)?)\b/i.test(lowerText)) {
    return 'date';
  }
  
  // Check for amounts
  if (/\$\d|dollars|payment|cost/i.test(lowerText)) {
    return 'amount';
  }
  
  // Check for warnings/actions
  if (/\b(due|required|pending|waiting|needed|attention|urgent|asap)\b/i.test(lowerText)) {
    return 'warning';
  }
  
  // Check for meetings
  if (/\b(meeting|conference|appointment|session|call)\b/i.test(lowerText)) {
    return 'meeting';
  }
  
  // Default to entity for other highlights
  return 'entity';
}

// Add new type to track multiple highlight types
type MultiHighlight = {
  types: HighlightType[];
  text: string;
};

function getMixedBackground(types: HighlightType[]): string {
  const colorMap = {
    date: 'rgb(219 234 254)', // blue-100
    warning: 'rgb(254 226 226)', // red-100
    amount: 'rgb(254 226 226)', // red-100
    entity: 'rgb(254 243 199)', // amber-100
    meeting: 'rgb(254 243 199)', // amber-100
  };

  if (types.length === 1) {
    return `bg-${types[0] === 'date' ? 'blue' : types[0] === 'warning' || types[0] === 'amount' ? 'red' : 'amber'}-100`;
  }

  // Create gradient from the colors
  const colors = types.map(type => colorMap[type]);
  return `background: linear-gradient(to right, ${colors[0]} 0%, ${colors[0]} 50%, ${colors[1]} 50%, ${colors[1]} 100%)`; // Split background exactly in half
}

export const HighlightedText: React.FC<{ 
  text: string; 
  category?: CategoryType;
  onMessageClick?: (messageId: string) => void;
}> = ({ text, category, onMessageClick }) => {
  const segments = processMarkedText(text);
  
  // Split text into lines while preserving bullet points
  const renderText = (text: string) => {
    return text.split('\n').map((line, i) => (
      <Fragment key={i}>
        {i > 0 && <br />}
        {line}
      </Fragment>
    ));
  };

  return (
    <span className="whitespace-pre-line">
      {segments.map((segment, index) => {
        const content = (
          <span 
            className={cn(
              segment.type && "font-medium px-1.5 rounded text-black",
              segment.type && getMixedBackground([segment.type])
            )}
          >
            {renderText(segment.text)}
          </span>
        );

        return (
          <Fragment key={index}>
            {segment.messageId ? (
              <a
                href={`https://mail.google.com/mail/u/0/#search/rfc822msgid:${segment.messageId}`}
                onClick={(e) => {
                  e.preventDefault();
                  onMessageClick?.(segment.messageId!);
                }}
                className="hover:underline inline-block"
              >
                {content}
              </a>
            ) : (
              segment.type ? content : renderText(segment.text)
            )}
          </Fragment>
        );
      })}
    </span>
  );
};