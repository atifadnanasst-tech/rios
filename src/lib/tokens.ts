import { colors } from './colors.ts';
import { spacing } from './spacing.ts';
import { radius } from './radius.ts';
import { motion } from './motion.ts';
import { typography } from './typography.ts';

export const tokens = {
  colors,
  spacing,
  radius,
  motion,
  typography,
} as const;

export { colors, spacing, radius, motion, typography };
