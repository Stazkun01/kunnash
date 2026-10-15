// Kunnash storage API (Vercel serverless function).
// Saves your notebook in Upstash Redis, protected by the passcode in KUNNASH_PASSCODE.
//
//   GET  /api/data            -> { settings, entries }
//   POST /api/data { ops: [] } -> applies changes: put / del / settings / wipe
//
// Env vars (Vercel adds the first two when you connect Upstash for Redis from the Storage tab):
//   KV_REST_API_URL + KV_REST_API_TOKEN   (or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)
//   KUNNASH_PASSCODE                      (you choose it, at least 6 characters)
import { createHash, timingSafeEqual } from "node:crypto";

const PREFIX = "kunnash:";
const ID = /^[A-Za-z0-9_\-.~:@+]{1,80}$/;
const MAX_OPS = 200;
const MAX_FAILS = 10;

// Finds the Upstash REST keys whatever prefix Vercel gave them (KV_, STORAGE_, UPSTASH_REDIS_, ...).
function findStorage() {
  const e = process.env;
  if (e.KV_REST_API_URL && e.KV_REST_API_TOKEN) return [e.KV_REST_API_URL, e.KV_REST_API_TOKEN];
  if (e.UPSTASH_REDIS_REST_URL && e.UPSTASH_REDIS_REST_TOKEN) return [e.UPSTASH_REDIS_REST_URL, e.UPSTASH_REDIS_REST_TOKEN];
  for (const k of Object.keys(e)) {
    const m = k.match(/^(.*)_REST_API_URL$/) || k.match(/^(.*)_REDIS_REST_URL$/);
    if (!m) continue;
    const token = e[m[1] + "_REST_API_TOKEN"] || e[m[1] + "_REDIS_REST_TOKEN"];
    if (e[k] && token) return [e[k], token];
  }
  return ["", ""];
}

const env = () => {
  const [url, token] = findStorage();
  return { url: url.replace(/\/+$/, ""), token, pass: process.env.KUNNASH_PASSCODE || "" };
};

async function redis(cfg, commands) {
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

const digest = (s) => createHash("sha256").update(String(s)).digest();
const samePass = (a, b) => timingSafeEqual(digest(a), digest(b));

function cleanEntry(e) {
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

function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return null; } }
  return null;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  const cfg = env();
  if (!cfg.url || !cfg.token) return res.status(503).json({ error: "no_storage" });
  if (cfg.pass.length < 6) return res.status(503).json({ error: "no_passcode" });

  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  const failKey = PREFIX + "fail:" + digest(ip).toString("hex").slice(0, 32);

  try {
    const [fails] = await redis(cfg, [["GET", failKey]]);
    if (Number(fails) >= MAX_FAILS) return res.status(429).json({ error: "too_many_tries" });

    if (!samePass(req.headers["x-kunnash-key"] || "", cfg.pass)) {
      await redis(cfg, [["INCR", failKey], ["EXPIRE", failKey, 900]]);
      return res.status(401).json({ error: "locked" });
    }

    if (req.method === "GET") {
      const [settings, flat] = await redis(cfg, [["GET", PREFIX + "settings"], ["HGETALL", PREFIX + "entries"]]);
      const entries = [];
      for (let i = 0; i + 1 < (flat || []).length; i += 2) {
        try { entries.push(JSON.parse(flat[i + 1])); } catch { /* skip a damaged row */ }
      }
      return res.status(200).json({ settings: settings ? JSON.parse(settings) : null, entries });
    }

    if (req.method === "POST") {
      const body = readBody(req);
      const ops = body && Array.isArray(body.ops) ? body.ops : null;
      if (!ops || ops.length > MAX_OPS) return res.status(400).json({ error: "bad_request" });
      const commands = [];
      for (const op of ops) {
        if (op && op.op === "put") {
          const e = cleanEntry(op.entry);
          if (e) commands.push(["HSET", PREFIX + "entries", e.id, JSON.stringify(e)]);
        } else if (op && op.op === "del" && ID.test(String(op.id || ""))) {
          commands.push(["HDEL", PREFIX + "entries", String(op.id)]);
        } else if (op && op.op === "settings" && op.settings && typeof op.settings === "object") {
          const s = JSON.stringify(op.settings);
          if (s.length <= 60000) commands.push(["SET", PREFIX + "settings", s]);
        } else if (op && op.op === "wipe") {
          commands.push(["DEL", PREFIX + "entries"]);
        }
      }
      if (commands.length) await redis(cfg, commands);
      return res.status(200).json({ ok: true, applied: commands.length });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "method_not_allowed" });
  } catch (err) {
    console.error("kunnash api", err);
    return res.status(502).json({ error: "storage_error" });
  }
}
