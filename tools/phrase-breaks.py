"""ビルド後の処理: dist/*.html の日本語の文章に、文節の境目へ <wbr>(改行してよい印)を入れる。

目的: 日本語の改行位置がブラウザごとに違う(Chrome は文節で折り返せるが、Safari/iPhone は1文字ずつ区切る)問題を、
      どのブラウザでも同じ、自然な改行にそろえる。文節の分割には Google の BudouX を使う。
      CSS(global.css)は `word-break: keep-all; overflow-wrap: anywhere` で、<wbr> の位置以外では改行しない。
文章そのものは変えない(<wbr> は文字を持たない)。使い方: npm run build の後(postbuild で自動実行)。
必要: pip install budoux beautifulsoup4
"""
import glob
import os
import re
import sys

import budoux
from bs4 import BeautifulSoup, NavigableString

INLINE = {'a', 'strong', 'b', 'span', 'em', 'i', 'u', 'small', 'mark', 'sup', 'sub', 'label', 'font'}
# 行頭に来てはいけない文字 / 行末に来てはいけない文字(この境目には <wbr> を入れない)
NO_START = set('。、，．・）」』】〕〉》！？!?:;)]}ゃゅょっぁぃぅぇぉゎャュョッァィゥェォヮー々〜～…‥')
NO_END = set('（「『【〔〈《([{')
DIST = os.path.join(os.path.dirname(__file__), '..', 'dist')
SKIP_PARENTS = {'script', 'style', 'noscript', 'textarea', 'iframe', 'title', 'head', 'code', 'pre'}
CJK = re.compile(r'[぀-ヿ㐀-鿿]')   # ひらがな・カタカナ・漢字
parser = budoux.load_default_japanese_parser()
WIDE = re.compile(r'[぀-ヿ㐀-鿿＀-￯　-〿]')
MAX_EM = 9   # 1つの文節の、改行できない長さの上限(全角文字の幅を1とする)。これより長い文節だけ、さらに細かく分ける


def boundary_scores(sentence):
    """各境目(i = 1..n-1、sentence[i-1] と sentence[i] の間)の、BudouX のスコア。大きいほど、そこで区切るのが自然。
    BudouX 自身の parse() は、スコアが 0 を超える境目で区切る(budoux の Python 版は、スコアを取り出せないため、同じ計算を再実装)。"""
    m = parser._model
    g = lambda k: m.get(k, {})
    uw1, uw2, uw3, uw4, uw5, uw6 = g('UW1'), g('UW2'), g('UW3'), g('UW4'), g('UW5'), g('UW6')
    bw1, bw2, bw3 = g('BW1'), g('BW2'), g('BW3')
    tw1, tw2, tw3, tw4 = g('TW1'), g('TW2'), g('TW3'), g('TW4')
    n = len(sentence)
    scores = {}
    for i in range(1, n):
        score = parser._base_score
        if i > 2: score += uw1.get(sentence[i - 3], 0)
        if i > 1: score += uw2.get(sentence[i - 2], 0)
        score += uw3.get(sentence[i - 1], 0)
        score += uw4.get(sentence[i], 0)
        if i + 1 < n: score += uw5.get(sentence[i + 1], 0)
        if i + 2 < n: score += uw6.get(sentence[i + 2], 0)
        if i > 1: score += bw1.get(sentence[i - 2:i], 0)
        score += bw2.get(sentence[i - 1:i + 1], 0)
        if i + 1 < n: score += bw3.get(sentence[i:i + 2], 0)
        if i > 2: score += tw1.get(sentence[i - 3:i], 0)
        if i > 1: score += tw2.get(sentence[i - 2:i + 1], 0)
        if i + 1 < n: score += tw3.get(sentence[i - 1:i + 2], 0)
        if i + 2 < n: score += tw4.get(sentence[i:i + 3], 0)
        scores[i] = score
    return scores


def em_width(chunk):
    return sum(1 if WIDE.match(c) else 0.55 for c in chunk)


