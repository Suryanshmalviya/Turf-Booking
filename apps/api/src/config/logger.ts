import pino from 'pino';

export interface LoggerConfig {
  level: string;
  format: 'json' | 'pretty';
}

const SENSITIVE_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'password',
  'passwordHash',
  'currentPassword',
  'newPassword',
  'accessToken',
  'refreshToken',
  '*.password',
  '*.passwordHash',
  '*.accessToken',
  '*.refreshToken',
];

export function createLogger({ log, nodeEnv }: { log: LoggerConfig; nodeEnv: string }) {
  const transport =
    log.format === 'pretty'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined;

  return pino({
    level: log.level,
    redact: { paths: SENSITIVE_PATHS, censor: '[redacted]' },
    transport,
    base: { service: 'pickleball-api', env: nodeEnv },
    formatters: { level: label => ({ level: label }) },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

export type AppLogger = pino.Logger;

export function createChildLogger(logger: AppLogger, bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
