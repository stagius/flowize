import { TaskItem } from './types';

/**
 * Flowize Design System
 * 
 * A comprehensive color system supporting both light and dark modes
 * with WCAG AA accessibility compliance (4.5:1 for normal text, 3:1 for large text)
 */

// ============================================================================
// BASE COLOR PALETTE
// ============================================================================

export const COLOR_PALETTE = {
  // Neutral grays (light mode)
  white: '#ffffff',
  slate50: '#f8fafc',
  slate100: '#f1f5f9',
  slate200: '#e2e8f0',
  slate300: '#cbd5e1',
  slate400: '#94a3b8',
  slate500: '#64748b',
  slate600: '#475569',
  slate700: '#334155',
  slate800: '#1e293b',
  slate850: '#151e2e',
  slate900: '#0f172a',
  slate950: '#020617',
  
  // Brand & accent colors
  sky400: '#38bdf8',
  sky500: '#0ea5e9',
  sky600: '#0284c7',
  sky700: '#0369a1',
  
  cyan400: '#22d3ee',
  cyan500: '#06b6d4',
  cyan600: '#0891b2',
  cyan700: '#0e7490',
  
  indigo400: '#818cf8',
  indigo500: '#6366f1',
  indigo600: '#4f46e5',
  indigo700: '#4338ca',
  
  purple400: '#c084fc',
  purple500: '#a855f7',
  purple600: '#9333ea',
  purple700: '#7e22ce',
  
  // Status colors
  emerald400: '#34d399',
  emerald500: '#10b981',
  emerald600: '#059669',
  emerald700: '#047857',
  
  teal400: '#2dd4bf',
  teal500: '#14b8a6',
  teal600: '#0d9488',
  teal700: '#0f766e',
  
  yellow400: '#facc15',
  yellow500: '#eab308',
  yellow600: '#ca8a04',
  yellow700: '#a16207',
  
  amber400: '#fbbf24',
  amber500: '#f59e0b',
  amber600: '#d97706',
  amber700: '#b45309',
  
  orange400: '#fb923c',
  orange500: '#f97316',
  orange600: '#ea580c',
  orange700: '#c2410c',
  
  red400: '#f87171',
  red500: '#ef4444',
  red600: '#dc2626',
  red700: '#b91c1c',
  
  blue400: '#60a5fa',
  blue500: '#3b82f6',
  blue600: '#2563eb',
  blue700: '#1d4ed8',
  
  green400: '#4ade80',
  green500: '#22c55e',
  green600: '#16a34a',
  green700: '#15803d'
} as const;

// ============================================================================
// LIGHT MODE COLOR SCHEME
// ============================================================================

export const LIGHT_COLORS = {
  // Backgrounds
  background: {
    primary: 'bg-slate-50',           // Main app background
    secondary: 'bg-white',            // Cards, panels
    tertiary: 'bg-slate-100',         // Subtle surfaces
    elevated: 'bg-white',             // Modals, popovers
  },
  
  // Text
  text: {
    primary: 'text-slate-900',        // Headlines, body text (18.74:1 contrast on white)
    secondary: 'text-slate-600',      // Supporting text (7.23:1 contrast on white)
    tertiary: 'text-slate-500',       // Disabled, subtle (4.99:1 contrast on white)
    inverse: 'text-white',            // Text on dark backgrounds
  },
  
  // Borders
  border: {
    primary: 'border-slate-200',      // Default borders
    secondary: 'border-slate-300',    // Emphasized borders
    subtle: 'border-slate-100',       // Very subtle dividers
  },
  
  // Interactive states
  interactive: {
    hover: 'hover:bg-slate-100',
    active: 'active:bg-slate-200',
    focus: 'focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
    disabled: 'disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed',
  },
} as const;

// ============================================================================
// DARK MODE COLOR SCHEME
// ============================================================================

