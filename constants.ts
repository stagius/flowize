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
import { STEP_ACCENTS } from './designSystem';

export const STEPS = [
  { id: 1, label: 'Task Input', icon: ClipboardList, ...STEP_ACCENTS.input },
  { id: 2, label: 'Issues', icon: Github, ...STEP_ACCENTS.issues },
  { id: 3, label: 'Worktrees', icon: GitBranch, ...STEP_ACCENTS.worktrees },
  { id: 4, label: 'Review', icon: GitPullRequest, ...STEP_ACCENTS.review },
  { id: 5, label: 'Merged', icon: CheckCircle2, ...STEP_ACCENTS.merged },
] as const;

export const ICONS = {
  Alert: AlertCircle,
  Clock,
  Layout,
  Terminal,
  Play
};
