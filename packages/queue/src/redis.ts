import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL;

if (!REDIS_URL) {
  throw new Error('[Redis] REDIS_URL env var is missing. Set it in Railway / .env');
}

// Shared Redis connection — BullMQ reuses this for all queues
export const redis = new Redis(REDIS_URL, {
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
});

redis.on('connect', () => {
  console.log('[Redis] Connected to Upstash Redis');
});

redis.on('error', (err: Error) => {
  console.error('[Redis] Connection error:', err.message);
});

redis.on('close', () => {
  console.warn('[Redis] Connection closed');
});

// Ping to verify connection on startup
export async function verifyRedisConnection(): Promise<boolean> {
  try {
    const pong = await redis.ping();
    console.log('[Redis] Health check:', pong);
    return true;
  } catch (err) {
    console.error('[Redis] Health check failed:', err);
    return false;
  }
}