export const DARK_COLORS = {
  // Backgrounds
  background: {
    primary: 'dark:bg-slate-950',     // Main app background
    secondary: 'dark:bg-slate-900',   // Cards, panels
    tertiary: 'dark:bg-slate-800',    // Subtle surfaces
    elevated: 'dark:bg-slate-900',    // Modals, popovers
  },
  
  // Text
  text: {
    primary: 'dark:text-slate-100',   // Headlines, body text
    secondary: 'dark:text-slate-400', // Supporting text
    tertiary: 'dark:text-slate-500',  // Disabled, subtle
    inverse: 'dark:text-slate-900',   // Text on light backgrounds
  },
  
  // Borders
  border: {
    primary: 'dark:border-slate-800',
    secondary: 'dark:border-slate-700',
    subtle: 'dark:border-slate-850',
  },
  
  // Interactive states
  interactive: {
    hover: 'dark:hover:bg-slate-800',
    active: 'dark:active:bg-slate-700',
    focus: 'dark:focus:ring-indigo-400',
    disabled: 'dark:disabled:bg-slate-800 dark:disabled:text-slate-600',
  },
} as const;

// ============================================================================
// TYPOGRAPHY
// ============================================================================

export const TYPOGRAPHY = {
  // Light mode typography
  pageTitle: 'text-2xl font-bold tracking-tight text-slate-900 dark:text-white',
  sectionTitle: 'text-lg font-semibold text-slate-900 dark:text-slate-200',
  sectionSubtle: 'text-sm text-slate-600 dark:text-slate-400',
  labelCaps: 'text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400',
  code: 'font-mono text-xs text-slate-700 dark:text-slate-300',
  body: 'text-sm text-slate-900 dark:text-slate-200',
  bodySecondary: 'text-sm text-slate-600 dark:text-slate-400',
  
  // Legacy support (deprecated - use semantic names above)
  pageTitleClass: 'text-2xl font-bold tracking-tight text-slate-900 dark:text-white',
  sectionTitleClass: 'text-lg font-semibold text-slate-900 dark:text-slate-200',
  sectionSubtleClass: 'text-sm text-slate-600 dark:text-slate-400',
  labelCapsClass: 'text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400',
  codeClass: 'font-mono text-xs text-slate-700 dark:text-slate-300'
} as const;

// ============================================================================
// SPACING & LAYOUT
// ============================================================================

export const SPACING = {
  pagePadding: 'p-4 md:p-8',
  pageGap: 'space-y-6',
  panelPadding: 'p-4',
  panelPaddingLg: 'p-6',
  panelRadius: 'rounded-2xl',
  cardRadius: 'rounded-xl',
  controlGap: 'gap-2',
  sectionGap: 'gap-6'
} as const;

// ============================================================================
// SEMANTIC TONE STYLES (Info, Success, Warning, Error)
// ============================================================================

export const TONE_STYLES = {
  info: {
    // Light mode
    text: 'text-sky-700 dark:text-sky-300',
    bg: 'bg-sky-50 dark:bg-sky-950/30',
    border: 'border-sky-200 dark:border-sky-500/30',
    button: 'bg-sky-600 hover:bg-sky-700 dark:hover:bg-sky-500 border-sky-500/50 text-white',
    icon: 'text-sky-600 dark:text-sky-400',
  },
  success: {
    // Light mode
    text: 'text-emerald-700 dark:text-emerald-300',
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    border: 'border-emerald-200 dark:border-emerald-500/30',
    button: 'bg-emerald-600 hover:bg-emerald-700 dark:hover:bg-emerald-500 border-emerald-500/50 text-white',
    icon: 'text-emerald-600 dark:text-emerald-400',
  },
  warning: {
    // Light mode
    text: 'text-amber-700 dark:text-amber-300',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-amber-200 dark:border-amber-500/30',
    button: 'bg-amber-600 hover:bg-amber-700 dark:hover:bg-amber-500 border-amber-500/50 text-white',
    icon: 'text-amber-600 dark:text-amber-400',
  },
  error: {
    // Light mode
    text: 'text-red-700 dark:text-red-300',
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-red-200 dark:border-red-500/30',
    button: 'bg-red-600 hover:bg-red-700 dark:hover:bg-red-500 border-red-500/50 text-white',
    icon: 'text-red-600 dark:text-red-400',
  }
} as const;

// ============================================================================
// STEP-SPECIFIC ACCENT COLORS
// ============================================================================

