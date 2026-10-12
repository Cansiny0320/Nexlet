export const SPOTLIGHT_IDLE = '输入文件名开始搜索，支持多关键词、*.pdf 和 ext:pdf';

/** A deliberately small filename syntax; user input is never a raw predicate. */
export function spotlightQuery(query:string):string {
  if(typeof query!=='string'||query.length>1024||/[\0\r\n]/.test(query))throw new Error('搜索内容最多 1024 字符，且不能包含换行');
  const tokens:string[]=[];
  let token='',quoted=false;
  for(let i=0;i<query.length;i++){
    const char=query[i];
    if(char==='"'){quoted=!quoted;continue;}
    if(quoted&&char==='\\'&&['"','\\'].includes(query[i+1])){token+=query[++i];continue;}
    if(!quoted&&/\s/.test(char)){if(token)tokens.push(token);token='';}
    else token+=char;
  }
  if(quoted)throw new Error('请补全搜索短语的双引号');
  if(token)tokens.push(token);
  if(!tokens.length)throw new Error('请输入文件名');
  return tokens.map(value=>{
    let pattern:string;
    if(/^ext:/i.test(value)){
      const extension=value.slice(4);
      if(!/^[\p{L}\p{N}_-]+$/u.test(extension))throw new Error('扩展名筛选格式为 ext:pdf，一次填写一个扩展名');
      pattern='*.'+extension;
    }else{
      if(/^[a-z]+:/i.test(value))throw new Error('macOS 支持文件名、通配符和 ext:pdf，暂不支持其他 Everything 语法');
      pattern=/[*?]/.test(value)?value:'*'+value+'*';
    }
    return '(kMDItemFSName == "'+pattern.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"cd)';
  }).join(' && ');
}
