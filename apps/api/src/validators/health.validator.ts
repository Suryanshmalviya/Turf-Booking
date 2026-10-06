import { z } from 'zod';

import { isDatabaseConnected } from '../config/database';

export const healthCheckQuerySchema = z.object({
  query: z.object({
    detailed: z.coerce.boolean().optional().default(false),
  }),
});

export type HealthCheckQuery = z.infer<typeof healthCheckQuerySchema>['query'];

export interface HealthReport {
  status: 'ok' | 'degraded';
  timestamp: string;
  uptime: number;
  environment: string;
  version: string;
  memory: { used: number; total: number; unit: 'MB' };
  database?: { connected: boolean; readyState: number };
  cpu?: NodeJS.CpuUsage;
  nodeVersion?: string;
  platform?: string;
}

export function buildHealthReport(detailed: boolean): HealthReport {
  const memoryUsage = process.memoryUsage();
  const report: HealthReport = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env['NODE_ENV'] ?? 'development',
    version: process.env['npm_package_version'] ?? '1.0.0',
    memory: {
      used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      unit: 'MB',
    },
  };

  const connected = isDatabaseConnected();
  report.database = { connected, readyState: connected ? 1 : 0 };
  if (!connected) report.status = 'degraded';

  if (detailed) {
    report.cpu = process.cpuUsage();
    report.nodeVersion = process.version;
    report.platform = process.platform;
  }

  return report;
}
