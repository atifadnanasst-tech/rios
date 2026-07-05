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

export const STAGES: RelationshipStage[] = [
  'Introduction',
  'Meeting',
  'Solution Alignment',
  'Trust Building',
  'Recognition'
];

export const StageIndicator: React.FC<StageIndicatorProps> = ({
  currentStage,
  onChangeStage,
  interactive = false,
  className = '',
  id
}) => {
  const currentIndex = STAGES.indexOf(currentStage);

  return (
    <div
      id={id || 'stage-indicator-wrapper'}
      className={`flex flex-col gap-1 ${className}`}
    >
      {/* Visual Dot Connector Row */}
      <div className="flex items-center gap-1.5 py-1 select-none">
        {STAGES.map((stage, idx) => {
          const isActive = idx <= currentIndex;
          const isCurrent = idx === currentIndex;

          return (
            <React.Fragment key={stage}>
              {/* Dot */}
              <div
                className={`relative flex items-center justify-center ${
                  interactive ? 'cursor-pointer' : ''
                }`}
                onClick={() => interactive && onChangeStage && onChangeStage(stage)}
                title={stage}
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

                {/* Micro tooltip if interactive */}
                {interactive && (
                  <span className="absolute -top-6 scale-0 group-hover:scale-100 transition-all duration-150 bg-zinc-900 border border-white/10 text-[10px] text-zinc-300 px-1.5 py-0.5 rounded pointer-events-none whitespace-nowrap">
                    {stage}
                  </span>
                )}
              </div>

              {/* Connecting Line (except last) */}
              {idx < STAGES.length - 1 && (
                <div className="w-6 h-[2px] rounded-full overflow-hidden bg-zinc-800">
                  <motion.div
                    className="h-full bg-rios-purple/60"
                    initial={{ width: 0 }}
                    animate={{ width: idx < currentIndex ? '100%' : '0%' }}
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
