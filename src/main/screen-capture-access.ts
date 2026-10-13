import {shell,systemPreferences} from 'electron';
import koffi from 'koffi';

export async function ensureScreenCaptureAccess(platform:NodeJS.Platform=process.platform){
 if(platform!=='darwin')return;
 const status=systemPreferences.getMediaAccessStatus('screen');
 if(status==='granted')return;
 if(status!=='restricted'){
  // Electron's askForMediaAccess supports only the microphone and camera.
  const request=koffi.load('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics').func('bool CGRequestScreenCaptureAccess(void)');
  if(request()||systemPreferences.getMediaAccessStatus('screen')==='granted')return;
 }
 await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
 throw Error(status==='restricted'?'屏幕录制受到系统策略限制，已打开系统设置，请联系设备管理员允许 Nexlet':'已打开屏幕录制设置，请允许 Nexlet；若系统提示，请退出并重新打开 Nexlet 后重试');
}
