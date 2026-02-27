import React, { useState, useEffect, useRef, useId, useCallback } from 'react';
import { AppSettings } from '../types';
import { X, Save, Github, FolderOpen, GitBranch, Terminal, Key, ShieldCheck, AlertTriangle, Cpu, Lock, Loader2, CheckCircle2, XCircle, Search, Copy, RefreshCw, FolderOpenDot, ChevronDown } from 'lucide-react';
import { fetchAuthenticatedUser, fetchUserRepositories, fetchRepositoryBranches, GithubAuthenticatedUser, GithubRepository, GithubBranch } from '../services/githubService';
import { useFocusTrap } from './ui/hooks/useFocusTrap';
import { ConfirmDialog } from './ui/Dialogs';

const SPECFLOW_SKILL_RELATIVE_PATH = '.opencode/skills/specflow-worktree-automation/SKILL.md';

const MODEL_OPTIONS = [
  { value: 'gemini-3-flash-preview', label: 'gemini-3-flash-preview', description: 'Fast' },
  { value: 'gemini-2.5-flash', label: 'gemini-2.5-flash', description: 'Balanced' },
  { value: 'gemini-2.5-flash-lite', label: 'gemini-2.5-flash-lite', description: 'Lite' },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentSettings: AppSettings;
  onSave: (settings: AppSettings) => void;
  onReset: () => void;
  onClearLocalSession: () => void;
  onLogout: () => void;
  hasApiKey: boolean;
}

