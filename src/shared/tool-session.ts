import { t } from './i18n';
export const DETACHABLE_TOOLS=['clipboard','scratchpad','json','timestamp','encoding','uuid','filesearch'] as const;
export interface ToolSessionSnapshot { version:1; view:string; query:string; state:Record<string,unknown>; }
export function validateToolSnapshot(value:unknown):ToolSessionSnapshot {
  if(!value||typeof value!=='object')throw Error(t("工具状态无效"));
  const v=value as ToolSessionSnapshot;
  if(v.version!==1||!DETACHABLE_TOOLS.includes(v.view as any)||typeof v.query!=='string'||v.query.length>500000||!v.state||Array.isArray(v.state)||typeof v.state!=='object')throw Error(t("工具状态无效"));
  const json=JSON.stringify(v);if(json.length>4_000_000)throw Error(t("工具状态超过 4 MB"));
  return JSON.parse(json);
}
