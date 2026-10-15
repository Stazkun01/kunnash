// Each person's own notebook. Requires a signed-in session (Authorization: Bearer <token>).
//   GET  /api/data                         -> { settings, entries }
//   POST /api/data { ops: [] }              -> put / del / settings / wipe
//   POST /api/data { action: "import_legacy", passcode } -> moves the old single-passcode notebook into this account
import { timingSafeEqual } from "node:crypto";
import {
  NS, LEGACY, ID, MAX_ENTRIES, storage, redis, send, readBody, sha, allow, peek,
  sessionUser, cleanEntry, cleanSettings
} from "./_lib.js";

const MAX_OPS = 200;
const same = (a, b) => { const x = Buffer.from(sha(a)), y = Buffer.from(sha(b)); return timingSafeEqual(x, y); };

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

    if (body.action === "import_legacy") {
      const pass = process.env.KUNNASH_PASSCODE || "";
      const bucket = "lg:" + uid;
      if ((await peek(cfg, bucket)) >= 8) return send(res, 429, { error: "too_many" });
      if (pass.length < 6 || !same(String(body.passcode || ""), pass)) {
        await allow(cfg, bucket, 8, 3600);
        return send(res, 401, { error: "wrong_passcode" });
      }
      const [settings, flat] = await redis(cfg, [["GET", LEGACY + "settings"], ["HGETALL", LEGACY + "entries"]]);
      const cmds = [];
      let n = 0;
      for (let i = 0; i + 1 < (flat || []).length; i += 2) { cmds.push(["HSET", ENT, flat[i], flat[i + 1]]); n++; }
      if (settings) cmds.push(["SET", SET, settings]);
      cmds.push(["DEL", LEGACY + "entries"], ["DEL", LEGACY + "settings"]);
      await redis(cfg, cmds);
      return send(res, 200, { ok: true, imported: n });
    }

    const ops = Array.isArray(body.ops) ? body.ops : null;
    if (!ops || ops.length > MAX_OPS) return send(res, 400, { error: "bad_request" });
    if (!(await allow(cfg, "w:" + uid, 600, 60))) return send(res, 429, { error: "too_many" });
    const commands = [];
    let puts = 0;
    for (const op of ops) {
      if (op && op.op === "put") {
        const e = cleanEntry(op.entry);
        if (e) { commands.push(["HSET", ENT, e.id, JSON.stringify(e)]); puts++; }
      } else if (op && op.op === "del" && ID.test(String(op.id || ""))) {
        commands.push(["HDEL", ENT, String(op.id)]);
      } else if (op && op.op === "settings") {
        const s = cleanSettings(op.settings);
        if (s) commands.push(["SET", SET, s]);
      } else if (op && op.op === "wipe") {
        commands.push(["DEL", ENT]);
      }
    }
    if (puts) {
      const [count] = await redis(cfg, [["HLEN", ENT]]);
      if (Number(count) + puts > MAX_ENTRIES) return send(res, 413, { error: "too_many_entries" });
    }
    if (commands.length) await redis(cfg, commands);
    return send(res, 200, { ok: true, applied: commands.length });
  } catch (err) {
    console.error("kunnash data", err);
    return send(res, 502, { error: "storage_error" });
  }
}
