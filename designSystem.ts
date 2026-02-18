import { TaskItem } from './types';

export const COLOR_PALETTE = {
  slate950: '#020617',
  slate900: '#0f172a',
  slate800: '#1e293b',
  slate700: '#334155',
  slate500: '#64748b',
  slate300: '#cbd5e1',
  slate100: '#f1f5f9',
  sky500: '#0ea5e9',
  cyan500: '#06b6d4',
  indigo500: '#6366f1',
  emerald500: '#10b981',
  yellow500: '#eab308',
  amber500: '#f59e0b',
  orange500: '#f97316',
  red500: '#ef4444'
} as const;

export const TYPOGRAPHY = {
  pageTitleClass: 'text-2xl font-bold tracking-tight text-white',
  sectionTitleClass: 'text-lg font-semibold text-slate-200',
  sectionSubtleClass: 'text-sm text-slate-400', // Changed from slate-500 for WCAG AA contrast (5.9:1 vs 4.0:1)
  labelCapsClass: 'text-xs font-bold uppercase tracking-wider text-slate-400', // Changed from slate-500 for WCAG AA contrast
  codeClass: 'font-mono text-xs'
} as const;

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

export const TONE_STYLES = {
  info: {
    text: 'text-sky-300',
    bg: 'bg-sky-950/30',
    border: 'border-sky-500/30',
    button: 'bg-sky-600 hover:bg-sky-500 border-sky-500/50'
  },
  success: {
    text: 'text-emerald-300',
    bg: 'bg-emerald-950/30',
    border: 'border-emerald-500/30',
    button: 'bg-emerald-600 hover:bg-emerald-500 border-emerald-500/50'
  },
  warning: {
    text: 'text-amber-300',
    bg: 'bg-amber-950/30',
    border: 'border-amber-500/30',
    button: 'bg-amber-600 hover:bg-amber-500 border-amber-500/50'
  },
  error: {
    text: 'text-red-300',
    bg: 'bg-red-950/30',
    border: 'border-red-500/30',
    button: 'bg-red-600 hover:bg-red-500 border-red-500/50'
  }
} as const;

export const STEP_ACCENTS = {
  input: { color: 'text-sky-400', bg: 'bg-sky-400/10', border: 'border-sky-400/20' },
  issues: { color: 'text-indigo-400', bg: 'bg-indigo-400/10', border: 'border-indigo-400/20' },
  worktrees: { color: 'text-orange-400', bg: 'bg-orange-400/10', border: 'border-orange-400/20' },
  review: { color: 'text-teal-400', bg: 'bg-teal-400/10', border: 'border-teal-400/20' },
  merged: { color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/20' }
} as const;

export const PRIORITY_BADGES: Record<TaskItem['priority'], string> = {
  High: 'bg-red-500/10 text-red-400 border-red-500/20',
  Medium: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  Low: 'bg-sky-500/10 text-sky-400 border-sky-500/20'
};

export const WORKTREE_STATUS_THEMES = {
  slate: {
    border: 'border-slate-800',
    bg: 'bg-slate-900/30',
    text: 'text-slate-500',
    iconBg: 'bg-slate-800/50',
    iconBorder: 'border-slate-700',
    bar: 'bg-slate-700'
  },
  cyan: {
    border: 'border-cyan-500/30',
    bg: 'bg-cyan-950/10',
    text: 'text-cyan-400',
    iconBg: 'bg-cyan-500/10',
    iconBorder: 'border-cyan-500/20',
    bar: 'bg-cyan-500'
  },
  yellow: {
    border: 'border-yellow-500/30',
    bg: 'bg-yellow-950/10',
    text: 'text-yellow-400',
    iconBg: 'bg-yellow-500/10',
    iconBorder: 'border-yellow-500/20',
    bar: 'bg-yellow-500'
  },
  indigo: {
    border: 'border-indigo-500/30',
    bg: 'bg-indigo-950/10',
    text: 'text-indigo-400',
    iconBg: 'bg-indigo-500/10',
    iconBorder: 'border-indigo-500/20',
    bar: 'bg-indigo-500'
  },
  emerald: {
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-950/10',
    text: 'text-emerald-400',
    iconBg: 'bg-emerald-500/10',
    iconBorder: 'border-emerald-500/20',
    bar: 'bg-emerald-500'
  }
} as const;
