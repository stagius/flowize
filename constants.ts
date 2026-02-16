import { 
  ClipboardList, 
  Github, 
  GitBranch, 
  Code2, 
  GitPullRequest, 
  CheckCircle2,
  AlertCircle,
  Clock,
  Layout,
  Terminal,
  Play
} from 'lucide-react';

// Updated colors for dark theme highlights
export const STEPS = [
  { id: 1, label: 'Task Input', icon: ClipboardList, color: 'text-sky-400', bg: 'bg-sky-400/10', border: 'border-sky-400/20' },
  { id: 2, label: 'Issues', icon: Github, color: 'text-purple-400', bg: 'bg-purple-400/10', border: 'border-purple-400/20' },
  { id: 3, label: 'Worktrees', icon: GitBranch, color: 'text-orange-400', bg: 'bg-orange-400/10', border: 'border-orange-400/20' },
  { id: 4, label: 'Review', icon: GitPullRequest, color: 'text-teal-400', bg: 'bg-teal-400/10', border: 'border-teal-400/20' },
  { id: 5, label: 'Merged', icon: CheckCircle2, color: 'text-green-400', bg: 'bg-green-400/10', border: 'border-green-400/20' },
] as const;

export const ICONS = {
  Alert: AlertCircle,
  Clock,
  Layout,
  Terminal,
  Play
};