import React from 'react';

// Small, dependency-free formatter for the Advisor Chat's AI responses —
// handles just what GPT-style coaching output actually uses: **bold**
// text and "- " bullet lists. Deliberately not a full markdown parser;
// no new npm dependency needed for two formatting rules.
function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

export const FormattedCoachingText: React.FC<{ text: string }> = ({ text }) => {
  const blocks = text.split(/\n\n+/);

  return (
    <div className="space-y-2">
      {blocks.map((block, blockIdx) => {
        const lines = block.split('\n').filter((l) => l.trim().length > 0);
        const isList = lines.length > 0 && lines.every((l) => /^[-*]\s+/.test(l.trim()));

        if (isList) {
          return (
            <ul key={blockIdx} className="list-disc list-outside pl-4 space-y-1">
              {lines.map((line, i) => (
                <li key={i}>{renderInline(line.trim().replace(/^[-*]\s+/, ''))}</li>
              ))}
            </ul>
          );
        }

        return (
          <p key={blockIdx}>
            {lines.map((line, i) => (
              <React.Fragment key={i}>
                {renderInline(line)}
                {i < lines.length - 1 && <br />}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
};
