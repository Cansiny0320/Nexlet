"""Optional font asset rebuild; requires fonttools[woff] and an OFL Noto Sans SC font."""
import sys
from pathlib import Path
from fontTools import subset

root = Path(__file__).resolve().parent.parent
if len(sys.argv) not in (2, 3):
    raise SystemExit('Usage: python website/scripts/build-font.py path/to/NotoSansSC-VF.ttf [zh-Hant]')
text = ''.join(p.read_text(encoding='utf-8') for p in (root / 'src').rglob('*.tsx'))
text += ''.join(p.read_text(encoding='utf-8') for p in (root / 'src/lib').glob('*.ts'))
text += ''.join(p.read_text(encoding='utf-8') for p in (root / 'src/lib/locales').glob('*.json'))
output = 'noto-sans-tc.woff2' if len(sys.argv) == 3 and sys.argv[2] == 'zh-Hant' else 'noto-sans-sc.woff2'
subset.main([sys.argv[1], '--text=' + text,
             '--output-file=' + str(root / 'public/assets' / output),
             '--flavor=woff2', '--layout-features=*'])
