export const colors = {
  background: '#09090B', // Pure dark obsidian
  sidebarBackground: '#0F0F12', // Slightly elevated dark background
  cardBackground: '#131316', // Slate elevated card
  cardBorder: 'rgba(255, 255, 255, 0.05)', // Elegant subtle border
  cardBorderHover: 'rgba(255, 255, 255, 0.1)', // Highlight on hover
  textPrimary: '#F4F4F5', // Off-white
  textSecondary: '#A1A1AA', // Muted slate gray
  textMuted: '#71717A', // Darker gray for indicators/metadata
  
  // Semantic category colors (as defined in RIG)
  critical: {
    primary: '#EF4444', // Red
    bg: 'rgba(239, 68, 68, 0.08)',
    border: 'rgba(239, 68, 68, 0.2)',
    text: '#F87171'
  },
  commitment: {
    primary: '#F97316', // Orange
    bg: 'rgba(249, 115, 22, 0.08)',
    border: 'rgba(249, 115, 22, 0.2)',
    text: '#FB923C'
  },
  commercial: {
    primary: '#F59E0B', // Amber
    bg: 'rgba(245, 158, 11, 0.08)',
    border: 'rgba(245, 158, 11, 0.2)',
    text: '#FBBF24'
  },
  building: {
    primary: '#3B82F6', // Blue
    bg: 'rgba(59, 130, 246, 0.08)',
    border: 'rgba(59, 130, 246, 0.2)',
    text: '#60A5FA'
  },
  trust: {
    primary: '#14B8A6', // Teal
    bg: 'rgba(20, 184, 166, 0.08)',
    border: 'rgba(20, 184, 166, 0.2)',
    text: '#2DD4BF'
  },
  nurture: {
    primary: '#10B981', // Green
    bg: 'rgba(16, 185, 129, 0.08)',
    border: 'rgba(16, 185, 129, 0.2)',
    text: '#34D399'
  },
  
  brand: {
    primary: '#7C3AED', // Purple accent
    primaryBg: 'rgba(124, 58, 237, 0.1)',
    primaryBorder: 'rgba(124, 58, 237, 0.3)',
    text: '#A78BFA',
    glow: 'rgba(124, 58, 237, 0.15)'
  }
} as const;
