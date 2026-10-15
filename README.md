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
  throttled, and each account can hold up to 20,000 entries.

## Project layout

| Path | What it is |
| --- | --- |
| `src/app.html` | The whole app (markup, styles, script). Edit this. |
| `build.py` | Turns `src/app.html` into `public/index.html`. Run `python3 build.py` after editing. |
| `public/` | What the site serves: `index.html`, `privacy.html`, `sw.js`, `manifest.webmanifest`, `icon.svg` |
| `api/auth.js` | Sign up, log in, recover with code, change password, log out, delete account |
| `api/data.js` | Read and save the signed-in person's notebook |
| `api/config.js` | Public settings: donation link, number of people, old-notebook import |
| `api/icon.js` | Draws the home-screen icons |
| `api/_lib.js` | Shared helpers (storage, hashing, sessions, rate limits) |

Every push to `main` deploys automatically on Vercel.

## Settings in Vercel (Project → Settings → Environments → Environment Variables)

| Variable | Needed? | What it does |
| --- | --- | --- |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Yes | Added automatically when Upstash for Redis is connected under Storage |
| `KUNNASH_DONATE_URL` | Optional | Your donation page (for example `https://ko-fi.com/yourname`). Shows the "Support Kunnash" button. Must start with `https://`. |
| `KUNNASH_PASSCODE` | Only for the move | The passcode of the old single-notebook version. Lets the owner move that notebook into their new account from Settings. Delete it once the move is done. |

After changing a variable, redeploy (Deployments → ⋯ → Redeploy).

## Donations

Vercel's fair-use guidelines say asking for donations doesn't count as commercial use, so the
free Hobby plan is fine. A simple setup that works from Morocco:

1. Create a free page on https://ko-fi.com and connect your PayPal account to receive donations.
2. Put the page link in `KUNNASH_DONATE_URL` and redeploy.

When usage grows past the free tiers, donations can cover Vercel Pro and Upstash pay-as-you-go.

## Putting it on an iPhone

Open the site in Safari → Share → Add to Home Screen → Add.

## Design skill

The taste skill (`design-taste-frontend`, https://www.tasteskill.dev) is installed in `.agents/skills/`.
Its rules are aimed at marketing websites; this app deliberately uses a bolder neon look.
