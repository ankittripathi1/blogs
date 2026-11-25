#TITLE: Why My Redis Rate Limiter Has an In-Memory Backup
#DESCRIPTION: When Redis goes down, a rate limiter has to fail open or fail closed. The insurance strategy adds a third option: fall back to a local in-memory store.
#DATE: 2026-11-25
#TAGS: rate-limiting, redis, nodejs, typescript

Today I was working on one of my projects with Claude, and it wrote a Redis-backed rate limiter for my API gateway. While reading the code, I noticed something odd. Next to the Redis store, it also made an in-memory store.

My first thought was that this was extra code nobody needed. So I checked why it was there.

It turns out this is a known pattern. It's called the **insurance strategy**, or an insurance limiter. The [rate-limiter-flexible wiki](https://github.com/animir/node-rate-limiter-flexible/wiki/Insurance-Strategy) has a good write-up of it.

## The problem: Redis goes down

If your rate limiter keeps its counters in Redis and Redis stops answering, you usually have two choices. Both are bad.

- **Fail closed.** Return an error and block every request. A problem in your cache just took down your whole API.
- **Fail open.** Ignore the error and let every request through. Now you have no rate limiting at all, and that can happen right when traffic spikes.

## The fix: a local backup store

The insurance strategy gives you a third choice. You keep a small in-memory store inside the app. If a Redis call fails or times out, you catch the error and count the request in a local `Map` instead.

The limiter keeps working. It's just less exact for a while.

### The in-memory store

This is a fixed window counter. Each key (for example, a client IP) gets a count and a time when the window resets.

```ts
interface RateLimitStore {
  increment(key: string, windowSec: number): Promise<{ count: number; resetAt: number }>;
}

class MemoryStore implements RateLimitStore {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  async increment(key: string, windowSec: number) {
    const now = Date.now();
    const entry = this.buckets.get(key);
    if (!entry || entry.resetAt <= now) {
      const fresh = { count: 1, resetAt: now + windowSec * 1000 };
      this.buckets.set(key, fresh);
      return fresh;
    }
    entry.count += 1;
    return entry;
  }
}
```

### The Redis store with the fallback

This is the part that makes it "insurance". The Redis store holds a `MemoryStore` and uses it when Redis throws.

```ts
class RedisStore implements RateLimitStore {
  private fallback = new MemoryStore();

  constructor(private client: Redis) {}

  async increment(key: string, windowSec: number) {
    try {
      const results = await this.client.multi().incr(key).pttl(key).exec();
      const count = Number(results?.[0]?.[1] ?? 1);
      let ttlMs = Number(results?.[1]?.[1] ?? -1);
      if (ttlMs < 0) {
        await this.client.expire(key, windowSec);
        ttlMs = windowSec * 1000;
      }
      return { count, resetAt: Date.now() + ttlMs };
    } catch {
      return this.fallback.increment(key, windowSec);
    }
  }
}
```

One detail matters a lot here: the Redis client must fail fast. In my setup the client uses `commandTimeout: 300` and `enableOfflineQueue: false`. Without these, a dead Redis makes every request wait before the fallback runs. Then the backup doesn't help much.

## The tradeoff

The backup is not free. Each app instance has its own `Map`, so the counts are not shared. If you run three gateway instances with a limit of 300 requests per minute, one client could get up to 900 while Redis is down.

For me that's fine. A limit that is a bit loose for a few minutes is much better than no limit, or no API. If you need a tighter limit, you can give the backup store a lower limit, for example the normal limit divided by the number of instances.

## Takeaway

When code looks redundant, check why it's there before you delete it. This "extra" store was a small choice, made on purpose, that keeps the rate limiter working when Redis doesn't.
