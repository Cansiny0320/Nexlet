"""Optional font asset rebuild; requires fonttools[woff] and an OFL Noto Sans SC font."""
import sys
from pathlib import Path
from fontTools import subset

root = Path(__file__).resolve().parent.parent
if len(sys.argv) != 2:
    raise SystemExit('Usage: python website/scripts/build-font.py path/to/NotoSansSC-VF.ttf')
text = ''.join(p.read_text(encoding='utf-8') for p in (root / 'src').rglob('*.tsx'))
text += ''.join(p.read_text(encoding='utf-8') for p in (root / 'src/lib').glob('*.ts'))
subset.main([sys.argv[1], '--text=' + text,
             '--output-file=' + str(root / 'public/assets/noto-sans-sc.woff2'),
             '--flavor=woff2', '--layout-features=*'])
