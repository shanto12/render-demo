import { createClient } from "redis";

let client = null;

export async function initCache() {
  if (!process.env.REDIS_URL) return null;
  client = createClient({ url: process.env.REDIS_URL });
  client.on("error", (e) => console.error("redis error:", e.message));
  await client.connect();
  return client;
}

export function cacheAvailable() {
  return !!client && client.isReady;
}

export async function cacheGet(key) {
  if (!cacheAvailable()) return null;
  return client.get(key);
}

export async function cacheSet(key, value, ttlSeconds) {
  if (!cacheAvailable()) return;
  await client.set(key, value, { EX: ttlSeconds });
}

export async function cacheDel(key) {
  if (!cacheAvailable()) return;
  await client.del(key);
}
