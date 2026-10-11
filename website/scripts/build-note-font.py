"""Subset LXGW WenKai Regular for the decorative notes; requires fonttools[woff]."""
import re
import sys
from pathlib import Path
from fontTools import subset

root = Path(__file__).resolve().parent.parent
if len(sys.argv) != 2:
    raise SystemExit('Usage: python website/scripts/build-note-font.py path/to/LXGWWenKai-Regular.ttf')
source = (root / 'src/pages.mjs').read_text(encoding='utf-8')
text = ''.join(re.findall(r"scribble\('([^']+)'", source)).replace('<br>', '')
subset.main([sys.argv[1], '--text=' + text,
             '--output-file=' + str(root / 'assets/nexlet-notes.woff2'),
             '--flavor=woff2', '--layout-features=*'])
