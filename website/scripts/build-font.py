"""Optional font asset rebuild; requires fonttools[woff] and an OFL Noto Sans SC font."""
import sys
from pathlib import Path
from fontTools import subset

root = Path(__file__).resolve().parent.parent
if len(sys.argv) != 2:
    raise SystemExit('Usage: python website/scripts/build-font.py path/to/NotoSansSC-VF.ttf')
text = ''.join(p.read_text(encoding='utf-8') for p in (root / 'dist').glob('**/*.html'))
text += (root / 'assets/site.js').read_text(encoding='utf-8')
subset.main([sys.argv[1], '--text=' + text,
             '--output-file=' + str(root / 'assets/noto-sans-sc.woff2'),
             '--flavor=woff2', '--layout-features=*'])
