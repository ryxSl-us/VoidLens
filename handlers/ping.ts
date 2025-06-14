/**
 * Pings external services to check their availability.
 * VoidLens Ping Service
 */

import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { PingTarget, PingResult } from '../types/monitor';
import https from 'https';
import http from 'http';
import dotenv from 'dotenv';
import { log } from './logger';

// Load environment variables
dotenv.config();

const execAsync = promisify(exec);

export class PingHandler {
  private targets: PingTarget[] = [];
  private results: Record<string, PingResult[]> = {};
  private configPath: string;
  private storagePath: string;
  private maxResultsPerTarget: number = 1000;
  private intervalId: any = null;
  private pingInterval: number = 60000; // Default to 1 minute
  private lastNotifiedStatus: Record<string, boolean> = {}; // Track last notified status to avoid spam
  private slowResponseThreshold: number = 1000; // 1 second, configurable in .env
  
  private discordWebhookUrl: string | undefined;

  constructor(configPath: string = path.join(process.cwd(), 'storage', 'ping.json'), 
              storagePath: string = path.join(process.cwd(), 'cache', 'ping-results')) {
    this.configPath = configPath;
    this.storagePath = storagePath;
    
    // Get Discord webhook URL from environment variables
    this.discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;
    log(`Discord webhook URL: ${this.discordWebhookUrl ? 'Configured' : 'Not configured'}, ${this.discordWebhookUrl}`, 'info');
    
    // Get slow response threshold from environment variables (default to 1000ms)
    const threshold = process.env.SLOW_RESPONSE_THRESHOLD;
    if (threshold && !isNaN(parseInt(threshold))) {
      this.slowResponseThreshold = parseInt(threshold);
    }
  }

  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.storagePath, { recursive: true });
      await this.loadConfig();
      await this.loadStoredResults();
    } catch (error) {
      console.error('Error initializing ping handler:', error);
    }
  }

  async loadConfig(): Promise<void> {
    try {
      const configData = await fs.readFile(this.configPath, 'utf-8');
      const config = JSON.parse(configData);
      this.targets = config.targets || [];
      this.pingInterval = config.interval || 60000;
    } catch (error) {
      console.error('Error loading ping configuration:', error);
      this.targets = [];
    }
  }

  async loadStoredResults(): Promise<void> {
    try {
      const files = await fs.readdir(this.storagePath);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const targetId = file.replace('.json', '');
          const filePath = path.join(this.storagePath, file);
          const data = await fs.readFile(filePath, 'utf-8');
          this.results[targetId] = JSON.parse(data);
          
          // Initialize notification status based on last known result
          if (this.results[targetId] && this.results[targetId].length > 0) {
            const lastResult = this.results[targetId][this.results[targetId].length - 1];
            this.lastNotifiedStatus[targetId] = lastResult.isUp;
          }
        }
      }
    } catch (error) {
      console.error('Error loading stored ping results:', error);
    }
  }

  startMonitoring(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    // Immediately ping all targets
    this.pingAllTargets();

    // Set up regular interval for pinging
    this.intervalId = setInterval(() => {
      this.pingAllTargets();
    }, this.pingInterval);
  }

  stopMonitoring(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async pingAllTargets(): Promise<void> {
    for (const target of this.targets) {
      const result = await this.pingTarget(target);
      this.addResult(target.id, result);
      await this.saveResults(target.id);
      
      // Check if we need to send notifications
      await this.checkForNotifications(target, result);
    }
  }

  private async pingTarget(target: PingTarget): Promise<PingResult> {
    const startTime = Date.now();
    let isUp = false;
    let responseTime = 0;
    let statusCode = 0;
    let serverInfo = '';
    let error = '';

    try {
      if (target.method === 'icmp') {
        const result = await this.icmpPing(target.url);
        isUp = result.isUp;
        responseTime = result.responseTime;
      } else {
        const result = await this.httpPing(target);
        isUp = result.isUp;
        responseTime = result.responseTime;
        statusCode = result.statusCode;
        serverInfo = result.serverInfo;
      }
    } catch (err: any) {
      error = err.message;
    }

    return {
      timestamp: Date.now(),
      isUp,
      responseTime,
      statusCode,
      serverInfo,
      error
    };
  }

  private async checkForNotifications(target: PingTarget, result: PingResult): Promise<void> {
    if (!this.discordWebhookUrl) {
      return; // No webhook configured
    }
    
    // Get previous status (undefined if first time checking)
    const isFirstCheck = this.lastNotifiedStatus[target.id] === undefined;
    const previousStatus = isFirstCheck ? undefined : this.lastNotifiedStatus[target.id];
    
    // If this is the first check, send an initial status notification
    if (isFirstCheck) {
      await this.sendDiscordNotification({
        type: result.isUp ? 'initial-up' : 'initial-down',
        target,
        result
      });
      this.lastNotifiedStatus[target.id] = result.isUp;
    }
    // If status changed from up to down, send a down notification
    else if (previousStatus && !result.isUp) {
      await this.sendDiscordNotification({
        type: 'down',
        target,
        result
      });
      this.lastNotifiedStatus[target.id] = false;
    } 
    // If status changed from down to up, send a recovery notification
    else if (previousStatus === false && result.isUp) {
      await this.sendDiscordNotification({
        type: 'up',
        target,
        result
      });
      this.lastNotifiedStatus[target.id] = true;
    }
    // If service is up but response time is slow, send a slow notification
    else if (result.isUp && result.responseTime > this.slowResponseThreshold) {
      await this.sendDiscordNotification({
        type: 'slow',
        target,
        result
      });
      // Don't update last notified status here as it's still technically up
    }
  }

  private async sendDiscordNotification({ type, target, result }: { 
    type: 'up' | 'down' | 'slow' | 'initial-up' | 'initial-down', 
    target: PingTarget, 
    result: PingResult 
  }): Promise<void> {
    if (!this.discordWebhookUrl) return;

    let color: number;
    let title: string;
    let description: string;

    switch (type) {
      case 'initial-up':
        color = 0x00AAFF; // Blue
        title = `🔵 Monitoring Started: ${target.name}`;
        description = `Started monitoring ${target.url}.\nInitial status: UP\nResponse time: ${result.responseTime}ms`;
        break;
      case 'initial-down':
        color = 0xAA00FF; // Purple
        title = `🟣 Monitoring Started: ${target.name}`;
        description = `Started monitoring ${target.url}.\nInitial status: DOWN\nError: ${result.error || 'No response'}\nStatus code: ${result.statusCode || 'N/A'}`;
        break;
      case 'down':
        color = 0xFF0000; // Red
        title = `🔴 Service Down: ${target.name}`;
        description = `The service at ${target.url} is down.\nError: ${result.error || 'No response'}\nStatus code: ${result.statusCode || 'N/A'}`;
        break;
      case 'up':
        color = 0x00FF00; // Green
        title = `🟢 Service Recovered: ${target.name}`;
        description = `The service at ${target.url} is back up.\nResponse time: ${result.responseTime}ms`;
        break;
      case 'slow':
        color = 0xFFAA00; // Orange
        title = `🟠 Slow Response: ${target.name}`;
        description = `The service at ${target.url} is responding slowly.\nResponse time: ${result.responseTime}ms\nThreshold: ${this.slowResponseThreshold}ms`;
        break;
    }

    const embed = {
      embeds: [{
        title,
        description,
        color,
        timestamp: new Date().toISOString(),
        fields: [
          {
            name: 'Service',
            value: target.name,
            inline: true
          },
          {
            name: 'URL',
            value: target.url,
            inline: true
          },
          {
            name: 'Response Time',
            value: `${result.responseTime}ms`,
            inline: true
          }
        ],
        footer: {
          text: 'Uptime Monitor'
        }
      }]
    };

    try {
      const webhookRes = await fetch(this.discordWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(embed)
      });
      
      if (!webhookRes.ok) {
        console.error(`Failed to send Discord notification: ${webhookRes.status} ${webhookRes.statusText}`);
      }
    } catch (error) {
      console.error('Error sending Discord notification:', error);
    }
  }

  private async icmpPing(host: string): Promise<{ isUp: boolean, responseTime: number }> {
    try {
      // Extract hostname from URL if needed
      const hostname = host.replace(/^https?:\/\//, '').split('/')[0];
      
      // Different ping command options based on platform
      const pingOptions = process.platform === 'win32' ? '-n 1 -w 1000' : '-c 1 -W 1';
      
      const startTime = Date.now();
      const { stdout } = await execAsync(`ping ${pingOptions} ${hostname}`);
      const responseTime = Date.now() - startTime;
      
      // Check if ping was successful
      const isUp = stdout.includes('TTL=') || stdout.includes('ttl=') || 
                  stdout.includes('time=') || stdout.includes('time<');
      
      return { isUp, responseTime };
    } catch (error) {
      return { isUp: false, responseTime: 0 };
    }
  }

  private httpPing(target: PingTarget): Promise<{ 
    isUp: boolean, 
    responseTime: number,
    statusCode: number,
    serverInfo: string
  }> {
    return new Promise((resolve) => {
      const url = new URL(target.url);
      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: target.method || 'GET',
        timeout: target.timeout || 5000,
        headers: target.headers || {}
      };

      const startTime = Date.now();
      const request = (url.protocol === 'https:' ? https : http).request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          const responseTime = Date.now() - startTime;
          const serverInfo = res.headers['server'] || '';
          
          resolve({
            isUp: res.statusCode !== undefined && res.statusCode < 400,
            responseTime,
            statusCode: res.statusCode || 0,
            serverInfo: serverInfo as string
          });
        });
      });
      
      request.on('error', (error) => {
        resolve({
          isUp: false,
          responseTime: Date.now() - startTime,
          statusCode: 0,
          serverInfo: ''
        });
      });
      
      request.on('timeout', () => {
        request.destroy();
        resolve({
          isUp: false,
          responseTime: options.timeout as number,
          statusCode: 0,
          serverInfo: ''
        });
      });
      
      request.end();
    });
  }

  // Rest of the methods remain the same...
  private addResult(targetId: string, result: PingResult): void {
    if (!this.results[targetId]) {
      this.results[targetId] = [];
    }
    
    this.results[targetId].push(result);
    
    // Trim array if it gets too large
    if (this.results[targetId].length > this.maxResultsPerTarget) {
      this.results[targetId] = this.results[targetId].slice(-this.maxResultsPerTarget);
    }
  }

  private async saveResults(targetId: string): Promise<void> {
    try {
      const filePath = path.join(this.storagePath, `${targetId}.json`);
      await fs.writeFile(filePath, JSON.stringify(this.results[targetId]), 'utf-8');
    } catch (error) {
      console.error(`Error saving ping results for ${targetId}:`, error);
    }
  }

  getTargets(): PingTarget[] {
    return [...this.targets];
  }

  getResultsForTarget(targetId: string): PingResult[] {
    return this.results[targetId] || [];
  }

  getLatestResultForTarget(targetId: string): PingResult | null {
    const targetResults = this.results[targetId];
    if (!targetResults || targetResults.length === 0) {
      return null;
    }
    return targetResults[targetResults.length - 1];
  }

  calculateUptimePercentage(targetId: string, days: number = 1): number {
    const targetResults = this.results[targetId];
    if (!targetResults || targetResults.length === 0) {
      return 0;
    }
    
    const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
    const recentResults = targetResults.filter(result => result.timestamp >= cutoffTime);
    
    if (recentResults.length === 0) {
      return 0;
    }
    
    const upCount = recentResults.filter(result => result.isUp).length;
    return (upCount / recentResults.length) * 100;
  }

  getAverageResponseTime(targetId: string, days: number = 1): number {
    const targetResults = this.results[targetId];
    if (!targetResults || targetResults.length === 0) {
      return 0;
    }
    
    const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
    const recentResults = targetResults.filter(result => result.timestamp >= cutoffTime && result.isUp);
    
    if (recentResults.length === 0) {
      return 0;
    }
    
    const totalResponseTime = recentResults.reduce((sum, result) => sum + result.responseTime, 0);
    return totalResponseTime / recentResults.length;
  }
}