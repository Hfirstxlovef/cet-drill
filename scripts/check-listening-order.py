#!/usr/bin/env python3
# 检测听力(及任意 mcq)选项顺序是否与源卷 A/B/C/D 一致。
# 用法: python3 scripts/check-listening-order.py <paperId> <源真题PDF路径>
# 思路: pdftotext -layout 源卷 -> 按「N.」分组、收集其后的 A)/B)/C)/D) 选项(有序) ->
#       与 DB optionsJson(下标0..3=A..D) 逐题逐项比对; 报告顺序不一致的题。
import sys, re, json, sqlite3, subprocess, os

paperId, pdf = sys.argv[1], sys.argv[2]
DB = os.path.join(os.path.dirname(__file__), "..", "prisma", "dev.db")

txt = subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True, text=True).stdout

# 解析源卷: 收集每题号后的 A)-D) 选项文本(按出现顺序)
# 兼容单栏(每行一个"A) text")与双栏(同一行 "A) t1   C) t3")
src = {}            # number -> [optA, optB, optC, optD] (按源卷字母序)
cur = None
def push_opts(line):
    # 找出本行所有 "X) 文本" 片段(X=A-D)，按字母归位
    for m in re.finditer(r'\b([A-D])\)\s*(.*?)(?=\s{2,}[A-D]\)|$)', line):
        letter, body = m.group(1), m.group(2).strip()
        if cur is None or not body:
            continue
        src.setdefault(cur, {})[letter] = body

for raw in txt.splitlines():
    line = raw.rstrip()
    mnum = re.match(r'\s*(\d{1,2})[.．]\s', line)
    if mnum:
        n = int(mnum.group(1))
        if 1 <= n <= 55:
            cur = n
    if re.search(r'\b[A-D]\)', line):
        push_opts(line)

# 取 DB 的 mcq 选项
con = sqlite3.connect(DB)
rows = con.execute("""
  SELECT q.number, q.correct, q.optionsJson, s.kind
  FROM Question q JOIN Section s ON q.sectionId=s.id
  WHERE s.paperId=? AND q.type='mcq' ORDER BY q.number
""", (paperId,)).fetchall()

LET = "ABCD"
def norm(s):
    return re.sub(r'\s+', ' ', (s or '')).strip().rstrip('.').lower()

bad, ok, nosrc = [], [], []
for number, correct, oj, kind in rows:
    db = json.loads(oj) if oj else []
    s = src.get(number, {})
    src_ordered = [s.get(L, '') for L in LET]
    if len([x for x in src_ordered if x]) < 4 or len(db) < 4:
        nosrc.append(number); continue
    # db[i] 对应源卷的哪个字母
    mapping = ''.join(next((L for L in LET if norm(db[i]) == norm(s.get(L, ''))), '?') for i in range(4))
    if '?' in mapping:
        nosrc.append(number)            # 源/DB 文本没对上 → 检测器解析不全，不下结论
    elif mapping == 'ABCD':
        ok.append(number)               # 顺序与源卷一致
    else:
        bad.append((number, kind, correct, mapping))  # 四字母齐全但非 ABCD → 真实乱序

print(f"paper {paperId}: 顺序一致 {len(ok)} 题, 真实乱序 {len(bad)} 题, 解析不全(不计) {len(nosrc)} 题")
if bad:
    print("  乱序题(DB下标0123实际对应源卷字母):")
    for n, kind, correct, mp in bad:
        print(f"   Q{n} [{kind}] DB答案={correct} | DB顺序↔源卷={mp}")
if nosrc:
    print(f"  解析不全(忽略): {nosrc}")
