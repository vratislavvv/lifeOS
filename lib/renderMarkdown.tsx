import React from 'react';

// Renders **bold** inline markdown as <strong>.
// Handles multi-line text with <br /> between lines.
export function LennaText({ text, className }: { text: string; className?: string }) {
  const lines = text.split('\n');
  return (
    <span className={className}>
      {lines.flatMap((line, li) => {
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        const nodes = parts.map((part, pi) =>
          part.startsWith('**') && part.endsWith('**') && part.length > 4
            ? <strong key={`${li}-b${pi}`}>{part.slice(2, -2)}</strong>
            : <React.Fragment key={`${li}-t${pi}`}>{part}</React.Fragment>
        );
        if (li < lines.length - 1) nodes.push(<br key={`br${li}`} />);
        return nodes;
      })}
    </span>
  );
}
