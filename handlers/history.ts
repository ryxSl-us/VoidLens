import fs from 'fs/promises';
import path from 'path';
import { SystemStatus } from '../types/monitor';

/**
 * Handles caching and retrieval of system status history.
 * Monitors system uptime, CPU usage, memory usage, and network statistics.
 */
export class HistoryHandler {
  private cacheDir: string;
  private currentRunNumber: number = 1;
  private entriesInCurrentFile: number = 0;
  private maxEntriesPerFile: number = 700;
  private statusHistory: SystemStatus[] = [];
  private pingHandler: any = null; // We'll initialize this later

  constructor(cacheDir: string = './cache') {
    this.cacheDir = cacheDir;
  }

  setPingHandler(pingHandler: any): void {
    this.pingHandler = pingHandler;
  }

  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
    } catch (error) {
      console.error('Error creating cache directory:', error);
    }

    await this.findLatestRunNumber();
  }

  private async findLatestRunNumber(): Promise<void> {
    try {
      const files = await fs.readdir(this.cacheDir);
      const runFiles = files.filter(file => file.startsWith('run-')).map(file => {
        const match = file.match(/run-(\d+)\.json/);
        return match ? parseInt(match[1]) : 0;
      });

      if (runFiles.length > 0) {
        this.currentRunNumber = Math.max(...runFiles);
        
        const latestFile = path.join(this.cacheDir, `run-${this.currentRunNumber}.json`);
        const data = await fs.readFile(latestFile, 'utf-8');
        const entries = JSON.parse(data);
        
        this.statusHistory = entries;
        this.entriesInCurrentFile = entries.length;
        
        if (this.entriesInCurrentFile >= this.maxEntriesPerFile) {
          this.currentRunNumber++;
          this.entriesInCurrentFile = 0;
        }
      }
    } catch (error) {
      this.currentRunNumber = 1;
      this.entriesInCurrentFile = 0;
    }
  }

  async addStatus(status: SystemStatus): Promise<void> {
    this.statusHistory.push(status);
    this.entriesInCurrentFile++;
    
    if (this.entriesInCurrentFile >= this.maxEntriesPerFile) {
      await this.saveCache();
      this.statusHistory = [status]; // Keep only the latest entry
      this.entriesInCurrentFile = 1;
      this.currentRunNumber++;
    } else {
      await this.saveCache();
    }
  }

  private async saveCache(): Promise<void> {
    try {
      const filename = path.join(this.cacheDir, `run-${this.currentRunNumber}.json`);
      await fs.writeFile(
        filename, 
        JSON.stringify(this.statusHistory),
        'utf-8'
      );
    } catch (error) {
      console.error('Error saving cache:', error);
    }
  }

  getLatestStatus(): SystemStatus | null {
    if (this.statusHistory.length === 0) {
      return null;
    }
    return this.statusHistory[this.statusHistory.length - 1];
  }

  async getHistory(days: number = 7, count: number = 50, includePing: boolean = false): Promise<any> {
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    
    let allHistory = await this.loadAllHistory();
    allHistory = allHistory.filter(status => status.timestamp >= cutoff);
    
    // Apply count limit
    allHistory = allHistory.slice(-count);
    
    // If ping data is requested and the ping handler is available
    if (includePing && this.pingHandler) {
      const pingTargets = this.pingHandler.getTargets();
      const pingData: Record<string, any> = {};
      
      // Get the latest ping result for each target
      for (const target of pingTargets) {
        const pingResults = this.pingHandler.getResultsForTarget(target.id);
        
        // Filter ping results by the same time period
        const filteredResults = pingResults.filter((result: any) => 
          result.timestamp >= cutoff
        ).slice(-count);
        
        pingData[target.id] = {
          name: target.name,
          results: filteredResults,
          uptimePercentage: this.pingHandler.calculateUptimePercentage(target.id, days),
          averageResponseTime: this.pingHandler.getAverageResponseTime(target.id, days)
        };
      }
      
      // Return both system history and ping data
      return {
        systemHistory: allHistory,
        pingData: pingData
      };
    }
    
    // Return just system history
    return allHistory;
  }

  private async getLastNEntries(count: number): Promise<SystemStatus[]> {
    const allHistory = await this.loadAllHistory();
    return allHistory.slice(-count);
  }

  async loadAllHistory(): Promise<SystemStatus[]> {
    try {
      const files = await fs.readdir(this.cacheDir);
      const runFiles = files.filter(file => file.startsWith('run-'))
                         .sort((a, b) => {
                           const numA = parseInt(a.match(/run-(\d+)\.json/)?.[1] || '0');
                           const numB = parseInt(b.match(/run-(\d+)\.json/)?.[1] || '0');
                           return numA - numB;
                         });
      
      let allHistory: SystemStatus[] = [];
      
      for (const file of runFiles) {
        const filePath = path.join(this.cacheDir, file);
        const data = await fs.readFile(filePath, 'utf-8');
        const entries = JSON.parse(data);
        allHistory = allHistory.concat(entries);
      }
      
      return allHistory;
    } catch (error) {
      console.error('Error loading history:', error);
      return this.statusHistory;
    }
  }
}