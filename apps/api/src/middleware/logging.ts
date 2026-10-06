import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { config, logger } from '../config';

const NOISY_PATHS = new Set(['/health', '/health/detailed']);

const levelForStatus = (status: number): 'debug' | 'info' | 'warn' | 'error' => {
  if (status >= 500) return 'error';
  if (status >= 400) return 'warn';
  if (status >= 300) return 'info';
  return 'debug';
};

/**
 * Structured access logging. Emits one line per request with latency, status and
 * the authenticated subject, and never logs credentials (see logger redaction).
 */
export function requestLogger(): RequestHandler {
  return (request: Request, response: Response, next: NextFunction): void => {
    request.startedAt = Date.now();
    const startedAt = request.startedAt;

    response.on('finish', () => {
      const basePath = request.baseUrl || request.path;
      const route = `${request.baseUrl}${request.route?.path ?? request.path}`;
      const durationMs = Date.now() - startedAt;
      const level = levelForStatus(response.statusCode);

      logger[level](
        {
          requestId: request.requestId,
          method: request.method,
          route,
          path: basePath,
          status: response.statusCode,
          durationMs,
          ip: request.ip,
          userId: request.user?.sub,
          userRole: request.user?.role,
          ...(NOISY_PATHS.has(request.path) ? {} : {}),
        },
        'request completed'
      );
    });

    response.on('close', () => {
      if (!response.writableEnded) {
        logger.warn(
          { requestId: request.requestId, method: request.method, path: request.originalUrl },
          'request aborted before completion'
        );
      }
    });

    next();
  };
}

export function logStartup(): void {
  logger.info(
    {
      port: config.port,
      env: config.nodeEnv,
      apiPrefix: config.apiPrefix,
      frontendUrl: config.frontendUrl,
    },
    'API server started'
  );
}