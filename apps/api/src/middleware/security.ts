import type { IncomingMessage, ServerResponse } from 'node:http';

import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors, { type CorsOptions } from 'cors';
import express, { type Express, type Request, type RequestHandler } from 'express';
import helmet from 'helmet';

import { config, isProduction } from '../config';

/**
 * Security headers. The API serves JSON only, so the CSP is locked down to
 * `default-src 'none'` while still allowing the frontend origin to embed media.
 */
export function securityHeaders(): RequestHandler {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'none'"],
        'frame-ancestors': ["'none'"],
        'base-uri': ["'none'"],
        'form-action': ["'none'"],
        'img-src': ["'self'", 'data:', 'https:'],
        'connect-src': ["'self'", config.frontendUrl],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'no-referrer' },
    hsts: isProduction ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  });
}

export function corsOptions(): CorsOptions {
  return {
    origin: config.frontendUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-ID',
      config.auth.csrfHeaderName,
      config.auth.idempotencyHeaderName,
    ],
    exposedHeaders: ['X-Request-ID', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
    maxAge: 600,
  };
}

/** JSON body parsing with a small hard limit plus raw-body capture for webhooks. */
export function bodyParsers(): RequestHandler[] {
  const captureRawBody = (
    request: IncomingMessage,
    _response: ServerResponse,
    buffer: Buffer
  ): void => {
    (request as Request).rawBody = Buffer.from(buffer);
  };

  return [
    express.json({ limit: config.bodyLimit, verify: captureRawBody }),
    express.urlencoded({ extended: true, limit: config.bodyLimit }),
    cookieParser(),
  ];
}

export function compressionMiddleware(): RequestHandler {
  return compression({ threshold: 1024 });
}

export function applySecurity(app: Express): void {
  app.disable('x-powered-by');
  app.set('json spaces', 0);
  app.set('etag', 'strong');
  app.use(securityHeaders());
  app.use(cors(corsOptions()));
  app.use(compressionMiddleware());
}
