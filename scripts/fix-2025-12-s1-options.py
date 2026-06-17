#!/usr/bin/env python3
# 修正 2025.12 第1套听力选项顺序：以源卷官方 A/B/C/D 为锚，把库内自身选项文本(逐字不改)重排成官方序。
# 安全保证：源↔库 4 选项做相似度双射匹配，必须 4 项一一对应(permutation)才写；否则跳过报告。correct 不动。
# 用法: python3 scripts/fix-2025-12-s1-options.py [--apply]
import sys, re, json, sqlite3, subprocess, os
from difflib import SequenceMatcher

APPLY = "--apply" in sys.argv
HERE = os.path.dirname(__file__)
DB = os.path.join(HERE, "..", "prisma", "dev.db")
PDF = os.path.join(HERE, "..", "四级真题+答案+听力（2025.6-2015.06）",
                   "2025年12月四级真题+答案", "2025年12月大学英语四级真题（第一套）_ 完整版精排.pdf")
PAPER = "cmq4ctr9w01zn62vp9kd2uktz"

txt = subprocess.run(["pdftotext", "-layout", PDF, "-"], capture_output=True, text=True).stdout

# 解析源卷 Q1-25 的官方 A-D 选项(单栏，每行一个 "X)  文本"，可续行)
src = {}            # n -> {A:..,B:..,C:..,D:..}
cur = None; curL = None
for raw in txt.splitlines():
    line = raw.rstrip()
    mn = re.match(r'\s*(\d{1,2})[.．]\s', line)
    if mn and 1 <= int(mn.group(1)) <= 55:
        cur = int(mn.group(1)); curL = None
    mo = re.match(r'\s*([A-D])\)\s+(.*)$', line)
    if mo and cur is not None:
        curL = mo.group(1)
        src.setdefault(cur, {})[curL] = mo.group(2).strip()

def norm(s): return re.sub(r'[^a-z0-9 ]', '', re.sub(r'\s+', ' ', (s or '').lower())).strip()
def sim(a, b): return SequenceMatcher(None, norm(a), norm(b)).ratio()

con = sqlite3.connect(DB)
rows = con.execute("""
  SELECT q.id, q.number, q.correct, q.optionsJson FROM Question q
  JOIN Section s ON q.sectionId=s.id
  WHERE s.paperId=? AND s.kind LIKE 'listening%' AND q.type='mcq'
  ORDER BY q.number""", (PAPER,)).fetchall()

LET = "ABCD"
changes, skips = [], []
for qid, n, correct, oj in rows:
    db = json.loads(oj) if oj else []
    s = src.get(n, {})
    if len(db) != 4 or any(L not in s for L in LET):
        skips.append((n, f"源解析不全 src={list(s.keys())}")); continue
    # 为每个官方字母 L 找最匹配的 db 下标(双射)
    used, new = set(), []
    okmap = True
    for L in LET:
        best, bi = -1, -1
        for i, opt in enumerate(db):
            if i in used: continue
            r = sim(opt, s[L])
            if r > best: best, bi = r, i
        if bi < 0 or best < 0.6:
            okmap = False; break
        used.add(bi); new.append(db[bi])
    if not okmap or len(used) != 4:
        skips.append((n, "双射匹配失败")); continue
    if new == db:
        continue  # 已是正序
    # 校验：correct 字母对应的新选项 == 源卷该字母文本
    ci = LET.index(correct) if correct in LET else -1
    chk = "✓" if ci >= 0 and sim(new[ci], s[correct]) > 0.8 else "✗"
    changes.append((qid, n, correct, db, new, chk))

print(f"=== 2025.12 第1套听力选项重排 {'[APPLY]' if APPLY else '[DRY]'} ===")
print(f"待重排 {len(changes)} 题, 跳过 {len(skips)} 题\n")
for qid, n, correct, db, new, chk in changes:
    print(f"Q{n} 答案{correct} 正确项校验{chk}")
    print(f"   旧: {[o[:22] for o in db]}")
    print(f"   新: {[o[:22] for o in new]}")
if skips:
    print("\n跳过:", skips)

if APPLY and changes:
    for qid, n, correct, db, new, chk in changes:
        if chk != "✓":
            print(f"⚠ Q{n} 正确项校验未过，跳过写入"); continue
        con.execute("UPDATE Question SET optionsJson=? WHERE id=?", (json.dumps(new, ensure_ascii=False), qid))
    con.commit()
    print(f"\n已写入 {sum(1 for c in changes if c[5]=='✓')} 题。")
con.close()