def refine(chunk):
    """長すぎる文節を、さらに細かく分ける: ① URL は / . - などの後ろ ② 中黒(・)の後ろ ③ BudouX が最も区切りやすいと判断した境目で2つに分け、それぞれを繰り返す。"""
    if em_width(chunk) <= MAX_EM:
        return [chunk]
    parts = re.split(r'(?<=[/.\-_?&=])(?=[A-Za-z0-9])', chunk) if re.search(r'[A-Za-z0-9]+[./]', chunk) else [chunk]
    if len(parts) == 1:
        parts = re.split(r'(?<=・)(?=.)', chunk)
    if len(parts) > 1:
        return [x for part in parts for x in refine(part)]
    scores = boundary_scores(chunk)
    n = len(chunk)
    best = None
    for i, sc in scores.items():
        if i < 2 or n - i < 2 or chunk[i] in NO_START or chunk[i - 1] in NO_END:
            continue
        # スコアが高く、できるだけ真ん中に近い境目を選ぶ
        key = sc - 40 * abs(i - n / 2)
        if best is None or key > best[0]:
            best = (key, i)
    if best is None:
        return [chunk]
    i = best[1]
    return refine(chunk[:i]) + refine(chunk[i:])


def split_text(text):
    return [x for ch in parser.parse(text) for x in refine(ch)]


def _edge_char(node, first):
    """ノードの、最初(first=True)または最後の、空白でない文字。なければ None。"""
    text = node.get_text() if hasattr(node, 'get_text') else str(node)
    text = text.strip(' \t\r\n\u3000')
    return (text[0] if first else text[-1]) if text else None


def _safe(left, right):
    return left is not None and right is not None and left not in NO_END and right not in NO_START and CJK.search(left + right) is not None


def add_inline_boundaries(soup, body):
    """インライン要素(<a>・<strong>・<span> など)の前後に、改行してよい印を入れる。
    タグの境目では、文節の分割(BudouX)が及ばず、keep-all の下では改行できる場所がなくなるため。"""
    n = 0
    for tag in list(body.find_all(INLINE)):
        if any(p.name in SKIP_PARENTS for p in tag.parents):
            continue
        # 横並び・縦並び(flex/grid)のレイアウト部品の間に入れると、空の部品として場所を取る。文章の流れ(段落・見出し・文字を直接含む要素)の中だけに入れる
        par = tag.parent
        has_text = any(isinstance(c, NavigableString) and str(c).strip() for c in par.children)
        if not (par.name in ('h1', 'h2', 'h3', 'h4', 'h5', 'h6') or has_text):
            continue
        prev = tag.previous_sibling
        if prev is not None and getattr(prev, 'name', None) not in ('wbr', 'br'):
            if _safe(_edge_char(prev, False), _edge_char(tag, True)):
                tag.insert_before(soup.new_tag('wbr'))
                n += 1
        nxt = tag.next_sibling
        if nxt is not None and getattr(nxt, 'name', None) not in ('wbr', 'br'):
            if _safe(_edge_char(tag, False), _edge_char(nxt, True)):
                tag.insert_after(soup.new_tag('wbr'))
                n += 1
    return n


def process(path):
    html = open(path, encoding='utf-8').read()
    soup = BeautifulSoup(html, 'html.parser')
    body = soup.find('body')
    if body is None:
        return 0, 0
    nodes = 0
    breaks = 0
    for node in list(body.find_all(string=True)):
        if not isinstance(node, NavigableString) or node.parent is None:
            continue
        if node.parent.name in SKIP_PARENTS or any(p.name in SKIP_PARENTS for p in node.parent.parents):
            continue
        text = str(node)
        if not (CJK.search(text) or re.search(r'https?://', text)):   # 日本語、または URL を含む文字だけ処理する
            continue
        phrases = split_text(text)
        if ''.join(phrases) != text or len(phrases) < 2:
            continue
        new = []
        for i, ph in enumerate(phrases):
            if i:
                new.append(soup.new_tag('wbr'))
            new.append(NavigableString(ph))
        node.replace_with(*new)
        nodes += 1
        breaks += len(phrases) - 1
    breaks += add_inline_boundaries(soup, body)
    open(path, 'w', encoding='utf-8').write(str(soup))
    return nodes, breaks


if __name__ == '__main__':
    files = sorted(glob.glob(os.path.join(DIST, '*.html')))
    if not files:
        sys.exit('dist/ に HTML がありません。先に npm run build を実行してください。')
    tn = tb = 0
    for f in files:
        n, b = process(f)
        tn += n
        tb += b
    print(f'phrase-breaks: {len(files)} pages, {tn} text nodes, {tb} <wbr> inserted')
