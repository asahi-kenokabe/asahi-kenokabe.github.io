// レイアウト自動検査: dist/ の全ページを、複数の画面幅 × 文字サイズで開き、崩れを機械的に検出する。
// 使い方: npm run build && node tools/layout-check.cjs   (Playwright が必要。終了コード: 問題があれば 1)
// 検出する項目:
//   page-overflow    ページ全体が横にはみ出す
//   beyond-viewport  画面の右端を超える要素(横スクロール枠の外)
//   phone-wrapped    電話番号が途中で折り返されている
//   orphan-char      見出し・リンク・ボタン・表のセル・ナビで、1文字だけの行ができている
//   narrow-cell      表のセルが細すぎて、1行に3文字入らない
//   clipped          overflow を隠していて、中身が切れている
//   low-contrast     文字と背景のコントラスト比が基準未満(WCAG: 通常 4.5、大きい文字 3)
//   broken-image     読み込めない画像
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, '..', 'dist');
const VIEWPORTS = [
  { w: 320, scale: 1 }, { w: 360, scale: 1 }, { w: 360, scale: 1.3 }, { w: 390, scale: 1 },
  { w: 412, scale: 1 }, { w: 412, scale: 1.3 }, { w: 768, scale: 1 }, { w: 1024, scale: 1 }, { w: 1280, scale: 1 },
];
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.json': 'application/json' };

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(DIST, p);
      if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    }).listen(0, () => resolve(server));
  });
}

// ページ内で実行する検査(ブラウザ側)
function inPage() {
  const issues = [];
  const vw = innerWidth;
  const desc = (el) => {
    const c = (el.className && typeof el.className === 'string') ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    return el.tagName.toLowerCase() + c;
  };
  const push = (type, el, detail) => issues.push({ type, sel: desc(el), detail, text: (el.textContent || '').trim().slice(0, 30) });
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const inScroller = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };

  if (document.documentElement.scrollWidth > vw + 1) push('page-overflow', document.body, `scrollWidth ${document.documentElement.scrollWidth} > ${vw}`);

  document.querySelectorAll('body *').forEach((el) => {
    if (!visible(el) || ['IFRAME', 'SCRIPT', 'STYLE'].includes(el.tagName)) return;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 && !inScroller(el) && getComputedStyle(el).position !== 'fixed') push('beyond-viewport', el, `right ${Math.round(r.right)} > ${vw}`);
    const s = getComputedStyle(el);
    if ((s.overflowX === 'hidden' || s.overflow === 'hidden') && el.scrollWidth > el.clientWidth + 2 && !['HTML', 'BODY'].includes(el.tagName) && el.clientWidth > 0) push('clipped', el, `scrollWidth ${el.scrollWidth} > ${el.clientWidth}`);
  });

  // テキストノードごとの検査
  const lineInfo = (node) => {
    const text = node.textContent; const lines = []; let last = null;
    const range = document.createRange();
    for (let i = 0; i < text.length; i++) {
      if (/\s/.test(text[i])) continue;
      range.setStart(node, i); range.setEnd(node, i + 1);
      const rects = range.getClientRects(); if (!rects.length) continue;
      const top = Math.round(rects[0].top / 4);
      if (last === null || top !== last.top) { last = { top, chars: [] }; lines.push(last); }
      last.chars.push(text[i]);
    }
    return lines;
  };
  const UI = 'h1,h2,h3,h4,h5,h6,a,button,th,td,li,dt,dd,.brand-name,.brand-corp,.head-tel,summary,span.menu_txt';
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = tw.nextNode())) {
    const el = node.parentElement; if (!el || !visible(el) || ['SCRIPT', 'STYLE'].includes(el.tagName)) continue;
    const t = node.textContent;
    if (t.trim().length < 2) continue;
    const m = t.match(/0\d{1,3}-\d{2,4}-\d{3,4}/);
    if (m) {
      const range = document.createRange(); range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
      const tops = new Set([...range.getClientRects()].map((r) => Math.round(r.top / 4)));
      if (tops.size > 1) push('phone-wrapped', el, m[0]);
    }
    const inP = el.closest('p') && !el.closest('td,th,li,a,button');
    if (el.closest(UI) && !inP && t.trim().length >= 3 && !/^https?:\/\//.test(t.trim())) {   // URL の文字列は、どこで折り返しても読めるので対象外
      const lines = lineInfo(node);
      if (lines.length >= 2) {
        const bad = lines.find((l) => l.chars.length === 1 && !/[。、．，！？」）)]/.test(l.chars[0]));
        if (bad) push('orphan-char', el, `「${bad.chars[0]}」だけの行 / ${lines.length}行 [${lines.map((l) => l.chars.join('')).join(' | ')}]`);
      }
    }
    // コントラスト
    const cs = getComputedStyle(el);
    const parse = (c) => { const x = c.match(/[\d.]+/g); return x ? x.map(Number) : null; };
    const fg = parse(cs.color);
    if (fg) {
      let bg = null;
      for (let p = el; p; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (s.backgroundImage !== 'none') { bg = 'image'; break; }
        const b = parse(s.backgroundColor);
        if (b && (b[3] === undefined || b[3] > 0.95)) { bg = b; break; }
      }
      if (bg && bg !== 'image') {
        const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
        const l1 = lum(fg), l2 = lum(bg); const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        const size = parseFloat(cs.fontSize); const large = size >= 24 || (size >= 18.66 && parseInt(cs.fontWeight) >= 700);
        if (ratio < (large ? 3 : 4.5)) push('low-contrast', el, `比 ${ratio.toFixed(2)} (${cs.color} on rgb(${bg.slice(0, 3).join(',')}))`);
      }
    }
  }
  document.querySelectorAll('td,th').forEach((c) => {
    if (!visible(c)) return;
    const fs = parseFloat(getComputedStyle(c).fontSize); const txt = c.textContent.trim();
    const inner = c.clientWidth - parseFloat(getComputedStyle(c).paddingLeft) - parseFloat(getComputedStyle(c).paddingRight);
    if (txt.length >= 4 && inner / fs < 3) push('narrow-cell', c, `幅 ${Math.round(inner)}px (${(inner / fs).toFixed(1)}文字) / 「${txt.slice(0, 10)}」`);
  });
  document.querySelectorAll('img').forEach((i) => { if (i.complete && i.naturalWidth === 0 && i.getBoundingClientRect().width > 0) push('broken-image', i, i.getAttribute('src')); });
  return issues;
}

