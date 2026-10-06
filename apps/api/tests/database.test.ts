import mongoose from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  connectDatabase,
  disconnectDatabase,
  isDatabaseConnected,
  registerShutdownHandlers,
} from '../src/config/database';

describe('database connection management', () => {
  beforeEach(async () => {
    await disconnectDatabase();
    vi.restoreAllMocks();
  });

  it('connects with the configured URI and pool safeguards', async () => {
    const connect = vi.spyOn(mongoose, 'connect').mockResolvedValue(mongoose);

    await connectDatabase('mongodb://localhost:27017/pickleball_booking');

    expect(connect).toHaveBeenCalledWith(
      'mongodb://localhost:27017/pickleball_booking',
      expect.objectContaining({
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      })
    );
    await disconnectDatabase();
  });

  it('is idempotent: a second connect is a no-op', async () => {
    const connect = vi.spyOn(mongoose, 'connect').mockResolvedValue(mongoose);

    await connectDatabase();
    await connectDatabase();

    expect(connect).toHaveBeenCalledOnce();
    await disconnectDatabase();
  });

  it('propagates connection failures', async () => {
    vi.spyOn(mongoose, 'connect').mockRejectedValue(new Error('connection refused'));

    await expect(connectDatabase()).rejects.toThrow('connection refused');
  });

  it('reports readiness from the driver connection state', () => {
    expect(isDatabaseConnected()).toBe(false);
    vi.spyOn(mongoose.connection, 'readyState', 'get').mockReturnValue(1);
    expect(isDatabaseConnected()).toBe(true);
  });

  it('registers shutdown handlers only once', () => {
    const on = vi.spyOn(process, 'on');
    registerShutdownHandlers();
    const countAfterFirst = on.mock.calls.length;
    registerShutdownHandlers();

    expect(on.mock.calls.length).toBe(countAfterFirst);
    on.mockRestore();
  });
});
