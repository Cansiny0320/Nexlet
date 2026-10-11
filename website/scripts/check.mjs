import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pages } from '../src/pages.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {origin}=JSON.parse(await readFile(path.join(root,'site.json'),'utf8'));
const seenTitles=new Set(),seenDescriptions=new Set();
let checkedLinks=0;
for(const page of pages){
  const html=await readFile(path.join(root,'dist',page.path,'index.html'),'utf8');
  assert.match(html,/<html lang="zh-CN">/);
  assert.equal((html.match(/<h1\b/g)||[]).length,1,`${page.path}: one h1`);
  assert(!html.includes('\uFFFD'),`${page.path}: valid UTF-8 text`);
  assert.match(html,/<main id="main">[\s\S]+<\/main>/);
  const title=html.match(/<title>(.*?)<\/title>/)?.[1];
  const description=html.match(/<meta name="description" content="(.*?)">/)?.[1];
  assert(title && !seenTitles.has(title),'unique title');seenTitles.add(title);
  assert(description && !seenDescriptions.has(description),'unique description');seenDescriptions.add(description);
  assert(html.includes(`<link rel="canonical" href="${origin+page.path}">`));
  assert(html.includes(`<meta property="og:url" content="${origin+page.path}">`));
  const structured=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(structured['@context'],'https://schema.org');
  assert.equal(structured['@graph'].find(x=>x['@type']==='WebPage').url,origin+page.path);
  assert(!/aggregateRating|reviewCount|ratingValue|downloadUrl/.test(JSON.stringify(structured)),'no fabricated ratings or download');
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
  assert.equal(ids.length,new Set(ids).size,'unique IDs');
  for(const image of html.matchAll(/<img\b[^>]*>/g)){assert.match(image[0],/\balt="[^"]*"/);assert.match(image[0],/\bwidth="\d+"/);assert.match(image[0],/\bheight="\d+"/);}
  for(const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)){
    const link=match[1];if(!link.startsWith('/')&&!link.startsWith('#'))continue;
    const url=new URL(link,origin+page.path);
    let target=path.join(root,'dist',decodeURIComponent(url.pathname));
    if(url.pathname.endsWith('/'))target=path.join(target,'index.html');
    assert((await stat(target)).isFile(),`${page.path}: missing ${link}`);
    if(url.hash){const targetHtml=await readFile(target,'utf8');assert(targetHtml.includes(`id="${url.hash.slice(1)}"`),`${page.path}: missing fragment ${link}`);}
    checkedLinks++;
  }
  for(const image of html.matchAll(/<meta (?:property="og:image"|name="twitter:image") content="([^"]+)"/g)){
    const url=new URL(image[1]);assert.equal(url.origin,origin);assert((await stat(path.join(root,'dist',url.pathname))).isFile());
  }
}
const robots=await readFile(path.join(root,'dist/robots.txt'),'utf8');
assert.match(robots,/User-agent: \*\nAllow: \/\n/);assert(robots.includes(`Sitemap: ${origin}/sitemap.xml`));
const sitemap=await readFile(path.join(root,'dist/sitemap.xml'),'utf8');
assert.equal((sitemap.match(/<url>/g)||[]).length,pages.length);
for(const p of pages)assert(sitemap.includes(`<loc>${origin+p.path}</loc>`));
console.log(`PASS: ${pages.length} static pages; ${checkedLinks} local links/assets; unique metadata; JSON-LD; robots; sitemap; image attributes.`);
