import React, { useState, useEffect } from 'react';
import { TaskItem, TaskStatus } from '../types';
import { analyzeAndFormatTasks } from '../services/geminiService';
import { Loader2, Plus, Sparkles, Trash2, AlignLeft, Sparkle } from 'lucide-react';
import { ErrorState, LoadingSkeleton } from './ui/AsyncStates';
import { PRIORITY_BADGES, SPACING, TYPOGRAPHY } from '../designSystem';

interface Props {
  onTasksGenerated: (tasks: TaskItem[]) => void;
  existingTasks: TaskItem[];
  model?: string;
}

const INPUT_STORAGE_KEY = 'flowize.input.v1';

const getStoredInput = (): string => {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(INPUT_STORAGE_KEY) || '';
  } catch {
    return '';
  }
};

const isUnsynced = (task: TaskItem): boolean => {
  return task.status === TaskStatus.RAW || task.status === TaskStatus.FORMATTED;
};

export const Step1_Input: React.FC<Props> = ({ onTasksGenerated, existingTasks, model }) => {
  const [input, setInput] = useState(getStoredInput);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [showNewOnly, setShowNewOnly] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(INPUT_STORAGE_KEY, input);
  }, [input]);

  const handleAnalyze = async () => {
    if (!input.trim()) return;
    setIsAnalyzing(true);
    setAnalysisError(null);
    try {
      const tasks = await analyzeAndFormatTasks(input, model);
      onTasksGenerated(tasks);
      setInput('');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setAnalysisError(message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 ${SPACING.sectionGap} h-full max-h-none md:max-h-[calc(100vh-12rem)] overflow-y-auto md:overflow-hidden`}>
      {/* Input Section */}
      <div className="bg-slate-900/50 backdrop-blur-sm p-4 md:p-6 rounded-2xl border border-slate-800 flex flex-col relative group h-auto md:h-full min-h-[300px] md:min-h-[460px]">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-purple-500/5 rounded-2xl -z-10"></div>

        <div className="mb-3 md:mb-4">
          <h2 className={`${TYPOGRAPHY.sectionTitleClass} flex items-center gap-2 text-base md:text-lg`}>
            <AlignLeft className="w-5 h-5 text-cyan-400" />
            Input Specifications
          </h2>
          <p className={`${TYPOGRAPHY.sectionSubtleClass} mt-1 text-xs md:text-sm`}>
            Paste raw bug reports, feature specs, or slack messages.
          </p>
        </div>

        {analysisError && (
          <div className="mb-4">
            <ErrorState
              title="Task analysis failed"
              message={analysisError}
              onRetry={handleAnalyze}
              retryLabel="Retry"
              compact
            />
          </div>
        )}

        <textarea
          className="flex-1 w-full min-h-[160px] md:min-h-[280px] p-3 md:p-4 bg-slate-950/50 border border-slate-800 rounded-xl focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 outline-none resize-none text-slate-300 font-mono text-sm placeholder:text-slate-700 transition-all shadow-inner"
          placeholder="> Fix the login button on mobile...&#10;> Add dark mode support to header...&#10;> Refactor user profile hooks..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />

        <div className="mt-3 md:mt-4 flex justify-end">
          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing || !input.trim()}
            className="flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 text-xs md:text-sm rounded-lg border border-cyan-500/30 bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/25 hover:border-cyan-400/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-yellow-300" />
                Analyze & Format
              </>
            )}
          </button>
        </div>
      </div>

      {/* Preview Section */}
      <div className="bg-slate-900/50 backdrop-blur-sm p-4 md:p-6 rounded-2xl border border-slate-800 flex flex-col h-auto md:h-full min-h-[250px] md:min-h-[460px] overflow-hidden">
        <div className="mb-3 md:mb-4 flex justify-between items-center">
          <h2 className={TYPOGRAPHY.sectionTitleClass}>Processed Log</h2>
          <div className="flex items-center gap-2 md:gap-3">
            <button
              onClick={() => setShowNewOnly(!showNewOnly)}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${showNewOnly
                  ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                }`}
              title={showNewOnly ? 'Showing new tasks only' : 'Showing all tasks'}
            >
              <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all ${showNewOnly ? 'bg-cyan-500 border-cyan-500' : 'border-slate-500'
                }`}>
                {showNewOnly && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>}
              </span>
              New only
            </button>
            <span className="text-xs font-semibold bg-slate-800 text-slate-400 px-2 py-1 rounded-full border border-slate-700">
              {showNewOnly ? existingTasks.filter(isUnsynced).length : existingTasks.length} Items
            </span>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-2 md:space-y-3 pr-2 custom-scrollbar">
          {isAnalyzing ? (
            <LoadingSkeleton rows={3} />
          ) : existingTasks.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-700 opacity-50">
              <div className="w-16 h-16 mb-4 border-2 border-dashed border-slate-800 rounded-xl flex items-center justify-center">
                <Plus className="w-6 h-6" />
              </div>
              <p>Awaiting input...</p>
            </div>
          ) : (
            [...existingTasks]
              .filter(task => !showNewOnly || isUnsynced(task))
              .sort((a, b) => {
                const aIsNew = isUnsynced(a);
                const bIsNew = isUnsynced(b);
                if (aIsNew && !bIsNew) return -1;
                if (!aIsNew && bIsNew) return 1;
                return 0;
              }).map((task) => {
                const isNew = isUnsynced(task);
                return (
                  <div key={task.id} className={`p-3 md:p-4 border rounded-xl transition-all group relative ${isNew ? 'bg-cyan-950/30 border-cyan-500/40 hover:border-cyan-400/60 hover:bg-cyan-900/40' : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 hover:bg-slate-800'}`}>
                    {isNew && (
                      <div className="absolute -top-1.5 -right-1.5">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500 text-white shadow-lg shadow-cyancyan-500/30">
                          <Sparkle className="w-3 h-3" />
                        </span>
                      </div>
                    )}
                    <div className="flex items-start justify-between gap-2 md:gap-4">
                      <span className={`font-medium text-xs md:text-sm truncate ${isNew ? 'text-cyan-100' : 'text-slate-200'}`}>{task.title}</span>
                      <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${PRIORITY_BADGES[task.priority]}`}>{task.priority}</span>
                    </div>
                    <p className="text-xs text-slate-400 line-clamp-2 mt-1 md:mt-1.5 leading-relaxed">{task.description}</p>
                    <div className="mt-2 md:mt-3 flex gap-2 items-center">
                      <span className={`text-[10px] px-2 py-0.5 rounded border ${isNew ? 'bg-cyancyan-500/20 text-cyan-300 border-cyan-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>{task.group}</span>
                      {isNew && <span className="text-[10px] text-cyan-400 font-medium">New</span>}
                    </div>
                  </div>
                );
              })
          )}
        </div>
      </div>
    </div>
  );
};
