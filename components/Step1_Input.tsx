import React, { useState } from 'react';
import { TaskItem } from '../types';
import { analyzeAndFormatTasks } from '../services/geminiService';
import { Loader2, Plus, Sparkles, Trash2, AlignLeft } from 'lucide-react';
import { ErrorState, LoadingSkeleton } from './ui/AsyncStates';
import { PRIORITY_BADGES, SPACING, TYPOGRAPHY } from '../designSystem';

interface Props {
  onTasksGenerated: (tasks: TaskItem[]) => void;
  existingTasks: TaskItem[];
}

export const Step1_Input: React.FC<Props> = ({ onTasksGenerated, existingTasks }) => {
  const [input, setInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!input.trim()) return;
    setIsAnalyzing(true);
    setAnalysisError(null);
    try {
      const tasks = await analyzeAndFormatTasks(input);
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
    <div className={`grid grid-cols-1 md:grid-cols-2 ${SPACING.sectionGap} h-full`}>
      {/* Input Section */}
      <div className="bg-slate-900/50 backdrop-blur-sm p-6 rounded-2xl border border-slate-800 flex flex-col relative group h-full min-h-[460px]">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 rounded-2xl -z-10"></div>
        
        <div className="mb-4">
          <h2 className={`${TYPOGRAPHY.sectionTitleClass} flex items-center gap-2`}>
          <h2 className={`${TYPOGRAPHY.sectionTitleClass} flex items-center gap-2`}>
            <AlignLeft className="w-5 h-5 text-indigo-400" />
            Input Specifications
          </h2>
          <p className={`${TYPOGRAPHY.sectionSubtleClass} mt-1`}>
          <p className={`${TYPOGRAPHY.sectionSubtleClass} mt-1`}>
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
          className="flex-1 w-full min-h-[280px] p-4 bg-slate-950/50 border border-slate-800 rounded-xl focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 outline-none resize-none text-slate-300 font-mono text-sm placeholder:text-slate-700 transition-all shadow-inner"
          placeholder="> Fix the login button on mobile...&#10;> Add dark mode support to header...&#10;> Refactor user profile hooks..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />

        <div className="mt-4 flex justify-end">
          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing || !input.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg border border-indigo-500/30 bg-indigo-500/15 text-indigo-100 hover:bg-indigo-500/25 hover:border-indigo-400/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
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
      <div className="bg-slate-900/50 backdrop-blur-sm p-6 rounded-2xl border border-slate-800 flex flex-col h-full overflow-hidden">
        <div className="mb-4 flex justify-between items-center">
          <h2 className={TYPOGRAPHY.sectionTitleClass}>Processed Log</h2>
          <span className="text-xs font-semibold bg-slate-800 text-slate-400 px-2 py-1 rounded-full border border-slate-700">
            {existingTasks.length} Items
          </span>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
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
            existingTasks.map((task) => (
              <div key={task.id} className="p-4 border border-slate-800 rounded-xl bg-slate-900/80 hover:border-slate-700 hover:bg-slate-800 transition-all group">
                 <div className="flex items-start justify-between gap-4">
                    <span className="font-medium text-slate-200 text-sm truncate">{task.title}</span>
                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${PRIORITY_BADGES[task.priority]}`}>{task.priority}</span>
                 </div>
                 <p className="text-xs text-slate-400 line-clamp-2 mt-1.5 leading-relaxed">{task.description}</p>
                 <div className="mt-3 flex gap-2">
                    <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700">{task.group}</span>
                 </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
