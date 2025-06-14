import os from 'os';
import { HistoryHandler } from './handlers/history';
import { NetworkHandler } from './handlers/network';
import { PingHandler } from './handlers/ping';
import { SystemStatus, UptimeStats, PingTarget, PingResult } from './types/monitor';


/**
 * Connects all handlers and manages the uptime monitoring process.
 * Collects system status, network statistics, and ping results.
 * Provides methods to retrieve current status, historical data, and uptime statistics.
 */

export class UptimeMonitor {
  private historyHandler: HistoryHandler;
  private networkHandler: NetworkHandler;
  private pingHandler: PingHandler;
  private pollInterval: number = 1000;
  private intervalId: any = null;

  constructor(cacheDir: string = './cache') {
    this.historyHandler = new HistoryHandler(cacheDir);
    this.networkHandler = new NetworkHandler();
    this.pingHandler = new PingHandler();
    
    // Connect the ping handler to the history handler
    this.historyHandler.setPingHandler(this.pingHandler);
  }

  async initialize(): Promise<void> {
    await this.historyHandler.initialize();
    await this.networkHandler.updateNetworkStats();
    await this.pingHandler.initialize();
    
    this.startMonitoring();
    this.pingHandler.startMonitoring();
  }

  startMonitoring(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    
    this.collectSystemStatus();
    
    this.intervalId = setInterval(() => {
      this.collectSystemStatus();
    }, this.pollInterval);
  }

  stopMonitoring(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    this.pingHandler.stopMonitoring();
  }

  private async collectSystemStatus(): Promise<void> {
    const networkStats = await this.networkHandler.updateNetworkStats();
    
    const cpus = os.cpus();
    const cpuUsage = cpus.reduce((acc, cpu) => {
      const total = Object.values(cpu.times).reduce((t, time) => t + time, 0);
      const idle = cpu.times.idle;
      return acc + ((total - idle) / total);
    }, 0) / cpus.length;

    const status: SystemStatus = {
      timestamp: Date.now(),
      uptime: os.uptime(),
      loadAverage: os.loadavg(),
      freeMemory: os.freemem(),
      totalMemory: os.totalmem(),
      cpuUsage: cpuUsage,
      networkIn: networkStats.in,
      networkOut: networkStats.out
    };

    await this.historyHandler.addStatus(status);
  }

  getCurrentStatus(): SystemStatus {
    const status = this.historyHandler.getLatestStatus();
    if (!status) {
      this.collectSystemStatus();
      return this.getCurrentStatus();
    }
    return status;
  }

  async getHistory(days: number = 7, count: number = 50, includePing: boolean = false): Promise<any> {
    return this.historyHandler.getHistory(days, count, includePing);
  }

  async getUptimeStats(days: number = 30): Promise<UptimeStats> {
    const history = await this.getHistory(days);
    
    if (!Array.isArray(history) || history.length === 0) {
      return {
        uptimePercentage: 0,
        averageLoad: 0,
        averageMemoryUsage: 0,
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString()
      };
    }

    const avgLoad = history.reduce((sum, status) => sum + status.loadAverage[0], 0) / history.length;
    const avgMemUsage = history.reduce((sum, status) => {
      const usedMem = status.totalMemory - status.freeMemory;
      return sum + (usedMem / status.totalMemory);
    }, 0) / history.length;

    const startDate = new Date(history[0].timestamp).toISOString();
    const endDate = new Date(history[history.length - 1].timestamp).toISOString();
    
    const uptimePercentage = 100; 
    
    return {
      uptimePercentage,
      averageLoad: avgLoad,
      averageMemoryUsage: avgMemUsage * 100,
      startDate,
      endDate
    };
  }

  // Ping related methods
  getPingTargets(): PingTarget[] {
    return this.pingHandler.getTargets();
  }

  getPingResults(targetId: string): PingResult[] {
    return this.pingHandler.getResultsForTarget(targetId);
  }

  getLatestPingResult(targetId: string): PingResult | null {
    return this.pingHandler.getLatestResultForTarget(targetId);
  }

  getPingUptimePercentage(targetId: string, days: number = 1): number {
    return this.pingHandler.calculateUptimePercentage(targetId, days);
  }

  getPingAverageResponseTime(targetId: string, days: number = 1): number {
    return this.pingHandler.getAverageResponseTime(targetId, days);
  }
}