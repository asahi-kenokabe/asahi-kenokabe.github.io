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

DIST = os.path.join(os.path.dirname(__file__), '..', 'dist')
SKIP_PARENTS = {'script', 'style', 'noscript', 'textarea', 'iframe', 'title', 'head', 'code', 'pre'}
CJK = re.compile(r'[぀-ヿ㐀-鿿]')   # ひらがな・カタカナ・漢字
parser = budoux.load_default_japanese_parser()


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
        if not CJK.search(text):
            continue
        phrases = parser.parse(text)
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
