// レイアウト自動検査: dist/ の全ページを、複数の画面幅 × 文字サイズで開き、崩れを機械的に検出する。
// 使い方: npm run build && node tools/layout-check.cjs   (Playwright が必要。終了コード: 問題があれば 1)
// 検出する項目:
//   page-overflow    ページ全体が横にはみ出す
//   beyond-viewport  画面の右端を超える要素(横スクロール枠の外)
//   text-overflow    文字・中身が、自分の枠(カード・見出し・段落・リンクなど)の右からはみ出している
//   wbr-in-flex      改行の印(<wbr>)が、横並び・縦並び(flex/grid)の部品として、場所を取っている
//   unbreakable-run  空白・<wbr>・<br> がなく、改行できない文字の連なりが、枠の幅より長い(Safari など、Chromium より改行を許さないブラウザではみ出す)
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
    // 自分の枠からのはみ出し: スクロール幅が表示幅より大きく、overflow を隠していない・スクロールさせていない要素
    { const cs0 = getComputedStyle(el);
      if (['block', 'flex', 'grid', 'list-item', 'table-cell', 'inline-block', 'flow-root'].includes(cs0.display) && cs0.overflowX === 'visible' && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2 && !inScroller(el) && !['HTML', 'BODY'].includes(el.tagName)) push('text-overflow', el, `中身 ${el.scrollWidth}px > 枠 ${el.clientWidth}px`); }
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 && !inScroller(el) && getComputedStyle(el).position !== 'fixed') push('beyond-viewport', el, `right ${Math.round(r.right)} > ${vw}`);
    const s = getComputedStyle(el);
    if ((s.overflowX === 'hidden' || s.overflow === 'hidden') && el.scrollWidth > el.clientWidth + 2 && !['HTML', 'BODY'].includes(el.tagName) && el.clientWidth > 0) push('clipped', el, `scrollWidth ${el.scrollWidth} > ${el.clientWidth}`);
  });

  // テキストノードごとの検査
  // 要素の中のすべてのテキストノードを通して、行ごとの文字を数える(文節の境目に <wbr> を入れて、テキストノードが細かく分かれていても、正しく数えるため)
  const lineInfoEl = (el) => {
    const lines = []; let last = null;
    const range = document.createRange();
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) {
      const text = n.textContent;
      for (let i = 0; i < text.length; i++) {
        if (/\s/.test(text[i])) continue;
        range.setStart(n, i); range.setEnd(n, i + 1);
        const rects = range.getClientRects(); if (!rects.length) continue;
        const top = Math.round(rects[0].top / 4);
        if (last === null || top !== last.top) { last = { top, chars: [] }; lines.push(last); }
        last.chars.push(text[i]);
      }
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
  // 見出し・リンク・ボタン・表のセル・ナビで、1文字だけの行ができていないか(要素全体で数える)
  const seen = new Set();
  document.querySelectorAll(UI).forEach((el) => {
    if (seen.has(el) || !visible(el)) return;
    const inP = el.closest('p') && !el.closest('td,th,li,a,button');
    const txt = el.textContent.trim();
    if (inP || txt.length < 3 || /^https?:\/\//.test(txt)) return;
    seen.add(el);
    const lines = lineInfoEl(el);
    if (lines.length >= 2) {
      const bad = lines.find((l) => l.chars.length === 1 && !/[。、．，！？」）)]/.test(l.chars[0]));
      if (bad) push('orphan-char', el, `「${bad.chars[0]}」だけの行 / ${lines.length}行 [${lines.map((l) => l.chars.join('')).join(' | ')}]`);
    }
  });
  // ブラウザに依存しない静的検査: 改行できる印(空白・<wbr>・<br>・ブロックの境目)の間の、文字の連なりの推定幅が、枠の幅を超えていないか
  {
    const BLOCKISH = ['block', 'list-item', 'table-cell', 'flex', 'grid', 'flow-root'];
    const isWide = (ch) => /[぀-ヿ㐀-鿿＀-￯　-〿]/.test(ch);
    document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,td,th,dd,dt,summary,a,button,label,div').forEach((el) => {
      if (!visible(el)) return;
      const cs = getComputedStyle(el);
      if (!BLOCKISH.includes(cs.display) && !(el.tagName === 'A' && cs.display === 'inline')) return;
      const avail = el.tagName === 'A' && cs.display === 'inline' ? (el.closest('p,li,td,th,div,h1,h2,h3,h4,h5,h6') || el).clientWidth : el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      if (avail <= 0) return;
      let run = 0, max = 0, maxText = '', cur = '';
      const flush = () => { if (run > max) { max = run; maxText = cur; } run = 0; cur = ''; };
      const walk = (node) => {
        for (const ch of node.childNodes) {
          if (ch.nodeType === 3) {
            const fs = parseFloat(getComputedStyle(ch.parentElement).fontSize);
            for (const c of ch.textContent) {
              if (/[\s　]/.test(c)) { flush(); continue; }
              run += (isWide(c) ? 1 : 0.55) * fs; cur += c;
            }
          } else if (ch.nodeType === 1) {
            if (['WBR', 'BR'].includes(ch.tagName)) { flush(); continue; }
            const d = getComputedStyle(ch).display;
            if (d === 'none') continue;
            if (BLOCKISH.includes(d) || d === 'table' || d === 'img') { flush(); continue; }   // ブロックの子は、別に検査する
            walk(ch);
          }
        }
      };
      walk(el); flush();
      if (max > avail + 1 && max > 24) push('unbreakable-run', el, `改行できない連なり 約${Math.round(max)}px > 枠 ${Math.round(avail)}px 「${maxText.slice(0, 18)}」`);
    });
  }
  document.querySelectorAll('wbr').forEach((w) => {
    const d = w.parentElement && getComputedStyle(w.parentElement).display;
    if (['flex', 'grid', 'inline-flex', 'inline-grid'].includes(d)) push('wbr-in-flex', w.parentElement, `<wbr> が ${d} の子`);
  });
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
