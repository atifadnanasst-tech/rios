import React from 'react';
import { RelationshipCategory } from '../../types/index.ts';

interface CategoryPillProps {
  category: RelationshipCategory;
  label: string;
  count: number;
  isActive: boolean;
  onClick: () => void;
  id?: string;
}

export const CategoryPill: React.FC<CategoryPillProps> = ({
  category,
  label,
  count,
  isActive,
  onClick,
  id
}) => {
  const getStyles = () => {
    switch (category) {
      case 'critical':
        return {
          border: isActive ? 'border-red-500/60' : 'border-white/5',
          bg: isActive ? 'bg-red-950/15' : 'bg-[#131316]',
          leftBar: 'bg-red-500',
          text: 'text-[#EF4444]',
          glow: isActive ? 'shadow-[inset_0_0_12px_rgba(239,68,68,0.08)] border-red-500/40' : 'hover:border-red-500/25'
        };
      case 'commitment':
        return {
          border: isActive ? 'border-orange-500/60' : 'border-white/5',
          bg: isActive ? 'bg-orange-950/15' : 'bg-[#131316]',
          leftBar: 'bg-orange-500',
          text: 'text-[#F97316]',
          glow: isActive ? 'shadow-[inset_0_0_12px_rgba(249,115,22,0.08)] border-orange-500/40' : 'hover:border-orange-500/25'
        };
      case 'commercial':
        return {
          border: isActive ? 'border-amber-500/60' : 'border-white/5',
          bg: isActive ? 'bg-amber-950/15' : 'bg-[#131316]',
          leftBar: 'bg-amber-500',
          text: 'text-[#F59E0B]',
          glow: isActive ? 'shadow-[inset_0_0_12px_rgba(245,158,11,0.08)] border-amber-500/40' : 'hover:border-amber-500/25'
        };
      case 'building':
        return {
          border: isActive ? 'border-blue-500/60' : 'border-white/5',
          bg: isActive ? 'bg-blue-950/15' : 'bg-[#131316]',
          leftBar: 'bg-blue-500',
          text: 'text-[#3B82F6]',
          glow: isActive ? 'shadow-[inset_0_0_12px_rgba(59,130,246,0.08)] border-blue-500/40' : 'hover:border-blue-500/25'
        };
      case 'nurture':
        return {
          border: isActive ? 'border-emerald-500/60' : 'border-white/5',
          bg: isActive ? 'bg-emerald-950/15' : 'bg-[#131316]',
          leftBar: 'bg-[#10B981]',
          text: 'text-[#10B981]',
          glow: isActive ? 'shadow-[inset_0_0_12px_rgba(16,185,129,0.08)] border-emerald-500/40' : 'hover:border-emerald-500/25'
        };
      default:
        return {
          border: 'border-white/5',
          bg: 'bg-[#131316]',
          leftBar: 'bg-zinc-500',
          text: 'text-zinc-400',
          glow: 'hover:border-zinc-700'
        };
    }
  };

  const styles = getStyles();

  return (
    <button
      id={id || `category-${category}`}
      onClick={onClick}
      className={`flex-1 text-left rounded-xl border p-3.5 relative overflow-hidden transition-all duration-150 outline-none select-none cursor-pointer group flex flex-col justify-between h-[82px] min-w-[110px] ${styles.border} ${styles.bg} ${styles.glow}`}
    >
      {/* Active Left bar indicator */}
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${styles.leftBar}`} />

      {/* Label and Indicator */}
      <div className="flex items-center justify-between pl-1">
        <span className="text-[11px] font-semibold text-zinc-400 group-hover:text-zinc-200 transition-colors leading-none truncate">
          {label}
        </span>
      </div>

      {/* Value */}
      <div className="flex items-baseline gap-1 pl-1 mt-2.5">
        <span className="text-xl font-bold text-white tracking-tight leading-none">
          {count}
        </span>
      </div>
    </button>
  );
};
