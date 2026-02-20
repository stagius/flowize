import { AppSettings } from '../types';

/**
 * Process information returned by the detection service
 */
export interface ProcessInfo {
    pid: number;
    name: string;
    path?: string;
}

/**
 * Get processes using a specific path
 * @param path - The path to check for processes
 * @param settings - Application settings
 * @returns Array of processes using the path
 */
export async function getProcessesUsingPath(
    path: string,
    settings: AppSettings
): Promise<ProcessInfo[]> {
    // This is a placeholder implementation
    // In a real implementation, this would call a system API or command
    // to detect processes using the given path
    console.log(`Checking processes using path: ${path}`);
    
    try {
        // For Windows, you could use 'handle.exe' or PowerShell
        // For Unix, you could use 'lsof'
        // This is a stub that returns an empty array
        return [];
    } catch (error) {
        console.error('Error detecting processes:', error);
        return [];
    }
}

/**
 * Format a list of processes into a readable string
 * @param processes - Array of process information
 * @returns Formatted string describing the processes
 */
export function formatProcessList(processes: ProcessInfo[]): string {
    if (!processes || processes.length === 0) {
        return '';
    }

    const processLines = processes.map(p => 
        `- ${p.name} (PID: ${p.pid})${p.path ? ` at ${p.path}` : ''}`
    );

    return `\n\nBlocking processes:\n${processLines.join('\n')}`;
}
