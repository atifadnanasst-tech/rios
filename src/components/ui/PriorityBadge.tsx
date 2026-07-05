import React from 'react';
import { PriorityLevel } from '../../types/index.ts';

interface PriorityBadgeProps {
  priority: PriorityLevel;
  className?: string;
  id?: string;
}

export const PriorityBadge: React.FC<PriorityBadgeProps> = ({
  priority,
  className = '',
  id
}) => {
  const getStyles = () => {
    switch (priority) {
      case 'High':
        return 'text-[#EF4444] bg-red-950/40 border border-red-500/20';
      case 'Medium':
        return 'text-[#F59E0B] bg-amber-950/40 border border-amber-500/20';
      case 'Low':
        return 'text-[#10B981] bg-emerald-950/40 border border-emerald-500/20';
      default:
        return 'text-zinc-400 bg-zinc-800 border border-zinc-700/50';
    }
  };

  return (
    <span
      id={id || `priority-${priority.toLowerCase()}`}
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono font-medium tracking-wide ${getStyles()} ${className}`}
    >
      {priority}
    </span>
  );
};
