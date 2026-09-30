"""Bundle client-src/ into a single self-contained page.

  python scripts/build_client.py            -> apps/web/public/app.html  (talks to /api for AI + file conversion)
  python scripts/build_client.py --artifact -> dist/artifact.html      (no server; uses the Claude viewer's capabilities)
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "client-src"
ORDER = ["engine", "stats", "insights", "io", "samples", "charts", "analysis", "ask", "app", "app2", "app3"]
FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
         '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap">')
ACCEPT = ".csv,.tsv,.tab,.txt,.text,.log,.xlsx,.xls,.xlsm,.xlsb,.ods,.json,.ndjson,.jsonl,.geojson,.zip,.docx,.pdf,.md,.markdown,.html,.htm,.xml,.rtf,.png,.jpg,.jpeg,.webp,.sav,.dta,.sas7bdat,.xpt,.parquet,.feather"


def build(artifact: bool) -> str:
    js = "\n".join((SRC / f"{n}.js").read_text() for n in ORDER)
    css = (SRC / "styles.css").read_text()
    body = f'<div id="app"></div>\n<input type="file" id="fileIn" multiple hidden accept="{ACCEPT}">\n<script>\n{js}\n</script>'
    if artifact:
        return f"<title>Explain Your Data</title>\n{FONTS}\n<style>\n{css}\n</style>\n{body}\n"
    head = ('<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
            '<title>Explain Your Data</title><meta name="description" content="Upload any data and get cleaning, statistics, charts, plain-language explanations and reports.">'
            '<meta name="eyd-api" content="/api">')
    return f'<!doctype html>\n<html lang="en">\n<head>\n{head}\n{FONTS}\n<style>\nhtml,body{{margin:0}}[hidden]{{display:none!important}}img{{max-width:100%}}\n{css}\n</style>\n</head>\n<body>\n{body}\n</body>\n</html>\n'


if __name__ == "__main__":
    if "--artifact" in sys.argv:
        out = ROOT / "dist" / "artifact.html"
        out.parent.mkdir(exist_ok=True)
        out.write_text(build(True))
    else:
        out = ROOT / "apps" / "web" / "public" / "app.html"
        out.write_text(build(False))
    print("wrote", out, f"{out.stat().st_size // 1024} KB")