export const SettingsModal: React.FC<Props> = ({ isOpen, onClose, currentSettings, onSave, onReset, onClearLocalSession, onLogout, hasApiKey }) => {
  const [formData, setFormData] = useState<AppSettings>(currentSettings);
  const [isMobileView, setIsMobileView] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 1023px)').matches;
  });
  const [githubUser, setGithubUser] = useState<GithubAuthenticatedUser | null>(null);
  const [githubRepos, setGithubRepos] = useState<GithubRepository[]>([]);
  const [repoSearchValue, setRepoSearchValue] = useState('');
  const [selectedGithubRepo, setSelectedGithubRepo] = useState('');
  const [isRepoMenuOpen, setIsRepoMenuOpen] = useState(false);
  const [githubBranches, setGithubBranches] = useState<GithubBranch[]>([]);
  const [branchSearchValue, setBranchSearchValue] = useState('');
  const [isBranchMenuOpen, setIsBranchMenuOpen] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loadingGithubData, setLoadingGithubData] = useState(false);
  const [githubAuthState, setGithubAuthState] = useState<{ status: 'idle' | 'connecting' | 'error'; message: string }>({ status: 'idle', message: '' });
  const [bridgeTest, setBridgeTest] = useState<{ status: 'idle' | 'testing' | 'ok' | 'error'; message: string }>({ status: 'idle', message: '' });
  const [bridgeRecovery, setBridgeRecovery] = useState<{ status: 'idle' | 'ok' | 'error'; message: string }>({ status: 'idle', message: '' });
  const [bridgeHealth, setBridgeHealth] = useState<{ status: 'checking' | 'healthy' | 'unhealthy'; message: string }>({
    status: 'checking',
    message: 'Checking bridge health...'
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const repoPickerRef = useRef<HTMLDivElement>(null);
  const branchPickerRef = useRef<HTMLDivElement>(null);
  const modelPickerRef = useRef<HTMLDivElement>(null);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);

  // Confirmation dialog state for unsaved changes
  const [showConfirmClose, setShowConfirmClose] = useState(false);

  // Check if form has unsaved changes
  const isFormDirty = useCallback(() => {
    return formData.githubToken !== currentSettings.githubToken ||
      formData.repoOwner !== currentSettings.repoOwner ||
      formData.repoName !== currentSettings.repoName ||
      formData.defaultBranch !== currentSettings.defaultBranch ||
      formData.agentEndpoint !== currentSettings.agentEndpoint ||
      formData.worktreeRoot !== currentSettings.worktreeRoot ||
      formData.geminiApiKey !== currentSettings.geminiApiKey ||
      formData.model !== currentSettings.model;
  }, [formData.githubToken, formData.repoOwner, formData.repoName, formData.defaultBranch, formData.agentEndpoint, formData.worktreeRoot, formData.geminiApiKey, formData.model, currentSettings]);

  // Handle close with dirty check
  const handleClose = useCallback(() => {
    if (isFormDirty()) {
      setShowConfirmClose(true);
    } else {
      onClose();
    }
  }, [isFormDirty, onClose]);

  // Handle confirmation dialog actions
  const handleConfirmDiscard = () => {
    setShowConfirmClose(false);
    onClose();
  };

  const handleCancelClose = () => {
    setShowConfirmClose(false);
  };

  // Accessibility: unique IDs for ARIA attributes
  const modalTitleId = useId();
  const repoListboxId = useId();
  const branchListboxId = useId();
  const modelListboxId = useId();


  // Focus trap for modal
  const focusTrapRef = useFocusTrap<HTMLDivElement>({
    isActive: isOpen,
    onEscape: handleClose,
    restoreFocus: true,
  });


  // Keyboard navigation state for dropdowns
  const [repoActiveIndex, setRepoActiveIndex] = useState(-1);
  const [branchActiveIndex, setBranchActiveIndex] = useState(-1);
  const [modelActiveIndex, setModelActiveIndex] = useState(-1);

  // Sync state when modal opens
  useEffect(() => {
    if (isOpen) {
      setFormData(currentSettings);
      const initialRepo = `${currentSettings.repoOwner}/${currentSettings.repoName}`;
      setRepoSearchValue(initialRepo);
      setSelectedGithubRepo(initialRepo);
      setBranchSearchValue(currentSettings.defaultBranch || '');
      setIsBranchMenuOpen(false);
      setGithubAuthState({ status: 'idle', message: '' });
      setBridgeTest({ status: 'idle', message: '' });
      setBridgeRecovery({ status: 'idle', message: '' });
      setBridgeHealth({ status: 'checking', message: 'Checking bridge health...' });
    }
  }, [isOpen, currentSettings]);

  const getBridgeBaseUrl = (endpoint: string): string => {
    const trimmed = endpoint.trim().replace(/\/+$/, '');
    return trimmed.endsWith('/run') ? trimmed.slice(0, -4) : trimmed;
  };

  const loadGithubData = async (token: string) => {
    const safeToken = token.trim();
    if (!safeToken) {
      setGithubUser(null);
      setGithubRepos([]);
      return;
    }

    setLoadingGithubData(true);
    setGithubAuthState({ status: 'idle', message: '' });

    try {
      const [user, repos] = await Promise.all([
        fetchAuthenticatedUser(safeToken),
        fetchUserRepositories(safeToken)
      ]);

      setGithubUser(user);
      setGithubRepos(repos);

      const activeFullName = `${formData.repoOwner}/${formData.repoName}`;
      const existingSelection = repos.find((repo) => repo.full_name === activeFullName);
      if (existingSelection) {
        setSelectedGithubRepo(existingSelection.full_name);
      }
    } catch (error) {
      setGithubUser(null);
      setGithubRepos([]);
      setGithubAuthState({
        status: 'error',
        message: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setLoadingGithubData(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    void loadGithubData(formData.githubToken || '');
  }, [isOpen, formData.githubToken]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(max-width: 1023px)');
    const updateIsMobileView = (event?: MediaQueryListEvent) => {
      setIsMobileView(event ? event.matches : mediaQuery.matches);
    };

    updateIsMobileView();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updateIsMobileView);
      return () => mediaQuery.removeEventListener('change', updateIsMobileView);
    }

    mediaQuery.addListener(updateIsMobileView);
    return () => mediaQuery.removeListener(updateIsMobileView);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  const handleBrowse = () => {
    fileInputRef.current?.click();
  };

  const handleConnectGithub = async () => {
    const endpoint = formData.agentEndpoint?.trim();
    if (!endpoint) {
      setGithubAuthState({ status: 'error', message: 'Set Agent Bridge Endpoint before starting GitHub OAuth.' });
      return;
    }

    const bridgeBase = getBridgeBaseUrl(endpoint);
    const endpointCandidates = getBridgeCandidates(endpoint)
      .map((candidate) => candidate.replace(/\/+$/, ''))
      .filter((value, index, arr) => arr.indexOf(value) === index);

    const oauthStartUrls = endpointCandidates
      .map((candidate) => (candidate.endsWith('/run') ? candidate.slice(0, -4) : candidate))
      .filter((value, index, arr) => arr.indexOf(value) === index)
      .map((base) => `${base}/github/oauth/start?origin=${encodeURIComponent(window.location.origin)}`);

    const allowedBridgeOrigins = endpointCandidates
      .map((candidate) => (candidate.endsWith('/run') ? candidate.slice(0, -4) : candidate))
      .filter((value, index, arr) => arr.indexOf(value) === index)
      .flatMap((base) => {
        try {
          const parsed = new URL(base);
          const origin = parsed.origin;
          if (origin.includes('127.0.0.1')) {
            return [origin, origin.replace('127.0.0.1', 'localhost')];
          }
          if (origin.includes('localhost')) {
            return [origin, origin.replace('localhost', '127.0.0.1')];
          }
          return [origin];
        } catch {
          return [];
        }
      })
      .filter((value, index, arr) => arr.indexOf(value) === index);

    let primaryBridgeOrigin = '';

    try {
      primaryBridgeOrigin = new URL(bridgeBase).origin;
    } catch {
      setGithubAuthState({ status: 'error', message: 'Agent Bridge Endpoint is not a valid URL.' });
      return;
    }

    setGithubAuthState({ status: 'connecting', message: 'Opening GitHub login window...' });

    try {
      let startPayload: { success?: boolean; authorizeUrl?: string; error?: string } | null = null;
      let lastError = '';

      for (const startUrl of oauthStartUrls) {
        try {
          const startResponse = await fetch(startUrl);
          const payload = await startResponse.json() as { success?: boolean; authorizeUrl?: string; error?: string };
          if (startResponse.ok && payload.authorizeUrl) {
            startPayload = payload;
            break;
          }
          lastError = payload.error || `HTTP ${startResponse.status} from ${startUrl}`;
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
        }
      }

      if (!startPayload?.authorizeUrl) {
        throw new Error(`${lastError || 'Failed to start GitHub OAuth flow.'} Tried: ${oauthStartUrls.join(', ')}. If you recently updated, restart the bridge.`);
      }

      const popup = window.open(startPayload.authorizeUrl, 'flowize-github-oauth', 'popup=yes,width=620,height=760');
      if (!popup) {
        throw new Error('Popup blocked. Allow popups for this site and try again.');
      }

      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          cleanup();
          reject(new Error('GitHub login timed out. Please try again.'));
        }, 180000);

        const poll = window.setInterval(() => {
          if (popup.closed) {
            cleanup();
            reject(new Error('GitHub login window was closed before completing OAuth.'));
          }
        }, 500);

        const cleanup = () => {
          window.clearTimeout(timeout);
          window.clearInterval(poll);
          window.removeEventListener('message', onMessage);
        };

        const onMessage = (event: MessageEvent) => {
          const trustedOrigins = allowedBridgeOrigins.length > 0 ? allowedBridgeOrigins : [primaryBridgeOrigin];
          if (!trustedOrigins.includes(event.origin)) return;
          const data = event.data as { source?: string; success?: boolean; token?: string; error?: string };
          if (!data || data.source !== 'flowize-github-oauth') return;

          cleanup();
          popup.close();

          if (!data.success || !data.token) {
            reject(new Error(data.error || 'GitHub OAuth failed.'));
            return;
          }

          setFormData((prev) => ({ ...prev, githubToken: data.token }));
          resolve();
        };

        window.addEventListener('message', onMessage);
      });

      setGithubAuthState({ status: 'idle', message: '' });
    } catch (error) {
      setGithubAuthState({
        status: 'error',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  };

  const handleDisconnectGithub = () => {
    setFormData({ ...formData, githubToken: '' });
    setGithubUser(null);
    setGithubRepos([]);
    setGithubBranches([]);
    setBranchSearchValue(formData.defaultBranch || '');
    setSelectedGithubRepo('');
    setGithubAuthState({ status: 'idle', message: '' });
    onLogout(); // Trigger app-level logout
  };

  const runBridgeShellCommand = async (command: string): Promise<void> => {
    const endpoint = formData.agentEndpoint?.trim();
    if (!endpoint) {
      throw new Error('Agent Bridge Endpoint is not configured.');
    }

    const candidates = getBridgeCandidates(endpoint);
    let lastError = '';

    for (const candidate of candidates) {
      try {
        const response = await fetch(candidate, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            command,
            mode: 'shell'
          })
        });

        const payload = await response.json() as { success?: boolean; error?: string };
        if (response.ok && payload.success) {
          return;
        }

        lastError = payload.error || `HTTP ${response.status} from ${candidate}`;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }

    throw new Error(lastError || 'Failed to reach bridge endpoint.');
  };

  const ensureSpecflowSkillFile = async (repoName: string): Promise<void> => {
    const targetRoot = `z:/${repoName}`;
    const safeTargetRoot = targetRoot.replace(/'/g, "''");
    const safeSkillRelativePath = SPECFLOW_SKILL_RELATIVE_PATH.replace(/'/g, "''");
    const powershellScript = [
      "$ErrorActionPreference='Stop';",
      `$targetRoot='${safeTargetRoot}';`,
      `$relativePath='${safeSkillRelativePath}';`,
      '$sourcePath=Join-Path (Get-Location) $relativePath;',
      "if (-not (Test-Path -LiteralPath $sourcePath)) { throw ('Reference skill file not found: ' + $sourcePath) }",
      '$destinationPath=Join-Path $targetRoot $relativePath;',
      'if (-not (Test-Path -LiteralPath $destinationPath)) {',
      '  New-Item -ItemType Directory -Path (Split-Path -Parent $destinationPath) -Force | Out-Null;',
      '  Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Force;',
      '}'
    ].join(' ');

    const command = `powershell -NoProfile -Command "${powershellScript.replace(/"/g, '\\"')}"`;
    await runBridgeShellCommand(command);
  };

  const handleSelectRepository = (fullName: string) => {
    setRepoSearchValue(fullName);
    setSelectedGithubRepo(fullName);
    setIsRepoMenuOpen(false);
    const selected = githubRepos.find((repo) => repo.full_name === fullName);
    if (!selected) return;

    setFormData((prev) => ({
      ...prev,
      repoOwner: selected.owner.login,
      repoName: selected.name,
      defaultBranch: selected.default_branch || prev.defaultBranch,
      worktreeRoot: `z:/${selected.name}`
    }));
    setBranchSearchValue(selected.default_branch || '');

    void ensureSpecflowSkillFile(selected.name).catch((error) => {
      setGithubAuthState({
        status: 'error',
        message: `Repo selected, but failed to ensure ${SPECFLOW_SKILL_RELATIVE_PATH}: ${error instanceof Error ? error.message : String(error)}`
      });
    });
  };

  const handleRepoSearchInput = (value: string) => {
    setRepoSearchValue(value);
    setSelectedGithubRepo('');
    setIsRepoMenuOpen(true);
    const selected = githubRepos.find((repo) => repo.full_name.toLowerCase() === value.trim().toLowerCase());
    if (!selected) return;
    handleSelectRepository(selected.full_name);
  };

  const handleSelectBranch = (branchName: string) => {
    setBranchSearchValue(branchName);
    setIsBranchMenuOpen(false);
    setFormData((prev) => ({ ...prev, defaultBranch: branchName }));
  };

  const handleBranchSearchInput = (value: string) => {
    setBranchSearchValue(value);
    setIsBranchMenuOpen(true);
    const selected = githubBranches.find((branch) => branch.name.toLowerCase() === value.trim().toLowerCase());
    if (!selected) return;
    handleSelectBranch(selected.name);
  };

  const repoQuery = repoSearchValue.trim().toLowerCase();
  const filteredGithubRepos = (repoQuery
    ? githubRepos.filter((repo) => (
      repo.full_name.toLowerCase().includes(repoQuery)
      || repo.name.toLowerCase().includes(repoQuery)
      || repo.owner.login.toLowerCase().includes(repoQuery)
    ))
    : githubRepos
  ).slice(0, 40);
  const branchQuery = branchSearchValue.trim().toLowerCase();
  const filteredGithubBranches = (branchQuery
    ? githubBranches.filter((branch) => branch.name.toLowerCase().includes(branchQuery))
    : githubBranches
  ).slice(0, 60);
  const selectedRepoExists = githubRepos.some((repo) => repo.full_name === selectedGithubRepo);
  const isGithubConnected = Boolean(githubUser && (formData.githubToken || '').trim());
  const repoControlledByOAuth = Boolean(githubUser && selectedRepoExists);
  const canUseBranchDropdown = repoControlledByOAuth;

  useEffect(() => {
    if (!isRepoMenuOpen) return;

    const handleWindowMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (repoPickerRef.current && !repoPickerRef.current.contains(target)) {
        setIsRepoMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', handleWindowMouseDown);
    return () => {
      window.removeEventListener('mousedown', handleWindowMouseDown);
    };
  }, [isRepoMenuOpen]);

  useEffect(() => {
    if (!isBranchMenuOpen) return;

    const handleWindowMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (branchPickerRef.current && !branchPickerRef.current.contains(target)) {
        setIsBranchMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', handleWindowMouseDown);
    return () => {
      window.removeEventListener('mousedown', handleWindowMouseDown);
    };
  }, [isBranchMenuOpen]);

  useEffect(() => {
    if (!isModelMenuOpen) return;

    const handleWindowMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (modelPickerRef.current && !modelPickerRef.current.contains(target)) {
        setIsModelMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', handleWindowMouseDown);
    return () => {
      window.removeEventListener('mousedown', handleWindowMouseDown);
    };
  }, [isModelMenuOpen]);

  useEffect(() => {
    if (!repoControlledByOAuth) {
      setIsBranchMenuOpen(false);
    }
  }, [repoControlledByOAuth]);

  useEffect(() => {
    const token = (formData.githubToken || '').trim();
    const owner = formData.repoOwner.trim();
    const repo = formData.repoName.trim();
    const currentDefaultBranch = formData.defaultBranch;

    if (!token || !repoControlledByOAuth || !owner || !repo) {
      setGithubBranches([]);
      setLoadingBranches(false);
      return;
    }

    let cancelled = false;
    const loadBranches = async () => {
      setLoadingBranches(true);
      try {
        const branches = await fetchRepositoryBranches(token, owner, repo);
        if (cancelled) return;
        setGithubBranches(branches);

        if (!branches.some((branch) => branch.name === currentDefaultBranch) && branches.length > 0) {
          const fallback = branches.find((branch) => branch.name === 'main')
            || branches.find((branch) => branch.name === 'master')
            || branches[0];
          setBranchSearchValue(fallback.name);
          setFormData((prev) => ({ ...prev, defaultBranch: fallback.name }));
        } else {
          setBranchSearchValue(currentDefaultBranch || '');
        }
      } catch {
        if (cancelled) return;
        setGithubBranches([]);
      } finally {
        if (!cancelled) {
          setLoadingBranches(false);
        }
      }
    };

    void loadBranches();
    return () => {
      cancelled = true;
    };
  }, [formData.githubToken, formData.repoOwner, formData.repoName, repoControlledByOAuth]);

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      // Note: Browsers do not expose the full system path (e.g. /Users/name/...) for security.
      // We get the directory name from the relative path of the first file.
      const file = e.target.files[0];
      const folderName = file.webkitRelativePath.split('/')[0];
      // Use the folder name as the root path placeholder.
      setFormData({ ...formData, worktreeRoot: `/${folderName}` });
    }
  };

  const getBridgeCandidates = (endpoint: string): string[] => {
    const trimmed = endpoint.trim().replace(/\/+$/, '');
    const withRun = trimmed.endsWith('/run') ? trimmed : `${trimmed}/run`;
    const withoutRun = trimmed.endsWith('/run') ? trimmed.slice(0, -4) : trimmed;
    const browserHost = typeof window !== 'undefined' ? window.location.hostname : '';

    const alternates = [withRun, withoutRun]
      .flatMap((value) => {
        const hostAlternates = [value];
        if (value.includes('127.0.0.1')) {
          hostAlternates.push(value.replace('127.0.0.1', 'localhost'));
        }
        if (value.includes('localhost')) {
          hostAlternates.push(value.replace('localhost', '127.0.0.1'));
        }
        if (browserHost && !value.includes(browserHost)) {
          hostAlternates.push(value.replace('127.0.0.1', browserHost));
          hostAlternates.push(value.replace('localhost', browserHost));
        }
        return hostAlternates;
      })
      .filter((value) => value.length > 0);

    return Array.from(new Set(alternates));
  };

  const handleTestBridge = async () => {
    const endpoint = formData.agentEndpoint?.trim();
    if (!endpoint) {
      setBridgeTest({ status: 'error', message: 'Set Agent Bridge Endpoint first.' });
      setBridgeRecovery({ status: 'idle', message: '' });
      return;
    }

    setBridgeRecovery({ status: 'idle', message: '' });
    setBridgeTest({ status: 'testing', message: 'Testing bridge connectivity...' });
    const candidates = getBridgeCandidates(endpoint);
    let lastNetworkError = '';
    let reachableButRejected = '';

    for (const candidate of candidates) {
      try {
        const response = await fetch(candidate, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            command: 'echo flowize-bridge-test',
            mode: 'shell',
            ping: true
          })
        });

        if (response.ok) {
          setBridgeTest({ status: 'ok', message: `Bridge reachable at ${candidate}` });
          return;
        }

        reachableButRejected = `Endpoint reachable at ${candidate} but rejected request (${response.status}).`;
      } catch (error) {
        lastNetworkError = error instanceof Error ? error.message : String(error);
      }
    }

    if (reachableButRejected) {
      setBridgeTest({ status: 'error', message: `${reachableButRejected} Check bridge payload/route contract.` });
      return;
    }

    setBridgeTest({
      status: 'error',
      message: `Bridge unreachable. Tried: ${candidates.join(', ')}. Last error: ${lastNetworkError || 'Failed to fetch'}. App origin: ${typeof window !== 'undefined' ? window.location.origin : 'unknown'}`
    });
  };

  const handleCopyBridgeStartCommand = async () => {
    const manualCommand = 'npm run bridge:start';
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(manualCommand);
        setBridgeRecovery({ status: 'ok', message: `Copied \`${manualCommand}\` to clipboard.` });
        return;
      } catch {
        // fall through
      }
    }

    setBridgeRecovery({ status: 'error', message: `Clipboard unavailable. Run \`${manualCommand}\` in a terminal.` });
  };

  const bridgeHealthFailedToFetch = bridgeHealth.status === 'unhealthy'
    && bridgeHealth.message.toLowerCase().includes('failed to fetch');
  const shouldShowBridgeRecovery = bridgeTest.status === 'error' || bridgeHealthFailedToFetch;

  const checkBridgeHealth = async (endpoint: string) => {
    const candidates = getBridgeCandidates(endpoint)
      .map((candidate) => {
        const base = candidate.endsWith('/run') ? candidate.slice(0, -4) : candidate;
        return `${base}/health`;
      })
      .filter((value, index, arr) => arr.indexOf(value) === index);

    let lastError = '';

    for (const healthUrl of candidates) {
      try {
        const response = await fetch(healthUrl, { method: 'GET' });
        if (!response.ok) {
          lastError = `HTTP ${response.status} at ${healthUrl}`;
          continue;
        }

        const payload = await response.json() as { ok?: boolean; asyncJobs?: boolean };
        if (payload.ok) {
          const asyncNote = payload.asyncJobs ? ' (async jobs: enabled)' : '';
          setBridgeHealth({ status: 'healthy', message: `Healthy at ${healthUrl}${asyncNote}` });
          return;
        }

        lastError = `Unexpected /health payload at ${healthUrl}`;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }

    setBridgeHealth({
      status: 'unhealthy',
      message: `Bridge health check failed. ${lastError || 'Unable to reach /health endpoint.'}`
    });
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const endpoint = formData.agentEndpoint?.trim();
    if (!endpoint) {
      setBridgeHealth({ status: 'unhealthy', message: 'Set Agent Bridge Endpoint to enable health checks.' });
      return;
    }

    let disposed = false;
    const runCheck = async () => {
      if (disposed) return;
      setBridgeHealth((prev) => ({
        status: 'checking',
        message: prev.status === 'healthy' ? 'Re-checking bridge health...' : 'Checking bridge health...'
      }));
      await checkBridgeHealth(endpoint);
    };

    runCheck();
    const timer = window.setInterval(runCheck, 10000);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [isOpen, formData.agentEndpoint]);

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 z-[100] ${isMobileView ? 'flex items-stretch justify-end' : 'flex items-center justify-center p-4'}`}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/40 dark:bg-slate-950/40 backdrop-blur-sm transition-opacity"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Modal Content */}
      <div
        ref={focusTrapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={modalTitleId}
        className={`relative bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden duration-200 flex flex-col ${isMobileView
          ? 'h-full w-full max-w-md border-l animate-in slide-in-from-right'
          : 'w-full max-w-5xl border rounded-2xl animate-in fade-in zoom-in-95 max-h-[90vh]'
          }`}
      >
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50 flex-shrink-0">
          <h2 id={modalTitleId} className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Terminal className="w-5 h-5 text-indigo-500" aria-hidden="true" />
            Workflow Configuration
          </h2>
          <button
            onClick={handleClose}
            className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Close settings"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className={`p-6 space-y-8 overflow-y-auto custom-scrollbar flex-1 ${isMobileView ? 'pb-4' : ''}`}>

            {/* API Access Section */}
            <div className="space-y-5">
              <h3 className="text-xs font-bold text-slate-700 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                API Access
              </h3>
              <div className={`border rounded-lg p-3 flex justify-between items-center ${(formData.geminiApiKey || hasApiKey) ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'
                }`}>
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${(formData.geminiApiKey || hasApiKey) ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                    {(formData.geminiApiKey || hasApiKey) ? <ShieldCheck className="w-4 h-4" /> : <Key className="w-4 h-4" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-200">Gemini API Key</p>
                    <p className="text-[10px] text-slate-600 dark:text-slate-400">Configured in Settings</p>
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-1 rounded border ${(formData.geminiApiKey || hasApiKey)
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-red-500/10 text-red-400 border-red-500/20'
                  }`}>
                  {(formData.geminiApiKey || hasApiKey) ? 'CONNECTED' : 'MISSING'}
                </span>
              </div>

              {/* Gemini API Key Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Gemini API Key</label>
                <input
                  type="password"
                  value={formData.geminiApiKey || ''}
                  onChange={e => setFormData({ ...formData, geminiApiKey: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-3 text-sm font-mono text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all placeholder:text-slate-600 dark:placeholder:text-slate-600"
                  placeholder="Enter your Gemini API key"
                />
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Get one from{' '}
                  <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:underline">Google AI Studio</a>.
                </p>
              </div>

              {/* Model Selection */}
              <div className="space-y-2">
                <label id={`${modelListboxId}-label`} className="text-sm font-medium text-slate-700 dark:text-slate-300">Gemini Model</label>
                <div className="relative" ref={modelPickerRef}>
                  <Cpu className="absolute left-3 top-2.5 w-4 h-4 text-slate-600 dark:text-slate-400" aria-hidden="true" />
                  <button
                    type="button"
                    onClick={() => setIsModelMenuOpen(!isModelMenuOpen)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape' && isModelMenuOpen) {
                        e.preventDefault();
                        setIsModelMenuOpen(false);
                        setModelActiveIndex(-1);
                      } else if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        if (!isModelMenuOpen) {
                          setIsModelMenuOpen(true);
                          setModelActiveIndex(0);
                        } else {
                          setModelActiveIndex((prev) =>
                            prev < MODEL_OPTIONS.length - 1 ? prev + 1 : 0
                          );
                        }
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        if (!isModelMenuOpen) {
                          setIsModelMenuOpen(true);
                          setModelActiveIndex(MODEL_OPTIONS.length - 1);
                        } else {
                          setModelActiveIndex((prev) =>
                            prev > 0 ? prev - 1 : MODEL_OPTIONS.length - 1
                          );
                        }
                      } else if ((e.key === 'Enter' || e.key === ' ') && isModelMenuOpen && modelActiveIndex >= 0) {
                        e.preventDefault();
                        setFormData({ ...formData, model: MODEL_OPTIONS[modelActiveIndex].value });
                        setIsModelMenuOpen(false);
                        setModelActiveIndex(-1);
                      }
                    }}
                    role="combobox"
                    aria-expanded={isModelMenuOpen}
                    aria-haspopup="listbox"
                    aria-controls={modelListboxId}
                    aria-labelledby={`${modelListboxId}-label`}
                    aria-activedescendant={modelActiveIndex >= 0 ? `model-option-${modelActiveIndex}` : undefined}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 pl-9 pr-9 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all text-left flex items-center justify-between"
                  >
                    <span>
                      {(() => {
                        const selected = MODEL_OPTIONS.find(m => m.value === (formData.model || 'gemini-3-pro'));
                        return selected ? `${selected.label}${selected.description ? ` (${selected.description})` : ''}` : (formData.model || 'gemini-3-pro');
                      })()}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-slate-600 dark:text-slate-400 transition-transform ${isModelMenuOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </button>

                  {isModelMenuOpen && (
                    <ul
                      id={modelListboxId}
                      role="listbox"
                      aria-label="Model options"
                      className="absolute left-0 right-0 top-full mt-1 z-[120] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/95 shadow-2xl max-h-[300px] overflow-y-auto"
                    >
                      {MODEL_OPTIONS.map((model, index) => {
                        const isSelected = model.value === (formData.model || 'gemini-3-pro');
                        const isActive = index === modelActiveIndex;
                        return (
                          <li
                            key={model.value}
                            id={`model-option-${index}`}
                            role="option"
                            aria-selected={isSelected}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setFormData({ ...formData, model: model.value });
                              setIsModelMenuOpen(false);
                              setModelActiveIndex(-1);
                            }}
                            onMouseEnter={() => setModelActiveIndex(index)}
                            className={`w-full text-left px-3 py-2 border-b border-slate-200 dark:border-slate-800/70 last:border-b-0 cursor-pointer transition-colors ${isSelected ? 'bg-indigo-500/10' : ''} ${isActive ? 'bg-slate-100 dark:bg-slate-800/80' : 'hover:bg-slate-100 dark:hover:bg-slate-800/80'}`}
                          >
                            <p className="text-xs font-medium text-slate-900 dark:text-slate-200">{model.label}</p>
                            {model.description && (
                              <p className="text-[10px] text-slate-500 dark:text-slate-400">{model.description}</p>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Select the Gemini model for AI task analysis.
                </p>
              </div>

            </div>

            <div className="w-full h-px bg-slate-200 dark:bg-slate-800"></div>

            {/* Repo Details */}
            <div className="space-y-5">
              <h3 className="text-xs font-bold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Repository Details</h3>

              {/* GitHub Token */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">GitHub Personal Access Token</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 w-4 h-4 text-slate-600 dark:text-slate-400" />
                  <input
                    type="password"
                    value={formData.githubToken || ''}
                    onChange={e => setFormData({ ...formData, githubToken: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 pl-9 pr-3 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all placeholder:text-slate-600 dark:placeholder:text-slate-600"
                    placeholder="ghp_xxxxxxxxxxxx"
                  />
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Get one from{' '}
                  <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:underline">GitHub Settings</a>.
                  Required scopes: <strong>repo</strong> (Classic) or <strong>Contents:Read/Write, PullRequests:Read/Write</strong> (Fine-grained).
                </p>

                <div className="w-full h-px bg-slate-200 dark:bg-slate-800 my-3"></div>

                <p className="text-xs text-center text-slate-600 dark:text-slate-400">
                  Or connect via OAuth
                </p>

                <div className="mt-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950/60 p-3 space-y-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold text-slate-900 dark:text-slate-300">GitHub OAuth (local bridge)</p>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400">Uses bridge env vars instead of pasting tokens manually.</p>
                    </div>
                    <div className="flex items-center gap-2 sm:justify-end">
                      {!isGithubConnected && (
                        <button
                          type="button"
                          onClick={handleConnectGithub}
                          disabled={githubAuthState.status === 'connecting'}
                          className="px-3 py-1.5 text-xs font-medium rounded-md bg-indigo-600 hover:bg-indigo-500 text-white whitespace-nowrap disabled:opacity-70 disabled:cursor-not-allowed inline-flex items-center gap-1.5 min-h-[44px]"
                        >
                          <Github className="w-3.5 h-3.5" />
                          {githubAuthState.status === 'connecting' ? 'Connecting...' : 'Connect with GitHub'}
                        </button>
                      )}
                      {formData.githubToken && (
                        <button
                          type="button"
                          onClick={handleDisconnectGithub}
                          className="px-3 py-1.5 text-xs font-medium rounded-md bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-200 border border-slate-300 dark:border-slate-700 whitespace-nowrap min-h-[44px]"
                        >
                          Disconnect
                        </button>
                      )}
                    </div>
                  </div>

                  {githubUser && (
                    <p className="text-xs text-emerald-700 dark:text-emerald-300">
                      Connected as <strong>{githubUser.login}</strong>
                    </p>
                  )}

                  {loadingGithubData && (
                    <p className="text-xs text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin" /> Loading GitHub profile and repositories...
                    </p>
                  )}

                  {githubAuthState.status === 'error' && (
                    <p className="text-xs text-red-700 dark:text-red-300">{githubAuthState.message}</p>
                  )}

                  {githubRepos.length > 0 && (
                    <div className="space-y-1.5">
                      <label id={`${repoListboxId}-label`} className="text-xs font-medium text-slate-700 dark:text-slate-300">Repository</label>
                      <div className="relative" ref={repoPickerRef}>
                        <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-600 dark:text-slate-400" aria-hidden="true" />
                        <input
                          value={repoSearchValue}
                          onChange={(e) => {
                            handleRepoSearchInput(e.target.value);
                            setRepoActiveIndex(-1);
                          }}
                          onFocus={() => setIsRepoMenuOpen(true)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              setIsRepoMenuOpen(false);
                              setRepoActiveIndex(-1);
                            } else if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              if (!isRepoMenuOpen) setIsRepoMenuOpen(true);
                              setRepoActiveIndex((prev) =>
                                prev < filteredGithubRepos.length - 1 ? prev + 1 : 0
                              );
                            } else if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              if (!isRepoMenuOpen) setIsRepoMenuOpen(true);
                              setRepoActiveIndex((prev) =>
                                prev > 0 ? prev - 1 : filteredGithubRepos.length - 1
                              );
                            } else if (e.key === 'Enter' && repoActiveIndex >= 0 && filteredGithubRepos[repoActiveIndex]) {
                              e.preventDefault();
                              handleSelectRepository(filteredGithubRepos[repoActiveIndex].full_name);
                              setRepoActiveIndex(-1);
                            }
                          }}
                          placeholder="Search repos (owner/name)"
                          role="combobox"
                          aria-expanded={isRepoMenuOpen}
                          aria-haspopup="listbox"
                          aria-controls={repoListboxId}
                          aria-autocomplete="list"
                          aria-activedescendant={repoActiveIndex >= 0 ? `repo-option-${repoActiveIndex}` : undefined}
                          aria-labelledby={`${repoListboxId}-label`}
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 pl-9 pr-3 text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50"
                        />

                        {isRepoMenuOpen && (
                          <ul
                            id={repoListboxId}
                            role="listbox"
                            aria-label="Repository options"
                            className="absolute left-0 right-0 top-full mt-1 z-[120] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/95 shadow-2xl max-h-[400px] overflow-y-auto"
                          >
                            {filteredGithubRepos.length === 0 ? (
                              <li className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400" role="option" aria-disabled="true">No repositories found.</li>
                            ) : (
                              filteredGithubRepos.map((repo, index) => {
                                const isSelected = repo.full_name === `${formData.repoOwner}/${formData.repoName}`;
                                const isActive = index === repoActiveIndex;
                                return (
                                  <li
                                    key={repo.id}
                                    id={`repo-option-${index}`}
                                    role="option"
                                    aria-selected={isSelected}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                      handleSelectRepository(repo.full_name);
                                      setRepoActiveIndex(-1);
                                    }}
                                    onMouseEnter={() => setRepoActiveIndex(index)}
                                    className={`w-full text-left px-3 py-2 border-b border-slate-200 dark:border-slate-800/70 last:border-b-0 cursor-pointer transition-colors ${isSelected ? 'bg-indigo-500/10' : ''} ${isActive ? 'bg-slate-100 dark:bg-slate-800/80' : 'hover:bg-slate-100 dark:hover:bg-slate-800/80'}`}
                                  >
                                    <p className="text-xs font-medium text-slate-900 dark:text-slate-200">{repo.full_name}</p>
                                    <p className="text-[10px] text-slate-500 dark:text-slate-400">{repo.private ? 'private' : 'public'}</p>
                                  </li>
                                );
                              })
                            )}
                          </ul>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400">Loaded from your authenticated GitHub account (latest 100 repos).</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Owner</label>
                  <div className="relative">
                    <Github className="absolute left-3 top-2.5 w-4 h-4 text-slate-600 dark:text-slate-400" />
                    <input
                      type="text"
                      value={formData.repoOwner}
                      onChange={e => setFormData({ ...formData, repoOwner: e.target.value })}
                      disabled={repoControlledByOAuth}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 pl-9 pr-3 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all placeholder:text-slate-600 dark:placeholder:text-slate-600 disabled:opacity-70 disabled:cursor-not-allowed"
                      placeholder="acme-inc"
                    />
                  </div>
                  {repoControlledByOAuth && (
                    <p className="text-[10px] text-slate-600 dark:text-slate-400">Owner is synced from selected GitHub repository.</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Repository Name</label>
                  <div className="relative">
                    <div className="absolute left-3 top-2.5 w-4 h-4 text-slate-600 dark:text-slate-400 flex items-center justify-center font-mono text-[10px] font-bold">/</div>
                    <input
                      type="text"
                      value={formData.repoName}
                      onChange={e => setFormData({ ...formData, repoName: e.target.value })}
                      disabled={repoControlledByOAuth}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 pl-9 pr-3 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all placeholder:text-slate-600 dark:placeholder:text-slate-600 disabled:opacity-70 disabled:cursor-not-allowed"
                      placeholder="my-project"
                    />
                  </div>
                  {repoControlledByOAuth && (
                    <p className="text-[10px] text-slate-600 dark:text-slate-400">Repository name is synced from selected GitHub repository.</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label id={`${branchListboxId}-label`} className="text-sm font-medium text-slate-700 dark:text-slate-300">Default Branch</label>
                {canUseBranchDropdown ? (
                  <div className="relative" ref={branchPickerRef}>
                    <GitBranch className="absolute left-3 top-2.5 w-4 h-4 text-slate-600 dark:text-slate-400" aria-hidden="true" />
                    <input
                      type="text"
                      value={branchSearchValue}
                      onChange={(e) => {
                        handleBranchSearchInput(e.target.value);
                        setBranchActiveIndex(-1);
                      }}
                      onFocus={() => setIsBranchMenuOpen(true)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setIsBranchMenuOpen(false);
                          setBranchActiveIndex(-1);
                        } else if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          if (!isBranchMenuOpen) setIsBranchMenuOpen(true);
                          setBranchActiveIndex((prev) =>
                            prev < filteredGithubBranches.length - 1 ? prev + 1 : 0
                          );
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          if (!isBranchMenuOpen) setIsBranchMenuOpen(true);
                          setBranchActiveIndex((prev) =>
                            prev > 0 ? prev - 1 : filteredGithubBranches.length - 1
                          );
                        } else if (e.key === 'Enter' && branchActiveIndex >= 0 && filteredGithubBranches[branchActiveIndex]) {
                          e.preventDefault();
                          handleSelectBranch(filteredGithubBranches[branchActiveIndex].name);
                          setBranchActiveIndex(-1);
                        }
                      }}
                      role="combobox"
                      aria-expanded={isBranchMenuOpen}
                      aria-haspopup="listbox"
                      aria-controls={branchListboxId}
                      aria-autocomplete="list"
                      aria-activedescendant={branchActiveIndex >= 0 ? `branch-option-${branchActiveIndex}` : undefined}
                      aria-labelledby={`${branchListboxId}-label`}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 pl-9 pr-3 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all placeholder:text-slate-600 dark:placeholder:text-slate-600"
                      placeholder="Search branch"
                    />

                    {isBranchMenuOpen && (
                      <ul
                        id={branchListboxId}
                        role="listbox"
                        aria-label="Branch options"
                        className="absolute left-0 right-0 top-full mt-1 z-[120] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/95 shadow-2xl max-h-52 overflow-y-auto"
                      >
                        {loadingBranches ? (
                          <li className="px-3 py-2 text-xs text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5" role="option" aria-disabled="true">
                            <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> Loading branches...
                          </li>
                        ) : filteredGithubBranches.length === 0 ? (
                          <li className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400" role="option" aria-disabled="true">No branches found.</li>
                        ) : (
                          filteredGithubBranches.map((branch, index) => {
                            const isSelected = branch.name === formData.defaultBranch;
                            const isActive = index === branchActiveIndex;
                            return (
                              <li
                                key={branch.name}
                                id={`branch-option-${index}`}
                                role="option"
                                aria-selected={isSelected}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  handleSelectBranch(branch.name);
                                  setBranchActiveIndex(-1);
                                }}
                                onMouseEnter={() => setBranchActiveIndex(index)}
                                className={`w-full text-left px-3 py-2 border-b border-slate-200 dark:border-slate-800/70 last:border-b-0 cursor-pointer transition-colors ${isSelected ? 'bg-indigo-500/10' : ''} ${isActive ? 'bg-slate-100 dark:bg-slate-800/80' : 'hover:bg-slate-100 dark:hover:bg-slate-800/80'}`}
                              >
                                <p className="text-xs font-medium text-slate-900 dark:text-slate-200">{branch.name}</p>
                              </li>
                            );
                          })
                        )}
                      </ul>
                    )}
                  </div>
                ) : (
                  <div className="relative">
                    <GitBranch className="absolute left-3 top-2.5 w-4 h-4 text-slate-600 dark:text-slate-400" aria-hidden="true" />
                    <input
                      type="text"
                      value={formData.defaultBranch}
                      onChange={e => {
                        setBranchSearchValue(e.target.value);
                        setFormData({ ...formData, defaultBranch: e.target.value });
                      }}
                      aria-labelledby={`${branchListboxId}-label`}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 pl-9 pr-3 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all placeholder:text-slate-600 dark:placeholder:text-slate-600"
                      placeholder="main"
                    />
                  </div>
                )}
                {canUseBranchDropdown && (
                  <p className="text-[10px] text-slate-600 dark:text-slate-400">Branch list is loaded from selected GitHub repository.</p>
                )}
              </div>
            </div>

            <div className="w-full h-px bg-slate-200 dark:bg-slate-800"></div>

            {/* Environment */}
            <div className="space-y-5">
              <h3 className="text-xs font-bold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Local Environment</h3>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <div className="col-span-2 space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Worktree Root Path</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <FolderOpen className="absolute left-3 top-2.5 w-4 h-4 text-slate-600 dark:text-slate-400" />
                      <input
                        type="text"
                        value={formData.worktreeRoot}
                        onChange={e => setFormData({ ...formData, worktreeRoot: e.target.value })}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 pl-9 pr-3 text-sm font-mono text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all placeholder:text-slate-600 dark:placeholder:text-slate-600"
                        placeholder="/home/dev/projects"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleBrowse}
                      className="px-3 py-2 bg-slate-600 hover:bg-slate-500 text-white text-sm font-medium rounded-lg shadow-lg shadow-slate-900/20 flex items-center gap-2 transition-all"
                    >
                      <FolderOpenDot className="w-4 h-4" />
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

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Max Slots</label>
                  <div className="relative">
                    <Cpu className="absolute left-3 top-2.5 w-4 h-4 text-slate-600 dark:text-slate-400" />
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={formData.maxWorktrees}
                      onChange={e => setFormData({ ...formData, maxWorktrees: Math.max(1, Math.min(10, parseInt(e.target.value) || 1)) })}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 pl-9 pr-3 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                    />
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                New worktrees will be created as sibling folders (example: /flowize-wt-1).
              </p>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Agent Command</label>
                <input
                  type="text"
                  value={formData.agentCommand || ''}
                  onChange={e => setFormData({ ...formData, agentCommand: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-3 text-sm font-mono text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all placeholder:text-slate-600 dark:placeholder:text-slate-600"
                  placeholder={'cd "{worktreePath}" && opencode run {agentFlag} "Implement issue #{issueNumber} on branch {branch}. Use {issueDescriptionFile} as requirements and follow {skillFile}. Return code/output for this task." --print-logs'}
                />
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Used when you click Implement on a worktree task with an issue. Placeholders: {'{issueNumber}'}, {'{branch}'}, {'{title}'}, {'{worktreePath}'}, {'{agentWorkspace}'}, {'{issueDescriptionFile}'}, {'{skillFile}'}, {'{agentName}'}, {'{agentFlag}'}.
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Use a headless CLI command that prints to stdout (for example `opencode run ... --print-logs`). GUI chat commands open windows and will not stream implementation output back.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">OpenCode Agent Name (optional)</label>
                <input
                  type="text"
                  value={formData.agentName || ''}
                  onChange={e => setFormData({ ...formData, agentName: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-3 text-sm font-mono text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all placeholder:text-slate-600 dark:placeholder:text-slate-600"
                  placeholder="frontend"
                />
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  If set, {'{agentFlag}'} expands to `--agent "name"` in the command template.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Agent Bridge Endpoint</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={formData.agentEndpoint || ''}
                      onChange={e => setFormData({ ...formData, agentEndpoint: e.target.value })}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-3 text-sm font-mono text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all placeholder:text-slate-600 dark:placeholder:text-slate-600"
                      placeholder="http://127.0.0.1:4141/run"
                    />
                    <button
                      type="button"
                      onClick={handleTestBridge}
                      disabled={bridgeTest.status === 'testing'}
                      className="px-3 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-200 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium transition-colors whitespace-nowrap disabled:opacity-70 disabled:cursor-not-allowed min-h-[44px]"
                    >
                      {bridgeTest.status === 'testing' ? (
                        <span className="inline-flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Testing</span>
                      ) : 'Test bridge'}
                    </button>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Must be a running local HTTP bridge that accepts POST and allows browser origin access (CORS).
                  </p>
                  <div className={`text-xs rounded-lg border px-3 py-2 flex items-start gap-2 ${bridgeHealth.status === 'healthy'
                    ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                    : bridgeHealth.status === 'checking'
                      ? 'bg-indigo-500/5 border-indigo-500/20 text-indigo-700 dark:text-indigo-300'
                      : 'bg-red-500/5 border-red-500/20 text-red-700 dark:text-red-300'
                    }`}>
                    {bridgeHealth.status === 'healthy'
                      ? <CheckCircle2 className="w-4 h-4 mt-0.5" />
                      : bridgeHealth.status === 'checking'
                        ? <Loader2 className="w-4 h-4 mt-0.5 animate-spin" />
                        : <XCircle className="w-4 h-4 mt-0.5" />}
                    <span>{bridgeHealth.message}</span>
                  </div>
                  {bridgeTest.status !== 'idle' && (
                    <div className={`text-xs rounded-lg border px-3 py-2 flex items-start gap-2 ${bridgeTest.status === 'ok'
                      ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                      : bridgeTest.status === 'testing'
                        ? 'bg-indigo-500/5 border-indigo-500/20 text-indigo-700 dark:text-indigo-300'
                        : 'bg-red-500/5 border-red-500/20 text-red-700 dark:text-red-300'
                      }`}>
                      {bridgeTest.status === 'ok' ? <CheckCircle2 className="w-4 h-4 mt-0.5" /> : bridgeTest.status === 'testing' ? <Loader2 className="w-4 h-4 mt-0.5 animate-spin" /> : <XCircle className="w-4 h-4 mt-0.5" />}
                      <span>{bridgeTest.message}</span>
                    </div>
                  )}
                  {shouldShowBridgeRecovery && (
                    <div className="space-y-2">
                      <p className="text-xs text-amber-600 dark:text-amber-300/90">
                        Browser security cannot start a terminal directly. Auto-start only works when a bridge endpoint is already reachable.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={handleCopyBridgeStartCommand}
                          className="px-3 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-200 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium transition-colors whitespace-nowrap min-h-[44px]"
                        >
                          <span className="inline-flex items-center gap-1.5"><Copy className="w-3 h-3" /> Copy Start Command</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleTestBridge}
                          disabled={bridgeTest.status === 'testing'}
                          className="px-3 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-200 rounded-lg border border-indigo-500/30 text-xs font-medium transition-colors whitespace-nowrap disabled:opacity-70 disabled:cursor-not-allowed min-h-[44px]"
                        >
                          {bridgeTest.status === 'testing' ? (
                            <span className="inline-flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Re-testing...</span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5"><RefreshCw className="w-3 h-3" /> Re-test Bridge</span>
                          )}
                        </button>
                      </div>
                      {bridgeRecovery.status !== 'idle' && (
                        <div className={`text-xs rounded-lg border px-3 py-2 flex items-start gap-2 ${bridgeRecovery.status === 'ok'
                          ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                          : 'bg-red-500/5 border-red-500/20 text-red-700 dark:text-red-300'
                          }`}>
                          {bridgeRecovery.status === 'ok' ? <CheckCircle2 className="w-4 h-4 mt-0.5" /> : <XCircle className="w-4 h-4 mt-0.5" />}
                          <span>{bridgeRecovery.message}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Agent Workspace Folder</label>
                  <input
                    type="text"
                    value={formData.agentSubdir || ''}
                    onChange={e => setFormData({ ...formData, agentSubdir: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-3 text-sm font-mono text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all placeholder:text-slate-600 dark:placeholder:text-slate-600"
                    placeholder=".agent-workspace"
                  />
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Subdirectory created in each worktree to store agent files like issue descriptions.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Skill File Path</label>
                <input
                  type="text"
                  value={formData.agentSkillFile || ''}
                  onChange={e => setFormData({ ...formData, agentSkillFile: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-3 text-sm font-mono text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all placeholder:text-slate-600 dark:placeholder:text-slate-600"
                  placeholder=".opencode/skills/specflow-worktree-automation/SKILL.md"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">IntelliJ IDEA Home</label>
                <input
                  type="text"
                  value={formData.ideaHome || ''}
                  onChange={e => setFormData({ ...formData, ideaHome: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-3 text-sm font-mono text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all placeholder:text-slate-600 dark:placeholder:text-slate-600"
                  placeholder="Z:\idea-git"
                />
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Path to IntelliJ IDEA installation. If empty, IntelliJ option will be disabled.
                </p>
              </div>
            </div>

          </div>

          {/* Fixed Footer with Action Buttons */}
          <div className={`border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 px-6 py-4 flex justify-end gap-3 flex-shrink-0`}>
            <button
              type="button"
              onClick={() => {
                onClearLocalSession();
                onClose();
              }}
              className="mr-auto px-4 py-2 text-sm font-medium text-rose-600 dark:text-rose-300 hover:text-rose-700 dark:hover:text-rose-200 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-lg transition-colors min-h-[44px]"
            >
              <span className="sm:hidden">Clear</span>
              <span className="hidden sm:inline">Clear Local Session</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onReset();
                onClose();
              }}
              className="px-4 py-2 text-sm font-medium text-amber-600 dark:text-amber-300 hover:text-amber-700 dark:hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-lg transition-colors flex items-center gap-2 min-h-[44px]"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              <span className="sm:hidden">Settings</span>
              <span className="hidden sm:inline">Reset Defaults</span>
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors hidden lg:flex items-center min-h-[44px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg shadow-md shadow-indigo-900/20 flex items-center gap-2 transition-all min-h-[44px]"
            >
              <Save className="w-4 h-4" />
              Save
            </button>
          </div>

        </form>
      </div>

      {/* Confirmation dialog for unsaved changes */}
      <ConfirmDialog
        dialog={showConfirmClose ? {
          title: 'Unsaved Changes',
          message: 'You have unsaved changes in your settings. Are you sure you want to discard them?',
          confirmLabel: 'Discard Changes',
          cancelLabel: 'Keep Editing',
          tone: 'warning'
        } : null}
        onCancel={handleCancelClose}
        onConfirm={handleConfirmDiscard}
      />
    </div>
  );
};
