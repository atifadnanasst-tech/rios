import React from 'react';
import { motion } from 'motion/react';
import { RelationshipStage } from '../../types/index.ts';

interface StageIndicatorProps {
  currentStage: RelationshipStage;
  onChangeStage?: (stage: RelationshipStage) => void;
  interactive?: boolean;
  className?: string;
  id?: string;
}

// The real lifecycle has 18 stages — too many to show as individual dots in
// a compact card row without looking cluttered and mostly-empty (since most
// relationships are still early). These 6 phases group them for a clean
// glance-able progress view, while the exact stage stays fully precise
// wherever it's shown as text (e.g. the "DISCOVERED" label on cards).
export const PHASES: { label: string; stages: RelationshipStage[] }[] = [
  { label: 'Discovery', stages: ['Discovered', 'Connected', 'Recognized'] },
  { label: 'Relationship Building', stages: ['Rapport', 'Trust', 'Business Context'] },
  { label: 'Needs & Solution', stages: ['Need Identified', 'Solution Alignment', 'Commercial Interest'] },
  { label: 'Commercial Process', stages: ['Meeting', 'RFQ', 'Quotation', 'Negotiation'] },
  { label: 'Execution', stages: ['Purchase Order', 'Execution'] },
  { label: 'Advocacy', stages: ['Repeat Business', 'Strategic Partner', 'Advocate'] },
];

function findPhaseIndex(stage: RelationshipStage): number {
  const idx = PHASES.findIndex((p) => p.stages.includes(stage));
  return idx === -1 ? 0 : idx; // fall back to first phase rather than break the whole indicator
}

export const StageIndicator: React.FC<StageIndicatorProps> = ({
  currentStage,
  onChangeStage,
  interactive = false,
  className = '',
  id
}) => {
  const currentPhaseIndex = findPhaseIndex(currentStage);

  return (
    <div
      id={id || 'stage-indicator-wrapper'}
      className={`flex flex-col gap-1 ${className}`}
    >
      {/* Visual Dot Connector Row — 6 phase-dots, each covering several
          real stages. Hover any dot to see exactly which real stages it
          groups, so the compact view still teaches the full lifecycle. */}
      <div className="flex items-center gap-1.5 py-1 select-none">
        {PHASES.map((phase, idx) => {
          const isActive = idx <= currentPhaseIndex;
          const isCurrent = idx === currentPhaseIndex;

          return (
            <React.Fragment key={phase.label}>
              {/* Dot */}
              <div
                className={`group relative flex items-center justify-center ${
                  interactive ? 'cursor-pointer' : ''
                }`}
                onClick={() => interactive && onChangeStage && onChangeStage(phase.stages[0])}
              >
                <motion.div
                  className={`w-2 h-2 rounded-full transition-colors duration-200 ${
                    isCurrent
                      ? 'bg-rios-purple shadow-[0_0_8px_#7C3AED]'
                      : isActive
                      ? 'bg-rios-purple/70'
                      : 'bg-zinc-700/80'
                  }`}
                  whileHover={interactive ? { scale: 1.4 } : {}}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                />

                {/* Teaching-moment tooltip: phase name + the real stages it covers */}
                <div className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full w-max max-w-[180px] opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-20">
                  <div className="bg-zinc-900 border border-white/10 rounded-lg px-2.5 py-1.5 shadow-xl text-center">
                    <div className="text-[10px] font-semibold text-white">{phase.label}</div>
                    <div className="text-[9px] text-zinc-400 mt-0.5 leading-snug">
                      {phase.stages.join(' → ')}
                    </div>
                  </div>
                </div>
              </div>

              {/* Connecting Line (except last) */}
              {idx < PHASES.length - 1 && (
                <div className="w-6 h-[2px] rounded-full overflow-hidden bg-zinc-800">
                  <motion.div
                    className="h-full bg-rios-purple/60"
                    initial={{ width: 0 }}
                    animate={{ width: idx < currentPhaseIndex ? '100%' : '0%' }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
