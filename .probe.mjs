import { chromium } from '@playwright/test';
import { preview } from 'vite';
const server = await preview({ preview: { port: 4188, host: '127.0.0.1' } });
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://127.0.0.1:4188/');
await page.waitForTimeout(500);
console.log(await page.evaluate(() => {
  const w = window.innerWidth; const out = [];
  out.push(`scrollWidth ${document.documentElement.scrollWidth} inner ${w} client ${document.documentElement.clientWidth}`);
  for (const el of document.querySelectorAll('body *')) { const r = el.getBoundingClientRect(); if (r.right > document.documentElement.clientWidth + 1) out.push(`${el.tagName}.${el.className} ${Math.round(r.right)}`); }
  return out.slice(0, 15).join('\n');
}));
await browser.close(); await server.close(); process.exit(0);
