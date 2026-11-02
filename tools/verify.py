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
# 赤文字・黒背景の「お問い合わせ・お見積り」画像は、文字のバナー(ContactBanner)に置き換えた(decisions.md 参照)。元の画像名は突き合わせから除く
BANNER_IMGS = {'10524_100_r35_free01_01_6_img.png.webp', '10524_100_r40_free01_01_7_img.png.webp', '10524_100_r56_free01_01_5_img.png.webp', '10524_100_r61_free01_01_10_img.png.webp', '10524_100_r7_free01_01_4_img.png.webp', '10524_100_r51_free01_01_6_img.png.webp', '10524_100_r24_free01_01_3_img.png.webp', '10524_100_r53_free01_01_8_img.png.webp', '10524_100_r21_free01_01_2_img.png.webp', '10524_100_r28_free01_01_5_img.png.webp', '10524_100_r13_free01_01_3_img.png.webp', '10524_100_r74_free01_01_8_img.png.webp', '10524_100_r42_free01_01_4_img.png.webp', '10524_100_r55_free01_01_5_img.png.webp', '10524_100_r27_free01_01_5_img.png.webp', '10524_100_r8_free01_01_3_img.png.webp', '10524_100_r6_free01_01_5_img.png.webp', '10524_100_r46_free01_01_4_img.png.webp', '10524_23_block01_01_4_img.png.webp', '10524_100_r15_free01_01_3_img.png.webp', '10524_23_block08_01_5_img.png.webp', '10524_100_r50_free01_01_6_img.png.webp', '10524_100_r23_free01_01_2_img.png.webp', '10524_100_r36_free01_01_4_img.png.webp', '10524_100_r29_free01_01_4_img.png.webp', '10524_100_r16_free01_01_3_img.png.webp', '10524_100_r38_free01_01_4_img.png.webp', '10524_100_r45_free01_01_7_img.png.webp', '10524_100_r71_free01_01_2_img.png.webp', '10524_100_r49_free01_01_5_img.png.webp', '10524_100_r9_free01_01_3_img.png.webp', '10524_100_r41_free01_01_5_img.png.webp', '10524_110_free01_02_6_img.png.webp', '10524_100_r69_free01_01_7_img.png.webp', '10524_100_r70_free01_01_7_img.png.webp', '10524_100_r68_free01_01_7_img.png.webp', '10524_100_r32_free01_01_5_img.png.webp', '10524_100_r25_free01_01_2_img.png.webp'}
# 表記だけを意図的に直したページ(decisions.md 参照): 元の本文に適用する置換と、追加したリンク。それ以外の差分は従来どおり NG にする
EXPECTED = {
    'company': {
        'text': [('TEL:078', 'TEL：078'), ('FAX:078', 'FAX：078'), ('9：00～12：00午後 13：00～17：00', '9:00〜12:00午後13:00〜17:00')],
        'added_links': {'tel:0785915399', 'tel:0785915362'},
    },
}
SKIP = {'thankyou', 'thankyou_c', 'thankyou_ec', 'thankyou_es', 'thankyou_s', '404'}

def norm(t): return re.sub(r'！{2,}', '！', re.sub(r'[\s　\xa0]+', '', t))   # 連続する「！」は1つにまとめた(decisions.md 参照)。両側に同じ変換をかける
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
    for x in m.select('.banner-contact'):   # バナーは、元のリンク(/contact.html)だけを残して、追加した文字・画像・電話リンクは除く
        for t in x.select('a[href^="tel:"]'): t.decompose()
        for im in x.select('img'): im.decompose()
        for t in list(x.strings): t.replace_with('')
    return m

bad = 0; n = 0
for f in sorted(glob.glob('backup/original/pages/*.html')):
    slug = os.path.basename(f)[:-5]
    if slug == '_root': continue            # index.html と同内容(下で確認)
    if slug in SKIP: continue
    n += 1
    o, b = orig_parts(f), built_parts(slug)
    ot, bt = norm(o.get_text()), norm(b.get_text())
    oi = sorted(norm_img(i['src']) for i in o.find_all('img') if i.get('src') and 'copy2open/select_check' not in i['src'] and norm_img(i['src']) not in BANNER_IMGS)
    bi = sorted(norm_img(i['src']) for i in b.find_all('img') if i.get('src'))
    ol = sorted(norm_link(a['href']) for a in o.find_all('a', href=True))
    bl = sorted(norm_link(a['href']) for a in b.find_all('a', href=True))
    errs = []
    if slug in REDESIGNED:
        oi, bi, ol, bl, ot = [], [], [], [], bt
    if slug in EXPECTED:
        for old, new in EXPECTED[slug]['text']: ot = ot.replace(norm(old), norm(new))
        ol = sorted(ol + sorted(EXPECTED[slug]['added_links']))
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
