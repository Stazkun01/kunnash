"""Builds public/index.html (the Vercel site) from src/app.html (shared with the Claude artifact).

Also stamps a Content Security Policy on index.html and privacy.html. The policy only lets the
page run its own script (matched by a SHA-256 hash), so injected code can't run even if some
text slipped through unescaped."""
import base64, hashlib, pathlib, re

root = pathlib.Path(__file__).parent
body = (root / "src/app.html").read_text()
SITE = "https://kunnash.vercel.app"
TITLE = "Kunnash · Free budget notebook"
DESC = "Log your salary and expenses and see what's left until payday. Free for everyone, no ads, no email needed. English, Français, العربية."

head_bits = []
# Pull <title>, meta, link and style out of the fragment into the real <head>.
for pat in [r"<title>.*?</title>", r'<meta name="claude:[^>]*>', r"<link [^>]*>", r"<style>.*?</style>"]:
    for m in re.findall(pat, body, flags=re.S):
        if "claude:" in m:
            body = body.replace(m, "", 1)
            continue
        head_bits.append(m)
        body = body.replace(m, "", 1)


def script_hashes(html):
    out = []
    for js in re.findall(r"<script>(.*?)</script>", html, flags=re.S):
        out.append("'sha256-" + base64.b64encode(hashlib.sha256(js.encode()).digest()).decode() + "'")
    return " ".join(out)


def csp(html):
    return ("default-src 'self'; "
            f"script-src 'self' {script_hashes(html)}; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src https://fonts.gstatic.com; "
            "img-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; "
            "object-src 'none'; base-uri 'none'; form-action 'self'")


page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="__CSP__">
<meta name="description" content="{DESC}">
<meta name="theme-color" content="#05040a">
<meta name="color-scheme" content="dark">
<link rel="canonical" href="{SITE}/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Kunnash">
<meta property="og:title" content="{TITLE}">
<meta property="og:description" content="{DESC}">
<meta property="og:url" content="{SITE}/">
<meta property="og:image" content="{SITE}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Kunnash on a phone: what's left to spend this month, money in, spent and kept.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{TITLE}">
<meta name="twitter:description" content="{DESC}">
<meta name="twitter:image" content="{SITE}/og.png">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Kunnash">
{chr(10).join(head_bits)}
<style>[hidden]{{display:none!important}} img{{max-width:100%}}</style>
</head>
<body>
{body.strip()}
</body>
</html>
"""
page = page.replace("__CSP__", csp(page))
out = root / "public"
out.mkdir(exist_ok=True)
(out / "index.html").write_text(page)
print("wrote", out / "index.html", len(page), "bytes")

# Same policy for the privacy page (its small script is hashed too).
priv = out / "privacy.html"
p = re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>\n', "", priv.read_text())
p = p.replace('<meta charset="utf-8">\n', f'<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="{csp(p)}">\n', 1)
priv.write_text(p)
print("stamped", priv)
