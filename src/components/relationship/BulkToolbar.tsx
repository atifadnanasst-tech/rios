import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Clock, Check, Layers, ChevronDown, X } from 'lucide-react';
import { RelationshipStage } from '../../types/index.ts';

interface BulkToolbarProps {
  selectedCount: number;
  onGenerate: () => void;
  onSnooze: () => void;
  onComplete: () => void;
  onChangeStage: (stage: RelationshipStage) => void;
  onClear: () => void;
  id?: string;
}

export const BulkToolbar: React.FC<BulkToolbarProps> = ({
  selectedCount,
  onGenerate,
  onSnooze,
  onComplete,
  onChangeStage,
  onClear,
  id
}) => {
  const [showStageDropdown, setShowStageDropdown] = useState(false);

  const stages: RelationshipStage[] = [
    'Introduction',
    'Meeting',
    'Solution Alignment',
    'Trust Building',
    'Recognition',
    'Contract'
  ];

  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          id={id || 'rios-bulk-toolbar'}
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          transition={{ type: 'spring', stiffness: 350, damping: 25 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-950 border border-white/10 rounded-full px-5 py-3 flex items-center gap-4 shadow-[0_20px_50px_rgba(0,0,0,0.8),0_0_24px_rgba(124,58,237,0.15)] z-40 select-none font-sans"
        >
          {/* Selected Count Tag */}
          <div className="flex items-center gap-2 pr-3 border-r border-white/5">
            <span className="text-xs font-bold text-rios-purple-glow bg-rios-purple/10 px-2.5 py-1 rounded-full text-[#A78BFA]">
              {selectedCount} Selected
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5 relative">
            {/* Generate Action */}
            <button
              onClick={onGenerate}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full hover:bg-white/5 text-xs font-semibold text-zinc-200 transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-rios-purple" />
              <span>Generate</span>
            </button>

            {/* Snooze Action */}
            <button
              onClick={onSnooze}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full hover:bg-white/5 text-xs font-semibold text-zinc-200 transition-colors cursor-pointer"
            >
              <Clock className="w-3.5 h-3.5 text-zinc-400" />
              <span>Snooze</span>
            </button>

            {/* Complete Action */}
            <button
              onClick={onComplete}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full hover:bg-white/5 text-xs font-semibold text-zinc-200 transition-colors cursor-pointer"
            >
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>Complete</span>
            </button>

            {/* Change Stage Dropdown Trigger */}
            <div className="relative">
              <button
                onClick={() => setShowStageDropdown(!showStageDropdown)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full hover:bg-white/5 text-xs font-semibold text-zinc-200 transition-colors cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5 text-blue-400" />
                <span>Change Stage</span>
                <ChevronDown className={`w-3 h-3 text-zinc-500 transition-transform ${showStageDropdown ? 'rotate-180' : ''}`} />
              </button>

              {/* Stage Selection Overlay Dropdown */}
              <AnimatePresence>
                {showStageDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: -230, scale: 1 }} // Slide up
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    className="absolute bottom-10 left-0 w-48 bg-zinc-950 border border-white/10 rounded-xl py-1.5 shadow-2xl z-50 flex flex-col"
                  >
                    {stages.map((stage) => (
                      <button
                        key={stage}
                        onClick={() => {
                          onChangeStage(stage);
                          setShowStageDropdown(false);
                        }}
                        className="px-3.5 py-2 text-left text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/5 transition-colors"
                      >
                        {stage}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Bulk Actions General Dropdown */}
            <button
              className="flex items-center gap-1 px-3.5 py-1.5 rounded-full bg-zinc-900 border border-white/5 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer"
              onClick={() => alert('Additional bulk actions: export, delete, reassign')}
            >
              <span>Bulk Action</span>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
            </button>
          </div>

          {/* Close Clear Button */}
          <div className="pl-2 border-l border-white/5">
            <button
              onClick={onClear}
              className="p-1.5 rounded-full hover:bg-white/5 text-zinc-500 hover:text-white transition-colors cursor-pointer"
              title="Clear Selection"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
