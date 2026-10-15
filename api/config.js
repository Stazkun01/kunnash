// Public settings the app reads at start: donation link, whether accounts are ready,
// and whether an old single-passcode notebook is waiting to be imported.
//   GET /api/config
import { NS, LEGACY, storage, redis, send } from "./_lib.js";

const safeUrl = (u) => {
  try { const x = new URL(String(u || "")); return x.protocol === "https:" ? x.href : ""; } catch { return ""; }
};

export default async function handler(req, res) {
  const donateUrl = safeUrl(process.env.KUNNASH_DONATE_URL);
  const cfg = storage();
  if (!cfg) return send(res, 200, { accounts: false, reason: "no_storage", donateUrl, legacy: false, people: 0 });
  try {
    const [people, legacyEntries, legacySettings] = await redis(cfg, [
      ["GET", NS + "stats:users"], ["EXISTS", LEGACY + "entries"], ["EXISTS", LEGACY + "settings"]
    ]);
    res.setHeader("Cache-Control", "no-store");
    return send(res, 200, {
      accounts: true,
      donateUrl,
      legacy: Boolean(Number(legacyEntries) || Number(legacySettings)) && (process.env.KUNNASH_PASSCODE || "").length >= 6,
      people: Math.max(0, Number(people) || 0)
    });
  } catch (err) {
    console.error("kunnash config", err);
    return send(res, 200, { accounts: false, reason: "storage_error", donateUrl, legacy: false, people: 0 });
  }
}
