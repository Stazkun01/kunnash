# Kunnash

Your salary and expenses in one neon notebook. Free, no ads, and your data lives on your own Vercel site.

## 1. Put the site on Vercel

1. Create a new **private** repository on GitHub and upload everything in this folder.
2. Go to https://vercel.com/new, sign in, import that repository, and press **Deploy**.
   Leave the settings as they are. `vercel.json` already tells Vercel where everything is.

## 2. Give it storage (so it holds your data)

1. In Vercel, open your project and go to the **Storage** tab.
2. Choose **Upstash for Redis** (from the Marketplace) and create a database. Its free plan is plenty for this.
3. Connect it to your project. Vercel adds the storage keys for you
   (`KV_REST_API_URL` and `KV_REST_API_TOKEN`).

## 3. Choose your passcode

1. Still in the project, go to **Settings → Environment Variables**.
2. Add one called `KUNNASH_PASSCODE`. Its value is the passcode you'll type to unlock your notebook.
   Use something long that only you know (at least 6 characters, more is better).
3. Go to **Deployments**, open the menu on the latest one and choose **Redeploy**, so the new settings apply.

Open your site. It asks for the passcode once per device, then remembers it.
If anything is missing, the Settings page in the app says what to add.

## 4. Put it on your iPhone as an app

1. Open your site's link in **Safari** (it has to be Safari on iPhone).
2. Tap the **Share** button, then **Add to Home Screen**, then **Add**.
3. Kunnash now has its own icon. It opens full screen like an app and works offline;
   anything you add offline syncs when you're back online.

## Good to know

- Your iPhone and laptop show the same notebook. Changes sync within a second.
- **Settings → Lock this device** removes the passcode and data from that device.
- **Download backup** in Settings gives you a file copy of everything; **Restore backup** adds it back.
- Wrong passcode 10 times in a row locks that connection for 15 minutes.

## Change things

- The app is `src/app.html`. Edit it, run `python3 build.py`, and it rebuilds `public/index.html`.
- Colors are variables at the top of the `<style>` block: `--neon` is the purple, `--bg` the black.
- Server code is `api/data.js`. The offline support is `public/sw.js`. When you change the app,
  bump `CACHE` in `sw.js` (for example to `kunnash-v4`) so phones pick up the new version.

## Design skill

The taste skill (`design-taste-frontend`, https://www.tasteskill.dev) is installed in `.agents/skills/`
and linked for Claude Code in `.claude/skills/`. This version deliberately goes against its rules
(glow, gradients, glass) because you asked for a bolder neon look. Its own description says it is for
websites, not app screens.
