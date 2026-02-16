import React, { useState, useEffect, useRef } from 'react';
import { AppSettings } from '../types';
import { X, Save, Github, FolderOpen, GitBranch, Terminal, Key, ShieldCheck, AlertTriangle, Cpu, Lock } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentSettings: AppSettings;
  onSave: (settings: AppSettings) => void;
  hasApiKey: boolean;
}

export const SettingsModal: React.FC<Props> = ({ isOpen, onClose, currentSettings, onSave, hasApiKey }) => {
  const [formData, setFormData] = useState<AppSettings>(currentSettings);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync state when modal opens
  useEffect(() => {
    if (isOpen) {
      setFormData(currentSettings);
    }
  }, [isOpen, currentSettings]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  const handleBrowse = () => {
    fileInputRef.current?.click();
  };

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
        // Note: Browsers do not expose the full system path (e.g. /Users/name/...) for security.
        // We get the directory name from the relative path of the first file.
        const file = e.target.files[0];
        const folderName = file.webkitRelativePath.split('/')[0];
        // Use the folder name as the root path (simulated absolute path)
        setFormData({ ...formData, worktreeRoot: `/${folderName}` });
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Terminal className="w-5 h-5 text-indigo-500" />
            Workflow Configuration
          </h2>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-1 hover:bg-slate-800 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
          
          {/* API Access Section */}
          <div className="space-y-4">
             <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                API Access
             </h3>
             <div className={`border rounded-lg p-3 flex justify-between items-center ${
                 hasApiKey ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'
             }`}>
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${hasApiKey ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                        {hasApiKey ? <ShieldCheck className="w-4 h-4" /> : <Key className="w-4 h-4" />}
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-200">Gemini API Key</p>
                        <p className="text-[10px] text-slate-500">Env Var: process.env.API_KEY</p>
                    </div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-1 rounded border ${
                    hasApiKey 
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                    : 'bg-red-500/10 text-red-400 border-red-500/20'
                }`}>
                    {hasApiKey ? 'CONNECTED' : 'MISSING'}
                </span>
             </div>
             
             {/* GitHub Token */}
             <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-300">GitHub Personal Access Token</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                  <input 
                    type="password" 
                    value={formData.githubToken || ''}
                    onChange={e => setFormData({...formData, githubToken: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 pl-9 pr-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all placeholder:text-slate-600"
                    placeholder="ghp_xxxxxxxxxxxx"
                  />
                </div>
                <p className="text-xs text-slate-500">
                    Required scopes: <strong>repo</strong> (Classic) or <strong>Contents:Read/Write, PullRequests:Read/Write</strong> (Fine-grained).
                </p>
              </div>

             {!hasApiKey && (
                 <div className="flex items-start gap-2 text-xs text-yellow-500/90 bg-yellow-500/5 border border-yellow-500/10 p-3 rounded-lg">
                     <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                     <p>
                        To enable AI features, you must set the <code>API_KEY</code> environment variable in your project configuration. The UI does not accept direct key input for security.
                     </p>
                 </div>
             )}
          </div>

          <div className="w-full h-px bg-slate-800"></div>

          {/* Repo Details */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Repository Details</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-300">Owner</label>
                <div className="relative">
                  <Github className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                  <input 
                    type="text" 
                    value={formData.repoOwner}
                    onChange={e => setFormData({...formData, repoOwner: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 pl-9 pr-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all placeholder:text-slate-600"
                    placeholder="acme-inc"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-300">Repository Name</label>
                <div className="relative">
                  <div className="absolute left-3 top-2.5 w-4 h-4 text-slate-500 flex items-center justify-center font-mono text-[10px] font-bold">/</div>
                  <input 
                    type="text" 
                    value={formData.repoName}
                    onChange={e => setFormData({...formData, repoName: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 pl-9 pr-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all placeholder:text-slate-600"
                    placeholder="my-project"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-300">Default Branch</label>
                <div className="relative">
                  <GitBranch className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                  <input 
                    type="text" 
                    value={formData.defaultBranch}
                    onChange={e => setFormData({...formData, defaultBranch: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 pl-9 pr-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all placeholder:text-slate-600"
                    placeholder="main"
                  />
                </div>
              </div>
          </div>

          <div className="w-full h-px bg-slate-800"></div>

          {/* Environment */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Local Environment</h3>
            
            <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 space-y-1.5">
                  <label className="text-sm font-medium text-slate-300">Worktree Root Path</label>
                  <div className="flex gap-2">
                      <div className="relative flex-1">
                          <FolderOpen className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                          <input 
                          type="text" 
                          value={formData.worktreeRoot}
                          onChange={e => setFormData({...formData, worktreeRoot: e.target.value})}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 pl-9 pr-3 text-sm font-mono text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all placeholder:text-slate-600"
                          placeholder="/home/dev/projects"
                          />
                      </div>
                      <button 
                          type="button"
                          onClick={handleBrowse}
                          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 text-xs font-medium transition-colors whitespace-nowrap"
                      >
                          Browse
                      </button>
                  </div>
                  <input 
                      type="file" 
                      ref={fileInputRef} 
                      className="hidden" 
                      {...{ webkitdirectory: "", directory: "" } as any} 
                      onChange={handleFolderSelect} 
                  />
                </div>

                <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-300">Max Slots</label>
                    <div className="relative">
                        <Cpu className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                        <input 
                        type="number"
                        min="1"
                        max="10"
                        value={formData.maxWorktrees}
                        onChange={e => setFormData({...formData, maxWorktrees: Math.max(1, Math.min(10, parseInt(e.target.value) || 1))})}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 pl-9 pr-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                        />
                    </div>
                </div>
            </div>
            <p className="text-xs text-slate-500">
                New worktrees will be created in subdirectories in the root path.
            </p>
          </div>

          <div className="pt-2 flex justify-end gap-3">
             <button 
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors"
             >
                Cancel
             </button>
             <button 
                type="submit"
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg shadow-lg shadow-indigo-900/20 flex items-center gap-2 transition-all"
             >
                <Save className="w-4 h-4" />
                Save Configuration
             </button>
          </div>

        </form>
      </div>
    </div>
  );
};