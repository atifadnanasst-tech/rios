import React from 'react';
import { motion } from 'motion/react';
import { Mail, Linkedin, MessageCircle, MoreHorizontal, Star } from 'lucide-react';
import { WorkItem, RelationshipStage } from '../../types/index.ts';
import { Avatar } from '../ui/Avatar.tsx';
import { PriorityBadge } from '../ui/PriorityBadge.tsx';
import { StageIndicator } from '../ui/StageIndicator.tsx';

interface RelationshipMissionCardProps {
  item: WorkItem;
  isSelected: boolean; // Selected in the right panel
  isChecked: boolean;  // Checked for bulk actions
  onSelect: () => void;
  onToggleCheck: (e: React.MouseEvent) => void;
  onChangeStage: (stage: RelationshipStage) => void;
  id?: string;
}

export const RelationshipMissionCard: React.FC<RelationshipMissionCardProps> = ({
  item,
  isSelected,
  isChecked,
  onSelect,
  onToggleCheck,
  onChangeStage,
  id
}) => {
  const rel = item.relationship;

  // Get communication channel icon
  const getChannelIcon = () => {
    switch (item.channel) {
      case 'email':
        return <Mail className="w-4 h-4 text-zinc-400 hover:text-white transition-colors" />;
      case 'linkedin':
        return <Linkedin className="w-4 h-4 text-sky-400 hover:text-sky-300 transition-colors" />;
      case 'whatsapp':
        return <MessageCircle className="w-4 h-4 text-emerald-400 hover:text-emerald-300 transition-colors" />;
      default:
        return <Mail className="w-4 h-4 text-zinc-400" />;
    }
  };

  // Get text colors for objective badges
  const getCategoryBadgeStyles = () => {
    switch (item.category) {
      case 'critical':
        return 'text-red-400 bg-red-950/20 border border-red-500/10';
      case 'commitment':
        return 'text-orange-400 bg-orange-950/20 border border-orange-500/10';
      case 'commercial':
        return 'text-amber-400 bg-amber-950/20 border border-amber-500/10';
      case 'building':
        return 'text-blue-400 bg-blue-950/20 border border-blue-500/10';
      case 'nurture':
        return 'text-emerald-400 bg-emerald-950/20 border border-emerald-500/10';
    }
  };

  return (
    <motion.div
      id={id || `mission-card-${item.id}`}
      onClick={onSelect}
      className={`flex items-center gap-4 px-4.5 py-4 border rounded-xl transition-all duration-200 cursor-pointer select-none font-sans relative ${
        isSelected
          ? 'bg-rios-card-hover border-rios-purple/40 shadow-[0_4px_16px_rgba(124,58,237,0.08)]'
          : 'bg-rios-card border-rios-border hover:bg-rios-card-hover hover:border-white/10'
      }`}
      whileHover={{ y: -1 }}
      transition={{ duration: 0.1 }}
    >
      {/* 1. Custom Checkbox */}
      <div className="flex items-center shrink-0" onClick={(e) => e.stopPropagation()}>
        <label className="relative flex items-center justify-center cursor-pointer">
          <input
            type="checkbox"
            checked={isChecked}
            onChange={(e) => {
              // Convert native change to expected onClick behavior
              const syntheticEvent = {
                ...e,
                stopPropagation: () => e.stopPropagation(),
                preventDefault: () => e.preventDefault(),
              } as unknown as React.MouseEvent;
              onToggleCheck(syntheticEvent);
            }}
            className="sr-only peer"
          />
          <div className="w-4.5 h-4.5 rounded-[5px] border border-white/10 peer-checked:border-rios-purple peer-checked:bg-rios-purple flex items-center justify-center transition-all bg-zinc-950/40 peer-hover:border-white/20">
            <svg
              className="w-3 h-3 text-white scale-0 peer-checked:scale-100 transition-transform"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </label>
      </div>

      {/* 2. Portrait Avatar & Meta — FIXED width (was min/max range, which
          let each card's badge column start at a different X position
          depending on name length; a single fixed width guarantees every
          card's badge starts at the same spot). */}
      <div className="flex items-center gap-3 shrink-0 w-[220px]">
        <Avatar src={rel.avatar} name={rel.name} size="md" status={rel.status} />

        <div className="flex flex-col truncate">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-zinc-100 hover:text-white transition-colors truncate">
              {rel.name}
            </span>
            {rel.starred && (
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 shrink-0" />
            )}
          </div>
          <span className="text-[10px] text-rios-text-secondary mt-0.5 font-medium truncate leading-tight">
            {rel.company} <span className="text-zinc-800">|</span> {rel.location.split(' | ')[0]}
          </span>
        </div>
      </div>

      {/* 3. Objective & Context Description */}
      <div className="flex-1 min-w-[150px] flex flex-col gap-0.5">
        <div className="flex items-center">
          <span className={`inline-block px-2 py-0.5 rounded-[5px] text-[10px] font-semibold capitalize tracking-wide ${getCategoryBadgeStyles()}`}>
            {item.category === 'building' ? 'Relationship Building' : item.category}
          </span>
        </div>
        <p className="text-xs font-semibold text-zinc-200 mt-1 leading-normal truncate">
          {item.description}
        </p>
      </div>

      {/* 4. Stage Progress Timeline */}
      <div className="shrink-0 min-w-[120px] flex flex-col justify-center" onClick={(e) => e.stopPropagation()}>
        <span className="text-[9px] text-rios-text-muted font-bold uppercase tracking-wider mb-0.5 leading-none">
          {rel.currentStage}
        </span>
        <StageIndicator
          currentStage={rel.currentStage}
          onChangeStage={onChangeStage}
          interactive={true}
        />
      </div>

      {/* 5. Priority & Scheduled Next Action Hour */}
      <div className="shrink-0 flex flex-col items-end min-w-[80px]">
        <PriorityBadge priority={item.priority} />
        <span className="text-[10px] text-rios-text-muted font-mono font-medium mt-1 leading-none">
          {item.dueTime}
        </span>
      </div>

      {/* 6. Channel Action Controls */}
      <div className="flex items-center gap-2 shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
        {/* Quick icon button */}
        <button
          className="p-1.5 rounded-lg bg-zinc-950/40 border border-white/5 hover:border-white/10 hover:bg-zinc-900 transition-all cursor-pointer"
          title={`Generate ${item.channel}`}
          onClick={onSelect}
        >
          {getChannelIcon()}
        </button>

        {/* Meatball menu */}
        <button
          className="p-1.5 rounded-lg text-zinc-500 hover:text-white transition-colors hover:bg-white/5 cursor-pointer"
          onClick={() => alert(`More options for ${rel.name}`)}
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
};
