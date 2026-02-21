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
  const normalizedPath = path.replace(/\//g, '\\');
  const escapedPath = normalizedPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  
  console.log(`[ProcessDetection] Checking processes for path: ${normalizedPath}`);
  
  const processes: ProcessInfo[] = [];
  const seen = new Set<number>();
  
  const wmiCommand = `powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like \\"*${escapedPath}*\\" -or ($_.ExecutablePath -like \\"*${escapedPath}*\\") } | Select-Object Name,ProcessId | ConvertTo-Json -Compress"`;
  
  console.log(`[ProcessDetection] Running: ${wmiCommand}`);
  
  try {
    const result = await runBridgeCommand(settings, wmiCommand);
    console.log(`[ProcessDetection] Result:`, result);
    if (result && typeof result === 'object' && result.stdout) {
      let stdout = (result.stdout as string).trim();
      console.log(`[ProcessDetection] stdout: ${stdout}`);
      if (stdout && stdout !== 'null' && stdout !== '[]') {
        let entries: Array<{ Name: string; ProcessId: number }> = [];
        
        try {
          if (stdout.startsWith('[')) {
            entries = JSON.parse(stdout);
          } else if (stdout.startsWith('{')) {
            entries = [JSON.parse(stdout)];
          }
        } catch {}
        
        for (const entry of entries) {
          const pid = Number(entry.ProcessId);
          if (isNaN(pid) || pid <= 0 || seen.has(pid)) continue;
          seen.add(pid);
          processes.push({ name: entry.Name, pid, platform: 'win32' });
        }
      }
    }
  } catch (e) {
    console.warn(`[ProcessDetection] Error:`, e);
  }
  
  console.log(`[ProcessDetection] Found ${processes.length} processes`);
  return processes;
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
    return '\n\nUnable to identify blocking process. Check: VS Code, terminals, node processes, or file explorers using this directory.';
  }
  
  const platformLabel = processes[0]?.platform === 'win32' ? 'Windows' : 
                        processes[0]?.platform === 'darwin' ? 'macOS' : 'Linux';
  
  const lines = processes.map(p => `  - ${p.name} (PID: ${p.pid})`);
  
  return `\n\nProcesses using this directory (${platformLabel}):\n${lines.join('\n')}`;
}
