// Public settings the app reads at start: whether accounts are ready, the donation link,
// and how many people use Kunnash.
//   GET /api/config
import { NS, storage, redis, send } from "./_lib.js";

const DONATE_URL = "https://ko-fi.com/kunnash";

const safeUrl = (u) => {
  try { const x = new URL(String(u || "")); return x.protocol === "https:" ? x.href : ""; } catch { return ""; }
};

export default async function handler(req, res) {
  // KUNNASH_DONATE_URL in Vercel overrides the built-in link; set it to "off" to hide the button.
  const donateUrl = process.env.KUNNASH_DONATE_URL === "off" ? "" : safeUrl(process.env.KUNNASH_DONATE_URL || DONATE_URL);
  const cfg = storage();
  if (!cfg) return send(res, 200, { accounts: false, reason: "no_storage", donateUrl, people: 0 });
  try {
    const [people] = await redis(cfg, [["GET", NS + "stats:users"]]);
    return send(res, 200, { accounts: true, donateUrl, people: Math.max(0, Number(people) || 0) });
  } catch (err) {
    console.error("kunnash config", err);
    return send(res, 200, { accounts: false, reason: "storage_error", donateUrl, people: 0 });
  }
}
