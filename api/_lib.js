// Shared helpers for the Kunnash API. Files that start with "_" are not routes on Vercel.
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);

export const NS = "kn:"; // multi-user data
export const ID = /^[A-Za-z0-9_\-.~:@+]{1,80}$/;
export const USERNAME = /^[a-z0-9_.]{3,24}$/;
export const SESSION_TTL = 60 * 60 * 24 * 180; // 180 days
export const MAX_ENTRIES = 5000; // per account: about 7 years of heavy use

// Limits that keep one person (or one script) from using up the shared free storage.
// Each can be raised in Vercel's environment variables once the project is on a paid plan.
const envInt = (name, fallback) => {
  const n = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
export const LIMITS = {
  opsPerDay: envInt("KUNNASH_OPS_PER_DAY", 6000), // changes one account can save per day (a full backup restore fits)
  signupsPerIpDay: envInt("KUNNASH_SIGNUPS_PER_IP_DAY", 20), // new accounts from one network per day
  signupsPerDay: envInt("KUNNASH_SIGNUPS_PER_DAY", 1000), // new accounts across the whole site per day
  totalEntries: envInt("KUNNASH_MAX_TOTAL_ENTRIES", 600000) // all entries of all accounts (about 150 MB)
};
export const TOTAL_KEY = "kn:stats:entries";

// ---------- storage ----------
function findStorage() {
  const e = process.env;
  if (e.KV_REST_API_URL && e.KV_REST_API_TOKEN) return [e.KV_REST_API_URL, e.KV_REST_API_TOKEN];
  if (e.UPSTASH_REDIS_REST_URL && e.UPSTASH_REDIS_REST_TOKEN) return [e.UPSTASH_REDIS_REST_URL, e.UPSTASH_REDIS_REST_TOKEN];
  for (const k of Object.keys(e)) {
    if (/READ_ONLY/.test(k)) continue;
    const m = k.match(/^(.*)_REST_API_URL$/) || k.match(/^(.*)_REDIS_REST_URL$/);
    if (!m) continue;
    const token = e[m[1] + "_REST_API_TOKEN"] || e[m[1] + "_REDIS_REST_TOKEN"];
    if (e[k] && token) return [e[k], token];
  }
  return ["", ""];
}
export function storage() {
  const [url, token] = findStorage();
  return url && token ? { url: url.replace(/\/+$/, ""), token } : null;
}
export async function redis(cfg, commands) {
  const r = await fetch(cfg.url + "/pipeline", {
    method: "POST",
    headers: { Authorization: "Bearer " + cfg.token, "Content-Type": "application/json" },
    body: JSON.stringify(commands)
  });
  if (!r.ok) throw new Error("Storage answered " + r.status);
  const out = await r.json();
  return out.map((x) => {
    if (x && x.error) throw new Error(x.error);
    return x ? x.result : null;
  });
}

// ---------- http ----------
export function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(body);
}
export function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return null; } }
  return null;
}
export const sha = (s) => createHash("sha256").update(String(s)).digest("hex");
export function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
}

// Counts events in a time window (by `by`, default 1); returns true while under the limit.
export async function allow(cfg, bucket, limit, windowSec, by = 1) {
  const key = NS + "rl:" + bucket;
  const [n, ttl] = await redis(cfg, [["INCRBY", key, by], ["TTL", key]]);
  if (Number(ttl) < 0) await redis(cfg, [["EXPIRE", key, windowSec]]);
  return Number(n) <= limit;
}
export async function peek(cfg, bucket) {
  const [n] = await redis(cfg, [["GET", NS + "rl:" + bucket]]);
  return Number(n) || 0;
}
export async function clear(cfg, bucket) { await redis(cfg, [["DEL", NS + "rl:" + bucket]]); }

// ---------- secrets ----------
export async function hashSecret(secret) {
  const salt = randomBytes(16);
  const key = await scrypt(String(secret), salt, 32, { N: 16384, r: 8, p: 1 });
  return "s1$" + salt.toString("base64") + "$" + key.toString("base64");
}
export async function verifySecret(secret, stored) {
  const [v, s, h] = String(stored || "").split("$");
  if (v !== "s1" || !s || !h) return false;
  const want = Buffer.from(h, "base64");
  const got = await scrypt(String(secret), Buffer.from(s, "base64"), want.length, { N: 16384, r: 8, p: 1 });
  return want.length === got.length && timingSafeEqual(want, got);
}
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function newRecoveryCode() {
  const bytes = randomBytes(16);
  let s = "";
  for (let i = 0; i < 16; i++) s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return s.match(/.{4}/g).join("-");
}
export const normCode = (c) => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export const newId = () => randomBytes(12).toString("base64url");

// ---------- sessions ----------
export async function createSession(cfg, userId) {
  const token = randomBytes(32).toString("base64url");
  const key = NS + "sess:" + sha(token);
  await redis(cfg, [
    ["SET", key, userId, "EX", SESSION_TTL],
    ["SADD", NS + "u:" + userId + ":sess", key],
    ["EXPIRE", NS + "u:" + userId + ":sess", SESSION_TTL]
  ]);
  return token;
}
export function bearer(req) {
  const h = String(req.headers.authorization || "");
  return h.startsWith("Bearer ") ? h.slice(7).trim() : "";
}
export async function sessionUser(cfg, req) {
  const token = bearer(req);
  if (!token || token.length > 200) return null;
  const [uid] = await redis(cfg, [["GET", NS + "sess:" + sha(token)]]);
  return uid || null;
}
export async function endAllSessions(cfg, userId) {
  const setKey = NS + "u:" + userId + ":sess";
  const [keys] = await redis(cfg, [["SMEMBERS", setKey]]);
  const cmds = (keys || []).map((k) => ["DEL", k]);
  cmds.push(["DEL", setKey]);
  await redis(cfg, cmds);
}

// The date (UTC) used to name daily counters, e.g. "20261015".
export const today = () => new Date().toISOString().slice(0, 10).replace(/-/g, "");

// ---------- entries ----------
export function cleanEntry(e) {
  if (!e || typeof e !== "object" || !ID.test(String(e.id || ""))) return null;
  const amount = Math.round(Number(e.amount) * 100) / 100;
  const date = String(e.date || "");
  if (!(amount > 0) || amount > 1e12 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const o = {
    id: String(e.id),
    type: e.type === "income" ? "income" : "expense",
    amount,
    date,
    note: String(e.note || "").slice(0, 80),
    created: Number(e.created) || Date.now(),
    updated: Number(e.updated) || Date.now()
  };
  if (e.category) o.category = String(e.category).slice(0, 80);
  if (e.salary) o.salary = true;
  if (/^\d{4}-\d{2}$/.test(String(e.forMonth || ""))) o.forMonth = String(e.forMonth);
  return o;
}
export function cleanSettings(s) {
  if (!s || typeof s !== "object") return null;
  const json = JSON.stringify(s);
  return json.length <= 60000 ? json : null;
}
