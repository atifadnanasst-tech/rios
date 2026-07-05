export const motion = {
  // Durations as specified in RIG
  durationHover: 0.15, // 150ms
  durationExpand: 0.25, // 250ms
  durationPanel: 0.3, // 300ms
  durationAIThinking: 0.5, // 500ms

  // Spring animations for a high-quality, professional feel (Apple-like)
  springFriendly: {
    type: 'spring',
    stiffness: 300,
    damping: 25,
  },
  springBouncy: {
    type: 'spring',
    stiffness: 400,
    damping: 18,
  },
  
  // Ease transitions
  easeDefault: [0.16, 1, 0.3, 1], // Custom cubic-bezier (out-quart)
} as const;