(async () => {
  if (!fs.existsSync(DIST)) { console.error('dist/ がありません。先に npm run build を実行してください。'); process.exit(2); }
  // デバッグ用: ONLY_PAGE=shaken.html ONLY_W=360 で、対象のページ・幅を絞れる
  const pages = fs.readdirSync(DIST).filter((f) => f.endsWith('.html') && (!process.env.ONLY_PAGE || f === process.env.ONLY_PAGE)).sort();
  const server = await serve(); const base = `http://localhost:${server.address().port}`;
  const browser = await chromium.launch();
  const found = new Map(); // key -> {type, sel, detail, text, where:Set}
  const runViewport = async (vp) => {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: 900 } });
    const page = await ctx.newPage();
    await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());   // 外部(Google マップ・フォント等)は読み込まない
    for (const f of pages) {
      await page.goto(`${base}/${f}`, { waitUntil: 'load' });
      await page.addStyleTag({ content: (vp.scale !== 1 ? `html{font-size:${vp.scale * 100}% !important}` : '') + 'iframe{display:none !important}' });
      await page.evaluate(() => document.querySelectorAll('img[loading=lazy]').forEach((i) => { i.loading = 'eager'; }));
      await page.waitForTimeout(150);
      const issues = await page.evaluate(inPage);
      for (const i of issues) {
        const key = `${i.type}|${i.sel}|${i.text}`;
        if (!found.has(key)) found.set(key, { ...i, where: new Set() });
        found.get(key).where.add(`${f.replace('.html', '')}@${vp.w}${vp.scale !== 1 ? 'x' + vp.scale : ''}`);
      }
    }
    await ctx.close();
  };
  const queue = VIEWPORTS.filter((v) => !process.env.ONLY_W || String(v.w) === process.env.ONLY_W);
  await Promise.all([0, 1, 2, 3].map(async () => { while (queue.length) await runViewport(queue.shift()); }));
  await browser.close(); server.close();
  const list = [...found.values()].sort((a, b) => a.type.localeCompare(b.type) || b.where.size - a.where.size);
  console.log(`検査: ${pages.length}ページ × ${VIEWPORTS.length}条件 / 問題 ${list.length}件(種類×要素ごと)`);
  const byType = {};
  for (const i of list) (byType[i.type] ||= []).push(i);
  for (const [t, arr] of Object.entries(byType)) {
    console.log(`\n== ${t} (${arr.length}) ==`);
    for (const i of arr.slice(0, 25)) console.log(`- ${i.sel} 「${i.text}」 ${i.detail} … ${i.where.size}件 例: ${[...i.where].slice(0, 3).join(', ')}`);
    if (arr.length > 25) console.log(`  …ほか ${arr.length - 25} 件`);
  }
  process.exit(list.length ? 1 : 0);
})();
