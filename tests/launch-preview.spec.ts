import { test, expect, _electron as electron, type Page } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

async function pasteImage(page:Page,color:string,width=160,height=90){
  return page.evaluate(async({color,width,height})=>{
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const context=canvas.getContext('2d')!;context.fillStyle=color;context.fillRect(0,0,width,height);
    const blob=await new Promise<Blob>(resolve=>canvas.toBlob(value=>resolve(value!),'image/png'));
    const data=new DataTransfer();data.items.add(new File([blob],'image.png',{type:'image/png'}));
    document.querySelector('.launcher-input')!.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));
    return canvas.toDataURL('image/png');
  },{color,width,height});
}

test('粘贴图片显示缩略图，预览关闭和替换不丢失当前输入',async()=>{
  const data=await mkdtemp(path.join(tmpdir(),'nexlet-preview-'));
  const env:Record<string,string>={...Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>entry[1]!==undefined)),NEXLET_TEST_MODE:'1',NEXLET_USER_DATA:data};
  delete env.ELECTRON_RUN_AS_NODE;
  const app=await electron.launch({args:[process.cwd()],env});
  try{
    const page=await app.firstWindow();
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    const search=page.getByLabel('搜索功能、应用或快捷方式');
    await expect(search).toBeVisible();
    await pasteImage(page,'#6569e8');
    const thumbnail=page.getByRole('img',{name:'待处理图片'});
    await expect(thumbnail).toBeVisible();
    await expect.poll(()=>thumbnail.evaluate((node:HTMLImageElement)=>[node.naturalWidth,node.naturalHeight])).toEqual([160,90]);
    const firstSource=await thumbnail.getAttribute('src');
    await expect(page.getByRole('button',{name:'收进剪贴板',exact:true})).toBeVisible();
    const previewButton=page.getByRole('button',{name:'预览图片',exact:true});
    await previewButton.focus();await page.keyboard.press('Enter');
    const dialog=page.getByRole('dialog',{name:'图片预览'});
    await expect(dialog).toBeVisible();
    const image=dialog.getByRole('img',{name:'图片预览',exact:true});
    await expect(image).toHaveAttribute('src',firstSource!);
    await expect.poll(()=>image.evaluate((node:HTMLImageElement)=>node.naturalWidth)).toBe(160);
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button',{name:'关闭预览'})).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();await expect(thumbnail).toBeVisible();await expect(previewButton).toBeFocused();
    await previewButton.click();await dialog.getByRole('button',{name:'关闭预览'}).click();
    await expect(dialog).not.toBeVisible();await expect(thumbnail).toBeVisible();
    await previewButton.click();await page.mouse.click(5,5);
    await expect(dialog).not.toBeVisible();await expect(thumbnail).toBeVisible();
    await search.fill('剪贴板');await previewButton.click();await page.keyboard.press('Escape');
    await expect(search).toHaveValue('剪贴板');
    await search.fill('');await pasteImage(page,'#e87935',90,160);
    await expect(thumbnail).not.toHaveAttribute('src',firstSource!);
    await expect.poll(()=>thumbnail.evaluate((node:HTMLImageElement)=>[node.naturalWidth,node.naturalHeight])).toEqual([90,160]);
    await previewButton.click();await expect(image).toHaveAttribute('src',(await thumbnail.getAttribute('src'))!);
    await page.screenshot({path:'test-results/launch-image-preview.png'});
    await page.keyboard.press('Escape');await page.getByRole('button',{name:'取消内容输入'}).click();
    await expect(thumbnail).toHaveCount(0);await expect(dialog).toHaveCount(0);await expect(search).toBeFocused();
    await pasteImage(page,'#2f9060');await expect(thumbnail).toBeVisible();
    await previewButton.click();await page.keyboard.press('Escape');await expect(thumbnail).toBeVisible();
    await page.keyboard.press('Escape');await expect(thumbnail).toHaveCount(0);await expect(search).toBeFocused();
    await pasteImage(page,'#2f9060');await expect(thumbnail).toBeVisible();
    await page.getByRole('button',{name:'收进剪贴板',exact:true}).click();
    await expect(page.getByLabel('搜索剪贴板', {exact:true})).toBeVisible();
    await expect(page.getByRole('img',{name:'剪贴板图片'})).toBeVisible();
    await page.getByRole('button',{name:'返回首页',exact:true}).click();
    await expect(thumbnail).toHaveCount(0);await expect(dialog).toHaveCount(0);
    expect(errors).toEqual([]);
  }finally{await app.close();}
});
