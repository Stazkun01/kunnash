// Each person's own notebook. Requires a signed-in session (Authorization: Bearer <token>).
//   GET  /api/data                         -> { settings, entries }
//   POST /api/data { ops: [] }              -> put / del / settings / wipe
import {
  NS, ID, MAX_ENTRIES, LIMITS, TOTAL_KEY, today, storage, redis, send, readBody, allow,
  sessionUser, cleanEntry, cleanSettings
} from "./_lib.js";

const MAX_OPS = 200;

// Keeps a running count of all entries on the site, never below zero.
async function bumpTotal(cfg, delta) {
  const [n] = await redis(cfg, [["INCRBY", TOTAL_KEY, delta]]);
  if (Number(n) < 0) await redis(cfg, [["SET", TOTAL_KEY, 0]]);
}

export default async function handler(req, res) {
  const cfg = storage();
  if (!cfg) return send(res, 503, { error: "no_storage" });
  try {
    const uid = await sessionUser(cfg, req);
    if (!uid) return send(res, 401, { error: "signed_out" });
    const SET = NS + "u:" + uid + ":settings", ENT = NS + "u:" + uid + ":entries";

    if (req.method === "GET") {
      const [settings, flat] = await redis(cfg, [["GET", SET], ["HGETALL", ENT]]);
      const entries = [];
      for (let i = 0; i + 1 < (flat || []).length; i += 2) {
        try { entries.push(JSON.parse(flat[i + 1])); } catch { /* skip a damaged row */ }
      }
      return send(res, 200, { settings: settings ? JSON.parse(settings) : null, entries });
    }

    if (req.method !== "POST") { res.setHeader("Allow", "GET, POST"); return send(res, 405, { error: "method_not_allowed" }); }
    const body = readBody(req) || {};

    const ops = Array.isArray(body.ops) ? body.ops : null;
    if (!ops || ops.length > MAX_OPS) return send(res, 400, { error: "bad_request" });
    if (!(await allow(cfg, "w:" + uid, 600, 60))) return send(res, 429, { error: "too_many" });
    if (!(await allow(cfg, "wd:" + uid + ":" + today(), LIMITS.opsPerDay, 86400, Math.max(ops.length, 1)))) {
      return send(res, 429, { error: "daily_limit" });
    }

    // Each command remembers what it was, so the reply can tell how many entries were added or removed.
    const commands = [], kinds = [], putIds = [];
    for (const op of ops) {
      if (op && op.op === "put") {
        const e = cleanEntry(op.entry);
        if (e) { commands.push(["HSET", ENT, e.id, JSON.stringify(e)]); kinds.push("add"); putIds.push(e.id); }
      } else if (op && op.op === "del" && ID.test(String(op.id || ""))) {
        commands.push(["HDEL", ENT, String(op.id)]); kinds.push("remove");
      } else if (op && op.op === "settings") {
        const s = cleanSettings(op.settings);
        if (s) { commands.push(["SET", SET, s]); kinds.push("other"); }
      } else if (op && op.op === "wipe") {
        commands.push(["HLEN", ENT]); kinds.push("remove"); // how many the wipe takes away
        commands.push(["DEL", ENT]); kinds.push("other");
      }
    }

    if (putIds.length) {
      const [count, total] = await redis(cfg, [["HLEN", ENT], ["GET", TOTAL_KEY]]);
      const mine = Number(count) || 0, all = Math.max(0, Number(total) || 0);
      if (mine + putIds.length > MAX_ENTRIES || all + putIds.length > LIMITS.totalEntries) {
        // Near a limit: edits to existing entries are always fine, so count only the new ones.
        const ids = [...new Set(putIds)];
        const found = await redis(cfg, ids.map((id) => ["HEXISTS", ENT, id]));
        const fresh = ids.filter((_, i) => !Number(found[i])).length;
        if (fresh && mine + fresh > MAX_ENTRIES) return send(res, 413, { error: "too_many_entries" });
        if (fresh && all + fresh > LIMITS.totalEntries) return send(res, 507, { error: "storage_full" });
      }
    }

    if (commands.length) {
      const out = await redis(cfg, commands);
      let delta = 0;
      out.forEach((n, i) => { if (kinds[i] === "add") delta += Number(n) || 0; else if (kinds[i] === "remove") delta -= Number(n) || 0; });
      if (delta) await bumpTotal(cfg, delta);
    }
    return send(res, 200, { ok: true, applied: commands.length });
  } catch (err) {
    console.error("kunnash data", err);
    return send(res, 502, { error: "storage_error" });
  }
}
