import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL;

function createMockRedis(): Redis {
  const mock = {
    incr: async () => 0,
    expire: async () => 1,
    decr: async () => 0,
    ping: async () => 'PONG',
    get: async () => null,
    set: async () => 'OK',
    del: async () => 0,
    on: () => mock,
    quit: async () => 'OK',
    disconnect: () => undefined,
    duplicate: () => mock,
  } as unknown as Redis;

  return mock;
}

// Shared Redis connection — BullMQ reuses this for all queues
export const redis = REDIS_URL
  ? new Redis(REDIS_URL, {
      maxRetriesPerRequest: null,   // Required by BullMQ
      enableReadyCheck: false,      // Required by BullMQ
      retryStrategy: (times: number) => {
        if (times > 10) {
          console.error('[Redis] Max reconnect attempts reached. Giving up.');
          return null;
        }
        const delay = Math.min(times * 500, 5000);
        console.warn(`[Redis] Reconnecting in ${delay}ms (attempt ${times})...`);
        return delay;
      },
    })
  : createMockRedis();

if (REDIS_URL) {
  redis.on('connect', () => {
    console.log('[Redis] Connected to Upstash Redis');
  });

  redis.on('error', (err: Error) => {
    console.error('[Redis] Connection error:', err.message);
  });

  redis.on('close', () => {
    console.warn('[Redis] Connection closed');
  });
}

// Ping to verify connection on startup
export async function verifyRedisConnection(): Promise<boolean> {
  if (!REDIS_URL) return true;
  try {
    const pong = await redis.ping();
    console.log('[Redis] Health check:', pong);
    return true;
  } catch (err) {
    console.error('[Redis] Health check failed:', err);
    return false;
  }
}
