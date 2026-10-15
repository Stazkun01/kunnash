// Accounts: username + password, with a one-time recovery code instead of email.
//   POST /api/auth { action: "signup" | "login" | "recover" | "password" | "logout" | "delete" | "me", ... }
import {
  NS, USERNAME, storage, redis, send, readBody, sha, clientIp, allow, peek, clear,
  hashSecret, verifySecret, newRecoveryCode, normCode, newId,
  createSession, sessionUser, bearer, endAllSessions, cleanSettings
} from "./_lib.js";

const userKey = (name) => NS + "user:" + name;
const normName = (n) => String(n || "").trim().toLowerCase().replace(/^@/, "");
const okPassword = (p) => typeof p === "string" && p.length >= 8 && p.length <= 200;

async function loadUser(cfg, name) {
  const [raw] = await redis(cfg, [["GET", userKey(name)]]);
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return send(res, 405, { error: "method_not_allowed" }); }
  const cfg = storage();
  if (!cfg) return send(res, 503, { error: "no_storage" });
  const body = readBody(req) || {};
  const ip = sha(clientIp(req)).slice(0, 24);

  try {
    switch (body.action) {
      case "signup": {
        const name = normName(body.username);
        if (!USERNAME.test(name)) return send(res, 400, { error: "bad_username" });
        if (!okPassword(body.password)) return send(res, 400, { error: "weak_password" });
        if (!(await allow(cfg, "su:" + ip, 8, 3600))) return send(res, 429, { error: "too_many" });
        const id = newId(), recovery = newRecoveryCode();
        const record = { id, pw: await hashSecret(body.password), rc: await hashSecret(normCode(recovery)), created: Date.now() };
        const [ok] = await redis(cfg, [["SET", userKey(name), JSON.stringify(record), "NX"]]);
        if (ok !== "OK") return send(res, 409, { error: "taken" });
        const cmds = [["SET", NS + "uid:" + id, name], ["INCR", NS + "stats:users"]];
        const s = cleanSettings(body.settings);
        if (s) cmds.push(["SET", NS + "u:" + id + ":settings", s]);
        await redis(cfg, cmds);
        const token = await createSession(cfg, id);
        return send(res, 200, { token, user: { name }, recovery });
      }

      case "login": {
        const name = normName(body.username);
        const bucket = "li:" + ip + ":" + sha(name).slice(0, 16);
        if ((await peek(cfg, bucket)) >= 10 || !(await allow(cfg, "lip:" + ip, 60, 900))) return send(res, 429, { error: "too_many" });
        const user = USERNAME.test(name) ? await loadUser(cfg, name) : null;
        if (!user || !(await verifySecret(String(body.password || ""), user.pw))) {
          await allow(cfg, bucket, 10, 900);
          return send(res, 401, { error: "wrong_login" });
        }
        await clear(cfg, bucket);
        const token = await createSession(cfg, user.id);
        return send(res, 200, { token, user: { name } });
      }

      case "recover": {
        const name = normName(body.username);
        const bucket = "rc:" + ip + ":" + sha(name).slice(0, 16);
        if ((await peek(cfg, bucket)) >= 8) return send(res, 429, { error: "too_many" });
        if (!okPassword(body.password)) return send(res, 400, { error: "weak_password" });
        const user = USERNAME.test(name) ? await loadUser(cfg, name) : null;
        if (!user || !(await verifySecret(normCode(body.code), user.rc))) {
          await allow(cfg, bucket, 8, 3600);
          return send(res, 401, { error: "wrong_code" });
        }
        const recovery = newRecoveryCode();
        user.pw = await hashSecret(body.password);
        user.rc = await hashSecret(normCode(recovery));
        await redis(cfg, [["SET", userKey(name), JSON.stringify(user)]]);
        await endAllSessions(cfg, user.id);
        await clear(cfg, bucket);
        const token = await createSession(cfg, user.id);
        return send(res, 200, { token, user: { name }, recovery });
      }

      case "me":
      case "password":
      case "logout":
      case "delete": {
        const uid = await sessionUser(cfg, req);
        if (!uid) return send(res, 401, { error: "signed_out" });
        const [name] = await redis(cfg, [["GET", NS + "uid:" + uid]]);
        if (!name) return send(res, 401, { error: "signed_out" });

        if (body.action === "me") {
          const [count] = await redis(cfg, [["HLEN", NS + "u:" + uid + ":entries"]]);
          return send(res, 200, { user: { name, entries: Number(count) || 0 } });
        }
        if (body.action === "logout") {
          const key = NS + "sess:" + sha(bearer(req));
          await redis(cfg, [["DEL", key], ["SREM", NS + "u:" + uid + ":sess", key]]);
          return send(res, 200, { ok: true });
        }

        const user = await loadUser(cfg, name);
        const bucket = "pw:" + uid;
        if ((await peek(cfg, bucket)) >= 8) return send(res, 429, { error: "too_many" });
        if (!user || !(await verifySecret(String(body.password || ""), user.pw))) {
          await allow(cfg, bucket, 8, 900);
          return send(res, 401, { error: "wrong_password" });
        }
        await clear(cfg, bucket);

        if (body.action === "password") {
          if (!okPassword(body.newPassword)) return send(res, 400, { error: "weak_password" });
          user.pw = await hashSecret(body.newPassword);
          await redis(cfg, [["SET", userKey(name), JSON.stringify(user)]]);
          await endAllSessions(cfg, uid);
          const token = await createSession(cfg, uid);
          return send(res, 200, { token, user: { name } });
        }

        // delete: everything about this person goes
        await endAllSessions(cfg, uid);
        await redis(cfg, [
          ["DEL", userKey(name)], ["DEL", NS + "uid:" + uid],
          ["DEL", NS + "u:" + uid + ":settings"], ["DEL", NS + "u:" + uid + ":entries"],
          ["DECR", NS + "stats:users"]
        ]);
        return send(res, 200, { ok: true });
      }

      default:
        return send(res, 400, { error: "bad_request" });
    }
  } catch (err) {
    console.error("kunnash auth", err);
    return send(res, 502, { error: "storage_error" });
  }
}
