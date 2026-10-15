"""Builds public/index.html (the Vercel site) from src/app.html (shared with the Claude artifact)."""
import pathlib, re

root = pathlib.Path(__file__).parent
body = (root / "src/app.html").read_text()

head_bits = []
# Pull <title>, meta, link and style out of the fragment into the real <head>.
for pat in [r"<title>.*?</title>", r'<meta name="claude:[^>]*>', r"<link [^>]*>", r"<style>.*?</style>"]:
    for m in re.findall(pat, body, flags=re.S):
        if "claude:" in m:
            body = body.replace(m, "", 1)
            continue
        head_bits.append(m)
        body = body.replace(m, "", 1)

page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="Kunnash: a free, ad-free monthly budget notebook. Log your salary and expenses and see what is left, on every device.">
<meta name="theme-color" content="#05040a">
<meta name="color-scheme" content="dark">
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
out = root / "public"
out.mkdir(exist_ok=True)
(out / "index.html").write_text(page)
print("wrote", out / "index.html", len(page), "bytes")
