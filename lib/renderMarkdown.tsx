import React from 'react';

// Renders **bold** and *italic* inline markdown. Handles multi-line text with <br />.
export function LennaText({ text, className }: { text: string; className?: string }) {
  const lines = text.split('\n');
  return (
    <span className={className}>
      {lines.flatMap((line, li) => {
        // Split on **bold** first, then *italic* within plain segments
        const boldParts = line.split(/(\*\*[^*]+\*\*)/g);
        const nodes: React.ReactNode[] = [];
        boldParts.forEach((seg, bi) => {
          if (seg.startsWith('**') && seg.endsWith('**') && seg.length > 4) {
            nodes.push(<strong key={`${li}-b${bi}`}>{seg.slice(2, -2)}</strong>);
          } else {
            const italicParts = seg.split(/(\*[^*]+\*)/g);
            italicParts.forEach((s, ii) => {
              if (s.startsWith('*') && s.endsWith('*') && s.length > 2) {
                nodes.push(<em key={`${li}-i${bi}-${ii}`}>{s.slice(1, -1)}</em>);
              } else {
                nodes.push(<React.Fragment key={`${li}-t${bi}-${ii}`}>{s}</React.Fragment>);
              }
            });
          }
        });
        if (li < lines.length - 1) nodes.push(<br key={`br${li}`} />);
        return nodes;
      })}
    </span>
  );
}
