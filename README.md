# Kunnash · كناش

A free, ad-free money notebook: log your salary and expenses and see what's left until payday.
Works in English, French and Arabic, on phones and computers, and installs on iPhone like an app.

Live at **https://kunnash.vercel.app**

## How it works

- **Accounts without email.** People pick a username and password. At sign-up they get a one-time
  recovery code, which is the only way to reset a forgotten password. No email or phone number is ever asked for.
- **Private notebooks.** Each account's data is stored separately in Upstash Redis. Passwords and
  recovery codes are stored only as scrypt hashes. Sign-in tokens are stored as SHA-256 hashes.
- **Device-only mode.** Anyone can skip the account and keep everything in their browser.
- **Offline.** The app caches itself (service worker) and queues changes until it's back online.
- **Limits that protect the free tier.** Sign-ups per network are rate-limited, failed log-ins are
  throttled, each account can hold up to 5,000 entries and save up to 6,000 changes a day, and the
  whole site stops taking new entries before the free database is full.

## Project layout

| Path | What it is |
| --- | --- |
| `src/app.html` | The whole app (markup, styles, script). Edit this. |
| `build.py` | Turns `src/app.html` into `public/index.html`. Run `python3 build.py` after editing. |
| `public/` | What the site serves: `index.html`, `privacy.html`, `sw.js`, `manifest.webmanifest`, `icon.svg` |
| `api/auth.js` | Sign up, log in, recover with code, change password, log out, delete account |
| `api/data.js` | Read and save the signed-in person's notebook |
| `api/config.js` | Public settings: donation link, number of people |
| `api/icon.js` | Draws the home-screen icons |
| `api/_lib.js` | Shared helpers (storage, hashing, sessions, rate limits) |

Every push to `main` deploys automatically on Vercel.

## Settings in Vercel (Project → Settings → Environments → Environment Variables)

| Variable | Needed? | What it does |
| --- | --- | --- |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Yes | Added automatically when Upstash for Redis is connected under Storage |
| `KUNNASH_DONATE_URL` | Optional | Replaces the built-in donation link (https://ko-fi.com/kunnash). Must start with `https://`; `off` hides the button. |
| `KUNNASH_OPS_PER_DAY` | Optional | Changes one account may save per day. Default 6000. |
| `KUNNASH_SIGNUPS_PER_IP_DAY` | Optional | New accounts from one network per day. Default 20. |
| `KUNNASH_SIGNUPS_PER_DAY` | Optional | New accounts across the site per day. Default 1000. |
| `KUNNASH_MAX_TOTAL_ENTRIES` | Optional | All entries of all accounts together. Default 600,000 (about 150 MB, inside Upstash's free 250 MB). Raise it on a paid plan. |

After changing a variable, redeploy (Deployments → ⋯ → Redeploy).

## Donations

Vercel's fair-use guidelines say asking for donations doesn't count as commercial use, so the
free Hobby plan is fine. A simple setup that works from Morocco:

1. Create a free page on https://ko-fi.com and connect your PayPal account to receive donations.
2. The link lives in `api/config.js` (`DONATE_URL`); `KUNNASH_DONATE_URL` overrides it without a code change.

When usage grows past the free tiers, donations can cover Vercel Pro and Upstash pay-as-you-go.

## Contact

Questions or ideas: dibt.chakibb@gmail.com

## License

MIT, see `LICENSE`.

## Putting it on an iPhone

Open the site in Safari → Share → Add to Home Screen → Add.

## Design skill

The taste skill (`design-taste-frontend`, https://www.tasteskill.dev) is installed in `.agents/skills/`.
Its rules are aimed at marketing websites; this app deliberately uses a bolder neon look.
