import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pages } from '../src/pages.mjs';
import { brand, icon } from '../src/components.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = JSON.parse(await readFile(path.join(root, 'site.json'), 'utf8'));
const esc = (s) => String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
const navigation = [['/', '概览'], ['/download/', '下载'], ['/plugins/', '插件开发']];
for (const page of pages) {
  const url = site.origin + page.path;
  const graph = [
    { '@type': 'WebSite', '@id': site.origin+'/#website', url: site.origin+'/', name:'Nexlet', inLanguage:'zh-CN' },
    { '@type': 'WebPage', '@id': url+'#webpage', url, name:page.title, description:page.description, inLanguage:'zh-CN', isPartOf:{'@id':site.origin+'/#website'} }
  ];
  if (page.path === '/') graph.push({ '@type':'SoftwareApplication', '@id':site.origin+'/#software', name:'Nexlet', url:site.origin+'/', applicationCategory:'UtilitiesApplication', operatingSystem:'Windows, macOS', description:'Nexlet 是面向 Windows 和 macOS 的桌面工具箱，提供应用与快捷方式搜索、剪贴板历史、计算稿纸和常用开发工具。目前处于预览阶段。', image:site.origin+'/assets/launcher.png', screenshot:site.origin+'/assets/launcher.png', sameAs:site.repository, featureList:['应用与快捷方式搜索','剪贴板历史','计算稿纸','JSON 格式化与校验','URL 与 Base64 编解码','时间戳转换','UUID v4','网页快开','Nexlet Plugin API v1'] });
  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(page.title)}</title>
<meta name="description" content="${esc(page.description)}"><meta name="robots" content="index, follow, max-image-preview:large"><meta name="theme-color" content="#f7f7f5"><link rel="canonical" href="${url}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Nexlet"><meta property="og:locale" content="zh_CN"><meta property="og:title" content="${esc(page.title)}"><meta property="og:description" content="${esc(page.description)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${site.origin}/assets/social.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="Nexlet 桌面工具箱：常用工具，随叫随到。桌面工具功能示意。"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(page.title)}"><meta name="twitter:description" content="${esc(page.description)}"><meta name="twitter:image" content="${site.origin}/assets/social.png">
<link rel="icon" href="/assets/icon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/assets/icon.png"><link rel="preload" href="/assets/noto-sans-sc.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="/assets/site.css"><script src="/assets/site.js" type="module"></script>
<script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@graph':graph}).replaceAll('<','\\u003c')}</script></head>
<body class="${page.className}"><a class="skip-link" href="#main">跳至主要内容</a><header class="site-header"><div class="shell header-inner"><a class="brand" href="/" aria-label="Nexlet 首页">${brand}</a><nav id="navigation" aria-label="主导航">${navigation.map(([href,label])=>`<a href="${href}"${page.path===href?' aria-current="page"':''}>${label}</a>`).join('')}</nav><div class="header-actions"><a class="github-icon" href="${site.repository}" aria-label="GitHub 源代码">${icon('github')}</a><a class="button primary" href="/download/">下载 Nexlet</a></div><button class="menu-toggle" type="button" aria-expanded="false" aria-controls="navigation" hidden>菜单 ${icon('menu')}</button></div></header>
<main id="main">${page.body}</main><footer class="site-footer"><div class="shell footer-inner"><a class="brand" href="/">${brand}</a><div class="footer-links"><a href="${site.repository}">${icon('github')} GitHub</a><a href="/plugins/">插件文档</a></div></div></footer><div class="toast" role="status" hidden></div></body></html>\n`;
  const directory = path.join(root, 'dist', page.path);
  await mkdir(directory, { recursive:true });
  await writeFile(path.join(directory,'index.html'), html, 'utf8');
}
await cp(path.join(root,'assets'), path.join(root,'dist/assets'), {recursive:true});
await writeFile(path.join(root,'dist/robots.txt'),`User-agent: *\nAllow: /\n\nSitemap: ${site.origin}/sitemap.xml\n`);
await writeFile(path.join(root,'dist/sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map(p=>`  <url><loc>${site.origin+p.path}</loc><lastmod>${site.reviewedAt}</lastmod></url>`).join('\n')}\n</urlset>\n`);
await writeFile(path.join(root,'dist/404.html'),`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>页面不存在 — Nexlet</title><link rel="stylesheet" href="/assets/site.css"></head><body><main class="shell document"><p class="eyebrow">404</p><h1>页面不存在</h1><a class="button primary" href="/">返回首页</a></main></body></html>`);
console.log(`Generated ${pages.length} static pages, metadata, robots, sitemap and 404.`);
