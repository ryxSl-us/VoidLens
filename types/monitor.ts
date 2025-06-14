export interface SystemStatus {
  timestamp: number;
  uptime: number;
  loadAverage: number[];
  freeMemory: number;
  totalMemory: number;
  cpuUsage: number;
  networkIn: number;
  networkOut: number;
}

export interface UptimeStats {
  uptimePercentage: number;
  averageLoad: number;
  averageMemoryUsage: number;
  startDate: string;
  endDate: string;
}

export interface NetworkStats {
  in: number;
  out: number;
}

export interface PingTarget {
  id: string;
  name: string;
  url: string;
  method: 'GET' | 'POST' | 'HEAD' | 'icmp';
  timeout?: number;
  headers?: Record<string, string>;
  expectedStatus?: number;
}

export interface PingResult {
  timestamp: number;
  isUp: boolean;
  responseTime: number;
  statusCode: number;
  serverInfo: string;
  error: string;
}