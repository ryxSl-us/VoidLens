import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface NetworkStats {
  in: number;
  out: number;
}

export class NetworkHandler {
  private networkStats: NetworkStats = { in: 0, out: 0 };
  private lastNetworkBytes: NetworkStats = { in: 0, out: 0 };
  private lastNetworkCheck: number = 0;
  private platform: string = process.platform;

  async updateNetworkStats(): Promise<NetworkStats> {
    try {
      if (this.platform === 'darwin') {
        await this.updateMacNetworkStats();
      } else if (this.platform === 'linux') {
        await this.updateLinuxNetworkStats();
      } else {
        console.warn(`Platform ${this.platform} not supported for network stats`);
      }
    } catch (error) {
      console.error('Error getting network stats:', error);
    }
    
    return this.networkStats;
  }

  private async updateMacNetworkStats(): Promise<void> {
    const { stdout } = await execAsync('netstat -ib');
    
    const lines = stdout.split('\n');
    let totalIn = 0;
    let totalOut = 0;
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const parts = line.split(/\s+/);
      if (parts.length >= 10 && !isNaN(parseInt(parts[7])) && !isNaN(parseInt(parts[10]))) {
        if (parts[0] !== 'lo0') {
          totalIn += parseInt(parts[7]);
          totalOut += parseInt(parts[10]);
        }
      }
    }
    
    this.calculateNetworkRates(totalIn, totalOut);
  }

  private async updateLinuxNetworkStats(): Promise<void> {
    const { stdout } = await execAsync('cat /proc/net/dev');
    
    const lines = stdout.split('\n');
    let totalIn = 0;
    let totalOut = 0;
    
    for (let i = 2; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const parts = line.split(/\s+/);
      if (parts.length >= 10) {
        const iface = parts[0].replace(':', '');
        if (iface !== 'lo') {
          totalIn += parseInt(parts[1]);
          totalOut += parseInt(parts[9]);
        }
      }
    }
    
    this.calculateNetworkRates(totalIn, totalOut);
  }

  private calculateNetworkRates(totalIn: number, totalOut: number): void {
    const now = Date.now();
    const timeDiff = (now - this.lastNetworkCheck) / 1000;
    
    if (this.lastNetworkCheck > 0 && timeDiff > 0) {
      this.networkStats.in = Math.max(0, (totalIn - this.lastNetworkBytes.in) / timeDiff);
      this.networkStats.out = Math.max(0, (totalOut - this.lastNetworkBytes.out) / timeDiff);
    }
    
    this.lastNetworkBytes.in = totalIn;
    this.lastNetworkBytes.out = totalOut;
    this.lastNetworkCheck = now;
  }
}