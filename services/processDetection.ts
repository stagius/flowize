import { AppSettings } from '../types';
import { runBridgeCommand } from './gitService';

export interface ProcessInfo {
  name: string;
  pid: number;
  platform: 'win32' | 'darwin' | 'linux';
}

async function getProcessesUnix(path: string, settings: AppSettings): Promise<ProcessInfo[]> {
  const platform = process.platform as 'darwin' | 'linux';
  
  try {
    const result = await runBridgeCommand(settings, `lsof +D "${path}" 2>/dev/null || true`);
    if (!result || typeof result !== 'object' || !result.stdout) {
      return [];
    }
    
    const lines = (result.stdout as string).split('\n').slice(1);
    const processes: ProcessInfo[] = [];
    const seen = new Set<string>();
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      const parts = trimmed.split(/\s+/);
      if (parts.length < 2) continue;
      
      const name = parts[0];
      const pid = parseInt(parts[1], 10);
      
      if (isNaN(pid) || pid <= 0) continue;
      
      const key = `${name}:${pid}`;
      if (seen.has(key)) continue;
      seen.add(key);
      
      processes.push({ name, pid, platform });
    }
    
    return processes;
  } catch {
    return [];
  }
}

async function getProcessesWindows(path: string, settings: AppSettings): Promise<ProcessInfo[]> {
  try {
    const result = await runBridgeCommand(settings, `handle.exe -accepteula "${path}" 2>nul || echo "HANDLE_NOT_FOUND"`);
    if (!result || typeof result !== 'object') {
      return [];
    }
    
    const stdout = result.stdout as string;
    if (!stdout || stdout.includes('HANDLE_NOT_FOUND') || stdout.includes('not recognized')) {
      return [];
    }
    
    const lines = stdout.split('\n');
    const processes: ProcessInfo[] = [];
    const seen = new Set<number>();
    const regex = /^(\S+)\s+pid:\s+(\d+)/i;
    
    for (const line of lines) {
      const match = line.match(regex);
      if (!match) continue;
      
      const name = match[1];
      const pid = parseInt(match[2], 10);
      
      if (isNaN(pid) || pid <= 0 || seen.has(pid)) continue;
      seen.add(pid);
      
      processes.push({ name, pid, platform: 'win32' });
    }
    
    return processes;
  } catch {
    return [];
  }
}

export async function getProcessesUsingPath(path: string, settings: AppSettings): Promise<ProcessInfo[]> {
  if (!settings?.agentEndpoint) {
    return [];
  }
  
  const normalizedPath = path.replace(/\\/g, '/');
  
  if (process.platform === 'win32') {
    return getProcessesWindows(normalizedPath, settings);
  }
  
  return getProcessesUnix(normalizedPath, settings);
}

export function formatProcessList(processes: ProcessInfo[]): string {
  if (processes.length === 0) {
    return '';
  }
  
  const platformLabel = processes[0]?.platform === 'win32' ? 'Windows' : 
                        processes[0]?.platform === 'darwin' ? 'macOS' : 'Linux';
  
  const lines = processes.map(p => `  - ${p.name} (PID: ${p.pid})`);
  
  return `\n\nProcesses using this directory (${platformLabel}):\n${lines.join('\n')}`;
}
