# -*- coding: utf-8 -*-
"""探测 Dota 物品资料来源：1) SteamDB 仓库里的本地化文件 2) biligame wiki 的物品页标题"""
import json, io, sys, urllib.request, urllib.parse, re

# 1) 解析 GitHub tree，找物品/技能本地化文件
try:
    with io.open('dota_gh_tree.json', encoding='utf-8') as f:
        tree = json.load(f)
    paths = [n['path'] for n in tree.get('tree', [])]
    pat = re.compile(r'(?i)(item|abil|localization|resource|schinese|english)')
    hits = [p for p in paths if pat.search(p) and p.endswith('.txt')]
    print('== gh txt hits:', len(hits))
    for p in hits[:60]:
        print('  ', p)
except Exception as e:
    print('tree parse fail:', e)

# 2) 探测 biligame wiki 候选物品页
ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
titles = ['物品', '装备', '道具', '物品列表', '装备列表', '合成物品', '基础物品', '中立物品', '物品/合成表']
probes = ['黑皇杖', '狂战斧', '阿哈利姆', '迈达斯']
for t in titles:
    url = 'https://wiki.biligame.com/dota2/' + urllib.parse.quote(t)
    try:
        req = urllib.request.Request(url, headers={'User-Agent': ua, 'Accept-Language': 'zh-CN,zh;q=0.9'})
        html = urllib.request.urlopen(req, timeout=25).read().decode('utf-8', 'ignore')
        found = [k for k in probes if k in html]
        # 页面主标题
        m = re.search(r'<title>(.*?)</title>', html, re.S)
        title = (m.group(1).strip()[:60] if m else '?')
        print('TITLE %-10s len=%d title=%s probes=%s' % (t, len(html), title, found))
    except Exception as e:
        print('TITLE %-10s FAIL %s' % (t, e))
