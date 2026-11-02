#!/usr/bin/env python3
"""抽出結果の検証: 元ページの本文と dist/ の本文を、テキスト・画像・リンクで突き合わせる。
使い方: npm run build の後に python3 -I tools/verify.py"""
import glob, os, re, sys
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup
BASE = 'https://www.lotas-asahi.com/'
# 元サイトから意図的に構成を変更したページ(decisions.md 参照)。本文・画像・リンクの突き合わせは行わず、壊れた画像のみ検査する
REDESIGNED = {'access'}
# ブロックの並び順だけを意図的に変えたページ(decisions.md 参照)。ブロック単位の本文が一致するかを、順序を無視して検査する
REORDERED = {'index'}
SKIP = {'thankyou', 'thankyou_c', 'thankyou_ec', 'thankyou_es', 'thankyou_s', '404'}

def norm(t): return re.sub(r'[\s　\xa0]+', '', t)
def soup(f): return BeautifulSoup(open(f, encoding='utf-8').read(), 'lxml')

def orig_parts(f):
    s = soup(f); m = s.find(id='main_contents')
    for x in m.find_all(['script', 'style', 'noscript']): x.decompose()
    for x in m.find_all('div', id=re.compile(r'^block_outer_(pankuzu|pagetitle|lead)')): x.decompose()
    for x in m.find_all('div', class_='lead__wrap'): x.decompose()
    for x in m.find_all('form'): x.decompose()
    for x in m.find_all('div', id='block_outer_contact_form'): x.decompose()  # Googleフォームに置換(ContactForm)
    return m

def norm_link(h):
    if not h or h.startswith(('#', 'mailto:', 'tel:', 'javascript:')): return h
    u = urljoin(BASE, h); p = urlparse(u)
    if p.netloc.endswith('lotas-asahi.com'):
        n = p.path.lstrip('/')
        if n == 'estimate.html': n = 'contact.html'
        return '/' + n
    return u

def norm_img(src):
    p = urlparse(urljoin(BASE, src))
    return os.path.basename(p.path)

def built_parts(slug):
    f = 'dist/index.html' if slug == 'index' else f'dist/{slug}.html'
    s = soup(f); m = s.find('main')
    for x in m.select('.breadcrumb, .cta, .siblings, .contact-form'): x.decompose()
    return m

bad = 0; n = 0
for f in sorted(glob.glob('backup/original/pages/*.html')):
    slug = os.path.basename(f)[:-5]
    if slug == '_root': continue            # index.html と同内容(下で確認)
    if slug in SKIP: continue
    n += 1
    o, b = orig_parts(f), built_parts(slug)
    ot, bt = norm(o.get_text()), norm(b.get_text())
    oi = sorted(norm_img(i['src']) for i in o.find_all('img') if i.get('src') and 'copy2open/select_check' not in i['src'])
    bi = sorted(norm_img(i['src']) for i in b.find_all('img') if i.get('src'))
    ol = sorted(norm_link(a['href']) for a in o.find_all('a', href=True))
    bl = sorted(norm_link(a['href']) for a in b.find_all('a', href=True))
    errs = []
    if slug in REDESIGNED:
        oi, bi, ol, bl, ot = [], [], [], [], bt
    if slug in REORDERED:
        blk = lambda x: sorted(norm(d.get_text()) for d in x.find_all(class_='block_outer'))
        if blk(o) != blk(b) or not blk(o): errs.append('block texts differ (order ignored)')
        ot = bt
        lk = lambda x: sorted(norm_link(a['href']) for d in x.find_all(class_='block_outer') for a in d.find_all('a', href=True))
        ol, bl = lk(o), lk(b)   # ヒーローのボタン等、ブロック外に追加した要素のリンクは除く
    if ot != bt: errs.append(f'text differs (orig {len(ot)} vs built {len(bt)})')
    if oi != bi: errs.append(f'images differ: {set(oi) ^ set(bi)}')
    if ol != bl: errs.append(f'links differ: {set(ol) ^ set(bl)}')
    for i in b.find_all('img'):
        if not os.path.isfile('dist' + i['src']): errs.append('broken image ' + i['src'])
    if errs: bad += 1; print('NG', slug, errs)
print(f'checked {n} pages, NG {bad}')
# index.html と _root(/) が同一内容か
a = norm(orig_parts('backup/original/pages/index.html').get_text()); b = norm(orig_parts('backup/original/pages/_root.html').get_text())
print('index.html == / :', a == b)
sys.exit(1 if bad else 0)
