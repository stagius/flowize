import React, { useState, useEffect, useCallback } from 'react';
import { AppSettings } from '../types';
import { AgentSessionState, fetchAllAgentSessions } from '../services/agentService';
import { Radio, RefreshCw, Server, CheckCircle2, XCircle, AlertTriangle, Clock, Loader2, Ban } from 'lucide-react';

interface Props {
    settings?: AppSettings;
    bridgeHealth?: {
        status: 'checking' | 'healthy' | 'unhealthy';
        endpoint?: string;
    };
}

const formatRelativeTime = (timestampMs: number | undefined): string => {
    if (!timestampMs) return '—';
    const diffMs = Date.now() - timestampMs;
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
};

const formatAbsoluteTime = (timestampMs: number | undefined): string => {
    if (!timestampMs) return '—';
    const d = new Date(timestampMs);
    return d.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
};

type SessionStatus = 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted' | 'unknown';

const deriveStatus = (session: AgentSessionState): SessionStatus => {
    if (session.status === 'running' && session.done !== true) return 'running';
    if (session.status === 'completed') return 'completed';
    if (session.status === 'cancelled' || session.exitCode === 130) return 'cancelled';
    if (session.status === 'interrupted') return 'interrupted';
    if (session.status === 'failed') return 'failed';
    if (session.done === true) {
        if (session.success === true && (session.exitCode ?? 0) === 0) return 'completed';
        return 'failed';
    }
    if (session.status) return session.status as SessionStatus;
    return 'unknown';
};

interface StatusBadgeProps {
    status: SessionStatus;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
    const configs: Record<SessionStatus, { label: string; classes: string; Icon: React.ElementType; animate?: boolean }> = {
        running: {
            label: 'Running',
            classes: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20',
            Icon: Loader2,
            animate: true
        },
        completed: {
            label: 'Completed',
            classes: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
            Icon: CheckCircle2
        },
        failed: {
            label: 'Failed',
            classes: 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20',
            Icon: XCircle
        },
        cancelled: {
            label: 'Cancelled',
            classes: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
            Icon: Ban
        },
        interrupted: {
            label: 'Interrupted',
            classes: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
            Icon: AlertTriangle
        },
        unknown: {
            label: 'Unknown',
            classes: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
            Icon: Clock
        }
    };

