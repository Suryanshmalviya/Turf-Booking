import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { app } from '../src/app';
import { config } from '../src/config';
import { connectDatabase, disconnectDatabase } from '../src/config/database';

beforeAll(async () => {
  await connectDatabase();
});

afterAll(async () => {
  await disconnectDatabase();
});

describe('health and diagnostics', () => {
  it('GET /api/v1/health reports service status', async () => {
    const response = await request(app).get('/api/v1/health').expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('status');
    expect(response.body.data).toHaveProperty('timestamp');
    expect(response.body.data).toHaveProperty('uptime');
    expect(response.body.data).toHaveProperty('environment', config.nodeEnv);
  });

  it('echoes a correlation id header and reuses an inbound one', async () => {
    const generated = await request(app).get('/api/v1/health').expect(200);
    expect(generated.headers['x-request-id']).toBeTruthy();
    expect(generated.body.requestId).toBe(generated.headers['x-request-id']);

    const supplied = await request(app)
      .get('/api/v1/health')
      .set('X-Request-ID', 'trace-abc-123')
      .expect(200);
    expect(supplied.headers['x-request-id']).toBe('trace-abc-123');
  });

  it('GET /api/v1/health/detailed adds process diagnostics', async () => {
    const response = await request(app).get('/api/v1/health/detailed').expect(200);

    expect(response.body.data).toHaveProperty('cpu');
    expect(response.body.data).toHaveProperty('nodeVersion');
    expect(response.body.data).toHaveProperty('database');
  });
});

describe('API response envelope', () => {
  it('wraps unmatched routes in the standard error envelope', async () => {
    const response = await request(app).get('/api/v1/does-not-exist').expect(404);

    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Route GET /api/v1/does-not-exist not found',
      },
      requestId: response.headers['x-request-id'],
    });
  });

  it('sets hardened security headers and hides the framework banner', async () => {
    const response = await request(app).get('/api/v1/health').expect(200);

    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-request-id']).toBeTruthy();
  });
});

describe('versioned module surface', () => {
  it('serves the documented module prefixes', async () => {
    expect(config.apiPrefix).toBe('/api/v1');

    await request(app).get('/api/v1/courts').expect(200);
    await request(app).get('/api/v1/reviews').expect(200);
    await request(app).get('/api/v1/health').expect(200);
  });

  it('returns 401 rather than 404 for protected modules', async () => {
    await request(app).get('/api/v1/users/me').expect(401);
    await request(app).get('/api/v1/notifications').expect(401);
    await request(app).get('/api/v1/admin/database').expect(401);
  });

  it('keeps /venues as an alias of /courts', async () => {
    const courts = await request(app).get('/api/v1/courts').expect(200);
    const venues = await request(app).get('/api/v1/venues').expect(200);

    expect(venues.body.success).toBe(true);
    expect(venues.body.data).toHaveProperty('items');
    expect(courts.body.data).toHaveProperty('items');
  });
});