export const STEP_ACCENTS = {
  input: { 
    color: 'text-sky-600 dark:text-sky-400', 
    bg: 'bg-sky-100 dark:bg-sky-400/10', 
    border: 'border-sky-300 dark:border-sky-400/20' 
  },
  issues: { 
    color: 'text-indigo-600 dark:text-indigo-400', 
    bg: 'bg-indigo-100 dark:bg-indigo-400/10', 
    border: 'border-indigo-300 dark:border-indigo-400/20' 
  },
  worktrees: { 
    color: 'text-orange-600 dark:text-orange-400', 
    bg: 'bg-orange-100 dark:bg-orange-400/10', 
    border: 'border-orange-300 dark:border-orange-400/20' 
  },
  review: { 
    color: 'text-teal-600 dark:text-teal-400', 
    bg: 'bg-teal-100 dark:bg-teal-400/10', 
    border: 'border-teal-300 dark:border-teal-400/20' 
  },
  merged: { 
    color: 'text-emerald-600 dark:text-emerald-400', 
    bg: 'bg-emerald-100 dark:bg-emerald-400/10', 
    border: 'border-emerald-300 dark:border-emerald-400/20' 
  }
} as const;

// ============================================================================
// PRIORITY BADGES
// ============================================================================

export const PRIORITY_BADGES: Record<TaskItem['priority'], string> = {
  High: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20',
  Medium: 'bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-500/10 dark:text-yellow-400 dark:border-yellow-500/20',
  Low: 'bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20'
};

// ============================================================================
// WORKTREE STATUS THEMES
// ============================================================================

export const WORKTREE_STATUS_THEMES = {
  slate: {
    border: 'border-slate-300 dark:border-slate-800',
    bg: 'bg-slate-100 dark:bg-slate-900/30',
    text: 'text-slate-600 dark:text-slate-500',
    iconBg: 'bg-slate-200 dark:bg-slate-800/50',
    iconBorder: 'border-slate-300 dark:border-slate-700',
    bar: 'bg-slate-400 dark:bg-slate-700'
  },
  cyan: {
    border: 'border-cyan-200 dark:border-cyan-500/30',
    bg: 'bg-cyan-50 dark:bg-cyan-950/10',
    text: 'text-cyan-700 dark:text-cyan-400',
    iconBg: 'bg-cyan-100 dark:bg-cyan-500/10',
    iconBorder: 'border-cyan-300 dark:border-cyan-500/20',
    bar: 'bg-cyan-500'
  },
  yellow: {
    border: 'border-yellow-200 dark:border-yellow-500/30',
    bg: 'bg-yellow-50 dark:bg-yellow-950/10',
    text: 'text-yellow-700 dark:text-yellow-400',
    iconBg: 'bg-yellow-100 dark:bg-yellow-500/10',
    iconBorder: 'border-yellow-300 dark:border-yellow-500/20',
    bar: 'bg-yellow-500'
  },
  indigo: {
    border: 'border-indigo-200 dark:border-indigo-500/30',
    bg: 'bg-indigo-50 dark:bg-indigo-950/10',
    text: 'text-indigo-700 dark:text-indigo-400',
    iconBg: 'bg-indigo-100 dark:bg-indigo-500/10',
    iconBorder: 'border-indigo-300 dark:border-indigo-500/20',
    bar: 'bg-indigo-500'
  },
  emerald: {
    border: 'border-emerald-200 dark:border-emerald-500/30',
    bg: 'bg-emerald-50 dark:bg-emerald-950/10',
    text: 'text-emerald-700 dark:text-emerald-400',
    iconBg: 'bg-emerald-100 dark:bg-emerald-500/10',
    iconBorder: 'border-emerald-300 dark:border-emerald-500/20',
    bar: 'bg-emerald-500'
  }
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Combines light and dark mode classes for a complete theme-aware class string
 */
export function themeClasses(light: string, dark: string): string {
  return `${light} ${dark}`;
}

/**
 * Creates a complete background class with light and dark variants
 */
export function themeBg(lightBg: string, darkBg: string): string {
  return themeClasses(lightBg, `dark:${darkBg}`);
}

/**
 * Creates a complete text class with light and dark variants
 */
export function themeText(lightText: string, darkText: string): string {
  return themeClasses(lightText, `dark:${darkText}`);
}

/**
 * Creates a complete border class with light and dark variants
 */
export function themeBorder(lightBorder: string, darkBorder: string): string {
  return themeClasses(lightBorder, `dark:${darkBorder}`);
}
