import logo from '../../assets/brand.png';
import filesearch from '../../assets/tools/filesearch.png';
import clipboard from '../../assets/tools/clipboard.png';
import timestamp from '../../assets/tools/timestamp.png';
import web from '../../assets/tools/web.png';
import scratchpad from '../../assets/tools/scratchpad.png';
import plugins from '../../assets/tools/plugins.png';
import json from '../../assets/tools/json.png';

export const brandIcon = logo;
export const builtInArtwork: Readonly<Record<string, string>> = {
  'tool:filesearch': filesearch,
  'tool:clipboard': clipboard,
  'tool:timestamp': timestamp,
  'tool:web': web,
  'tool:scratchpad': scratchpad,
  'tool:plugins': plugins,
  'tool:json': json,
};