    const config = configs[status] ?? configs.unknown;
    const { label, classes, Icon, animate } = config;

    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold ${classes}`}>
            <Icon className={`w-3 h-3 flex-shrink-0 ${animate ? 'animate-spin' : ''}`} aria-hidden="true" />
            {label}
        </span>
    );
};

export const RemoteSessionsPage: React.FC<Props> = ({ settings, bridgeHealth }) => {
    const [sessions, setSessions] = useState<AgentSessionState[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastRefreshed, setLastRefreshed] = useState<number | null>(null);

    const hostReady = bridgeHealth?.status === 'healthy';

    const loadSessions = useCallback(async () => {
        if (!settings?.agentEndpoint?.trim()) {
            setError('No bridge endpoint configured. Set one in Settings.');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const data = await fetchAllAgentSessions(settings);
            // Sort: running first, then by startedAt descending
            const sorted = [...data].sort((a, b) => {
                const aRunning = deriveStatus(a) === 'running' ? 1 : 0;
                const bRunning = deriveStatus(b) === 'running' ? 1 : 0;
                if (aRunning !== bRunning) return bRunning - aRunning;
                return (b.startedAt ?? 0) - (a.startedAt ?? 0);
            });
            setSessions(sorted);
            setLastRefreshed(Date.now());
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    }, [settings]);

    // Initial load when bridge becomes healthy
    useEffect(() => {
        if (hostReady) {
            loadSessions();
        }
    }, [hostReady, loadSessions]);

    // Auto-refresh every 5s when there are running sessions
    useEffect(() => {
        const hasRunning = sessions.some(s => deriveStatus(s) === 'running');
        if (!hasRunning || !hostReady) return;

        const timer = window.setInterval(() => {
            loadSessions();
        }, 5000);

        return () => window.clearInterval(timer);
    }, [sessions, hostReady, loadSessions]);

    const runningSessions = sessions.filter(s => deriveStatus(s) === 'running');
    const completedSessions = sessions.filter(s => deriveStatus(s) === 'completed');
    const failedSessions = sessions.filter(s => ['failed', 'interrupted'].includes(deriveStatus(s)));

    return (
        <div className="space-y-6">
            {/* Header card */}
            <div className="bg-slate-100 dark:bg-slate-900/50 backdrop-blur-sm rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/80 flex items-center justify-between gap-3 flex-wrap">
                    <div>
                        <h3 className="font-semibold text-slate-900 dark:text-slate-200 flex items-center gap-2">
                            <Radio
                                className={`w-4 h-4 ${hostReady ? 'text-emerald-600 dark:text-emerald-400' : bridgeHealth?.status === 'checking' ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}
                                aria-hidden="true"
                            />
                            Active Remote Sessions
                        </h3>
                        <p className="hidden md:inline text-xs text-slate-600 dark:text-slate-400 mt-1">
                            Monitor all agent sessions running on the remote host.
                        </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        {/* Summary counters */}
                        {sessions.length > 0 && (
                            <>
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-indigo-500/20 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-xs font-semibold">
                                    <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
                                    {runningSessions.length} running
                                </span>
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
                                    <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                                    {completedSessions.length} done
                                </span>
                                {failedSessions.length > 0 && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300 text-xs font-semibold">
                                        <XCircle className="w-3 h-3" aria-hidden="true" />
                                        {failedSessions.length} failed
                                    </span>
                                )}
                            </>
                        )}

                        {/* Host status badge */}
                        <div className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${hostReady
                            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : bridgeHealth?.status === 'checking'
                                ? 'border-yellow-500/20 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300'
                                : 'border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300'
                            }`}>
                            <Server className="w-3 h-3 inline mr-1" aria-hidden="true" />
                            {hostReady ? 'Host ready' : bridgeHealth?.status === 'checking' ? 'Checking...' : 'Host offline'}
                        </div>

                        {/* Refresh button */}
                        <button
                            type="button"
                            onClick={() => void loadSessions()}
                            disabled={loading || !hostReady}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            aria-label="Refresh sessions"
                        >
                            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                            Refresh
                        </button>
                    </div>
                </div>

                {/* Last refreshed */}
                {lastRefreshed && (
                    <div className="px-4 py-2 bg-slate-50 dark:bg-slate-900/30 border-b border-slate-200 dark:border-slate-800">
                        <span className="text-[11px] text-slate-500 dark:text-slate-500">
                            Last updated {formatRelativeTime(lastRefreshed)}
                            {runningSessions.length > 0 && <span className="ml-2 text-indigo-500 dark:text-indigo-400">· Auto-refreshing every 5s</span>}
                        </span>
                    </div>
                )}

                {/* Error state */}
                {error && (
                    <div className="m-4 p-4 rounded-xl border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300 text-sm">
                        <div className="flex items-center gap-2 font-semibold mb-1">
                            <XCircle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                            Failed to load sessions
                        </div>
                        <p className="text-xs text-red-600 dark:text-red-400 font-mono break-all">{error}</p>
                    </div>
                )}

                {/* Bridge offline state */}
                {!hostReady && !loading && !error && (
                    <div className="m-4 p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/40 text-center">
                        <Server className="w-8 h-8 mx-auto mb-3 text-slate-400 dark:text-slate-600" aria-hidden="true" />
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Host unavailable</p>
                        <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                            {bridgeHealth?.status === 'checking'
                                ? 'Connecting to host…'
                                : 'Start the local bridge to view remote sessions.'}
                        </p>
                    </div>
                )}

                {/* Loading skeleton */}
                {loading && sessions.length === 0 && (
                    <div className="p-4 space-y-3">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-12 rounded-xl bg-slate-200/60 dark:bg-slate-800/60 animate-pulse" />
                        ))}
                    </div>
                )}

                {/* Empty state */}
                {!loading && !error && hostReady && sessions.length === 0 && (
                    <div className="m-4 p-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/40 text-center">
                        <Radio className="w-8 h-8 mx-auto mb-3 text-slate-400 dark:text-slate-600" aria-hidden="true" />
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No sessions found</p>
                        <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                            Sessions will appear here once agent runs are started from the Worktrees step.
                        </p>
                    </div>
                )}

                {/* Sessions table */}
                {sessions.length > 0 && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm" role="table" aria-label="Remote sessions">
                            <thead>
                                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                                    <th scope="col" className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-500 whitespace-nowrap">Session ID</th>
                                    <th scope="col" className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-500 whitespace-nowrap">Branch / Title</th>
                                    <th scope="col" className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-500 whitespace-nowrap">Status</th>
                                    <th scope="col" className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-500 whitespace-nowrap">Started</th>
                                    <th scope="col" className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-500 whitespace-nowrap">Last Update</th>
                                    <th scope="col" className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-500 whitespace-nowrap hidden md:table-cell">PID</th>
                                    <th scope="col" className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-500 whitespace-nowrap hidden lg:table-cell">Exit Code</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                                {sessions.map((session, idx) => {
                                    const status = deriveStatus(session);
                                    const sessionId = session.sessionId || session.jobId || `session-${idx}`;
                                    const shortId = sessionId.length > 16 ? `${sessionId.slice(0, 8)}…${sessionId.slice(-6)}` : sessionId;

                                    return (
                                        <tr
                                            key={sessionId}
                                            className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                                        >
                                            {/* Session ID */}
                                            <td className="px-4 py-3 align-top">
                                                <span
                                                    className="font-mono text-xs text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700"
                                                    title={sessionId}
                                                >
                                                    {shortId}
                                                </span>
                                            </td>

                                            {/* Branch / Title */}
                                            <td className="px-4 py-3 align-top max-w-[240px]">
                                                {session.branch && (
                                                    <div className="text-xs font-mono text-indigo-700 dark:text-indigo-300 truncate" title={session.branch}>
                                                        {session.branch}
                                                    </div>
                                                )}
                                                {session.title && (
                                                    <div className="text-xs text-slate-600 dark:text-slate-400 truncate mt-0.5" title={session.title}>
                                                        {session.title}
                                                    </div>
                                                )}
                                                {!session.branch && !session.title && (
                                                    <span className="text-xs text-slate-400 dark:text-slate-600">—</span>
                                                )}
                                            </td>

                                            {/* Status */}
                                            <td className="px-4 py-3 align-top whitespace-nowrap">
                                                <StatusBadge status={status} />
                                            </td>

                                            {/* Started */}
                                            <td className="px-4 py-3 align-top whitespace-nowrap">
                                                <span
                                                    className="text-xs text-slate-700 dark:text-slate-300"
                                                    title={formatAbsoluteTime(session.startedAt)}
                                                >
                                                    {formatRelativeTime(session.startedAt)}
                                                </span>
                                            </td>

                                            {/* Last Update */}
                                            <td className="px-4 py-3 align-top whitespace-nowrap">
                                                <span
                                                    className="text-xs text-slate-600 dark:text-slate-400"
                                                    title={formatAbsoluteTime(session.updatedAt)}
                                                >
                                                    {formatRelativeTime(session.updatedAt)}
                                                </span>
                                            </td>

                                            {/* PID */}
                                            <td className="px-4 py-3 align-top whitespace-nowrap hidden md:table-cell">
                                                <span className="text-xs font-mono text-slate-600 dark:text-slate-400">
                                                    {typeof session.pid === 'number' ? session.pid : '—'}
                                                </span>
                                            </td>

                                            {/* Exit Code */}
                                            <td className="px-4 py-3 align-top whitespace-nowrap hidden lg:table-cell">
                                                <span className={`text-xs font-mono ${typeof session.exitCode === 'number'
                                                    ? session.exitCode === 0
                                                        ? 'text-emerald-600 dark:text-emerald-400'
                                                        : 'text-red-600 dark:text-red-400'
                                                    : 'text-slate-400 dark:text-slate-600'
                                                    }`}>
                                                    {typeof session.exitCode === 'number' ? session.exitCode : 'running'}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};
