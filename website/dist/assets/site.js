const toggle = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#navigation');
if (toggle && navigation) {
  toggle.hidden = false;
  document.documentElement.classList.add('js');
  const close = () => { toggle.setAttribute('aria-expanded', 'false'); navigation.classList.remove('is-open'); };
  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(expanded));
    navigation.classList.toggle('is-open', expanded);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') { close(); toggle.focus(); }
  });
  navigation.addEventListener('click', event => { if (event.target.closest('a')) close(); });
  window.matchMedia('(min-width: 761px)').addEventListener('change', close);
}
import { selectPlatform, getShortcutModifier } from './platform.mjs';
import { refreshRelease } from './releases.mjs';

const platformInfo={userAgent:navigator.userAgent,platform:navigator.userAgentData?.platform||navigator.platform,mobile:navigator.userAgentData?.mobile,maxTouchPoints:navigator.maxTouchPoints};
const shortcutModifier=getShortcutModifier(platformInfo);
for(const label of document.querySelectorAll('[data-shortcut-modifier]'))label.textContent=shortcutModifier;

const controls=[...document.querySelectorAll('[data-download-control]')];
let manualChoice=false, detectedPlatform=null;
function choosePlatform(key){
  for(const control of controls){
    const option=control.querySelector(`[data-platform="${key}"]`);if(!option)continue;
    control.querySelector('[data-primary-download]').href=option.dataset.url;
    control.querySelector('[data-download-label]').textContent=option.dataset.label;
    control.querySelector('[data-platform-icon]').innerHTML=option.querySelector('.platform-icon').innerHTML;
    control.querySelector('[data-download-hint]').textContent=option.dataset.platformLabel;
    for(const item of control.querySelectorAll('[data-platform]')){
      item.classList.toggle('is-selected',item===option);
      item.setAttribute('aria-pressed',String(item===option));
      item.querySelector('.selection-label').textContent=item.dataset.platform===detectedPlatform?'当前系统':'';
    }
  }
}
function clearPlatform(){
 detectedPlatform=null;
 for(const control of controls){
  control.querySelector('[data-primary-download]').href='/download/';
  control.querySelector('[data-download-label]').textContent='下载 Nexlet';
  control.querySelector('[data-platform-icon]').innerHTML='';
  control.querySelector('[data-download-hint]').textContent='选择平台';
  for(const item of control.querySelectorAll('[data-platform]')){item.classList.remove('is-selected');item.setAttribute('aria-pressed','false');item.querySelector('.selection-label').textContent='';}
 }
}
for(const control of controls){
 const toggle=control.querySelector('.download-toggle'),menu=control.querySelector('.download-menu'),options=[...menu.querySelectorAll('button')];
 toggle.hidden=false;
 const close=()=>{menu.hidden=true;toggle.setAttribute('aria-expanded','false');};
 const open=()=>{for(const other of controls)if(other!==control){other.querySelector('.download-menu').hidden=true;other.querySelector('.download-toggle').setAttribute('aria-expanded','false');}menu.hidden=false;toggle.setAttribute('aria-expanded','true');};
 toggle.addEventListener('click',()=>{if(menu.hidden)open();else close();});
 toggle.addEventListener('keydown',e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();open();options[e.key==='ArrowDown'?0:options.length-1].focus();}});
 menu.addEventListener('keydown',e=>{let index=options.indexOf(document.activeElement);if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();options[(index+(e.key==='ArrowDown'?1:-1)+options.length)%options.length].focus();}if(e.key==='Home'||e.key==='End'){e.preventDefault();options[e.key==='Home'?0:options.length-1].focus();}});
 options.forEach(option=>option.addEventListener('click',()=>{manualChoice=true;choosePlatform(option.dataset.platform);close();toggle.focus();}));
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menu.hidden){close();toggle.focus();}});
 document.addEventListener('click',e=>{if(!control.contains(e.target))close();});
 control.addEventListener('focusout',()=>setTimeout(()=>{if(!control.contains(document.activeElement))close();},0));
}
if(controls.length){
 const initial=selectPlatform(platformInfo);if(initial){detectedPlatform=initial;choosePlatform(initial);}
 navigator.userAgentData?.getHighEntropyValues?.(['architecture','bitness']).then(data=>{if(manualChoice)return;const platform=selectPlatform({...platformInfo,...data});if(platform){detectedPlatform=platform;choosePlatform(platform);}else if(data.architecture||data.bitness){clearPlatform();}}).catch(()=>{});
}

void refreshRelease();

let toastTimer;
for(const button of document.querySelectorAll('[data-copy]'))button.addEventListener('click',async()=>{
 const toast=document.querySelector('.toast');
 try{await navigator.clipboard.writeText(button.dataset.copy);toast.textContent='已复制到剪贴板';}
 catch{toast.textContent='复制未成功，请选中文字后手动复制';}
 clearTimeout(toastTimer);toast.hidden=false;toastTimer=setTimeout(()=>{toast.hidden=true;},2600);
});
