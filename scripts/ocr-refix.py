#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
通用：把某套真题的干净 OCR 文本(scripts/.ocr-cache/<y>-<mm>-s<set>.paper.txt)结构化写回库。
只改题面/选项/篇章/翻译文字；结构与答案(correct)绝不动(带前后比对断言)。

逐字提取长篇(篇章/段落/翻译)；选项按字母标签解析(列序无关)，并处理「A/B 内联、
C/D 集中列在后」的分栏错位；每题强制断言凑齐 A–D 四项；选词填空篇章/异常项可在
OVERRIDES 内按卷覆盖。

用法：
  python3 scripts/ocr-refix.py 2020 12 1            # 预览
  python3 scripts/ocr-refix.py 2020 12 1 --apply    # 写库
"""
import sqlite3, re, json, sys

DB = "prisma/dev.db"
y, m, s = int(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3])
APPLY = "--apply" in sys.argv
KEY = f"{y}-{m:02d}-s{s}"
OCR = f"scripts/.ocr-cache/{KEY}.paper.txt"

# ---- 每卷特例覆盖(选词填空带空篇章、个别 OCR 错字等)。默认空，按需填。----
OVERRIDES = {
    "2020-12-s1": {
        "char_fix": {"更沟常见": "更为常见", "因沟烹饪": "因为烹饪"},
        "cloze_passage": (
            "In the workplace, too, trust is [26]. An organization without trust will be full of fear and [27]. "
            "If you work for a boss who doesn't trust their employees to do things right, you'll have a [28] time. "
            "They'll be checking up on you all the time, correcting \"mistakes\" and [29] reminding you to do this "
            "or that. Colleagues who don't trust one another will need to spend more time [30] their backs than "
            "doing any useful work.\n"
            "Organizations are always trying to cut costs. Think of all the additional tasks caused by lack of "
            "trust. Audit (审计) departments only exist because of it. Companies keep large volumes of [31] because "
            "they don't trust their suppliers, their contractors or their customers. Probably more than half of "
            "all administrative work is only there because of an ever-existing sense that \"you can't trust anyone "
            "these days.\" If even a small part of such valueless work could be [32], the savings would run into "
            "millions of dollars.\n"
            "All this is extra work we [33] onto ourselves because we don't trust people—the checking, following "
            "through, doing things ourselves because we don't believe others will do them—[34]—or at all. If we "
            "took all that away, how much extra time would we suddenly find in our life? How much of our work [35] "
            "would disappear?"),
    },
    "2020-12-s3": {
        "wordbank_fix": {"M": "promised"},
        "cloze_passage": (
            "The things people make, and the way they make them, determine how cities grow and decline, and "
            "influence how empires rise and fall. So, any disruption to the world's factories—[26]. And that "
            "disruption is surely coming. Factories are being digitised, filled with new sensors and new computers "
            "to make them quicker, more [27], and more efficient.\n"
            "Robots are breaking free from the cages that surround them, learning new skills and new ways of "
            "working. And 3D printers have long [28] a world where you can make anything, anywhere, from a "
            "computerised design. That vision is [29] closer to reality. These forces will lead to cleaner "
            "factories, producing better goods at lower prices, personalised to our individual needs and desires. "
            "Humans will be [30] many of the dirty, repetitive, and dangerous jobs that have long been a [31] of "
            "factory life.\n"
            "Greater efficiency [32] means fewer people can do the same work. Yet factory bosses in many developed "
            "countries are worried about a lack of skilled human workers and see [33] and robots as a solution. "
            "But economist Helena Leurent says this period of rapid change in manufacturing is a [34] opportunity "
            "to make the world a better place. \"Manufacturing is the one system where you have got the biggest "
            "source of innovation, the biggest source of economic growth, and the biggest source of great jobs in "
            "the past. You can see it changing. That's an opportunity to [35] that system differently, and if we "
            "can, it will have tremendous significance.\""),
    },
}
OV = OVERRIDES.get(KEY, {})

# ---------- 读 OCR，剥水印/页脚 ----------
WM = re.compile(
    r"淘宝店铺|微信|公众号|考研工作室|可复制可搜索|打印首选|^\s*四级\s*20\d\d\s*年.*?月.*$"
    r"|^\s*20\d\d\s*年\s*\d+\s*月.*(真题|四级).*$|^\s*第?\s*\d{1,3}\s*页|^\s*\d{1,3}\s*$|https?://")
raw = open(OCR, encoding="utf-8").read().splitlines()
lines = [l for l in raw if not WM.search(l.strip())]
full = "\n".join(lines)
# 行内页眉残留（如「2019 12L4 1」「2019.12L3（第1套）」音轨/页码标记），整体清掉
full = re.sub(r"20\d\d[ .·]*1[0-2]\s*L\s*\d+\s*[（(]?\s*第?\s*[一二三\d]?\s*套?\s*[）)]?[ ]*\d{0,2}", " ", full)
for a, b in OV.get("char_fix", {}).items():
    full = full.replace(a, b)


def between(a, b):
    i = full.find(a)
    if i < 0:
        return ""
    j = full.find(b, i + len(a)) if b else len(full)
    if b and j < 0:
        j = len(full)
    return full[i + len(a):j].strip()


def collapse(t):
    t = t.replace("•", " ").replace("・", " ").replace("·", " ")
    return re.sub(r"\s*\n\s*", " ", re.sub(r"[ \t]{2,}", " ", t)).strip()


def sec_span(text, start_anchor, end_anchor):
    i = text.find(start_anchor)
    if i < 0:
        return ""
    j = text.find(end_anchor, i + len(start_anchor)) if end_anchor else len(text)
    return text[i:j if j > 0 else len(text)]


def findre(pat, s=0):
    mm = re.search(pat, full[s:])
    return s + mm.start() if mm else -1


LIST_RE = r"[Ll]istening\s*Co\w+hension"   # 容忍 Corprehension
READ_RE = r"[Rr]eading\s*Co\w+hension"     # 容忍 ReadingComprehension/Corprehension


OPT_LINE = re.compile(r"^\s*([A-D])\s*(?:[）)]\s*|\s+)(\S.*)$")
QNUM = re.compile(r"^\s*(\d{1,2})\s*[\.、)]")


def parse_options(span_text, qnums):
    """span_text 内按字母解析选项，分配给 qnums(有序)。返回 {qnum:[A,B,C,D]}。"""
    rows = span_text.split("\n")
    # 标注每行：('q',num) 或 ('opt',letter,text)
    seq = []
    for ln in rows:
        mq = QNUM.match(ln)
        mo = OPT_LINE.match(ln)
        if mo and mo.group(1) in "ABCD":
            seq.append(("opt", mo.group(1), mo.group(2).strip()))
        elif mq and int(mq.group(1)) in qnums:
            seq.append(("q", int(mq.group(1))))
            # 题号行内可能还跟着第一个选项 "1. A） ..."
            rest = ln[mq.end():].strip()
            mo2 = OPT_LINE.match(rest if rest.startswith(("A", "B", "C", "D")) else "")
            if mo2:
                seq.append(("opt", mo2.group(1), mo2.group(2).strip()))
    # 按题号区间分配内联选项
    res = {q: {} for q in qnums}
    cur = None
    orphans = []
    for it in seq:
        if it[0] == "q":
            cur = it[1]
        else:
            _, L, txt = it
            if cur is not None and L not in res[cur]:
                res[cur][L] = txt
            else:
                orphans.append((L, txt))  # 题号后/重复 → 待分配的集中块(C/D)
    # 分栏错位：把 orphans 顺序填进缺字母的题
    incomplete = [q for q in qnums if len(res[q]) < 4]
    oi = 0
    for q in incomplete:
        for L in "ABCD":
            if L not in res[q]:
                # 找下一个该字母的 orphan
                while oi < len(orphans) and orphans[oi][0] != L:
                    oi += 1
                if oi < len(orphans):
                    res[q][L] = orphans[oi][1]; oi += 1
    out = {}
    for q in qnums:
        d = res[q]
        out[q] = [d.get(L, "⟨缺⟩") for L in "ABCD"]
    # 应用 opt_override
    for q, opts in OV.get("opt_override", {}).items():
        if q in out:
            out[q] = opts
    return out


# ---------- DB 现状 ----------
con = sqlite3.connect(DB); con.row_factory = sqlite3.Row
pid = con.execute("SELECT id FROM Paper WHERE year=? AND month=? AND setNo=? AND source='real'", (y, m, s)).fetchone()["id"]
SEC = {}
for r in con.execute('SELECT id,kind,"order" FROM Section WHERE paperId=? ORDER BY "order"', (pid,)):
    SEC.setdefault(r["kind"], []).append(dict(r))
def qnums(sid):
    return [r["number"] for r in con.execute("SELECT number FROM Question WHERE sectionId=? ORDER BY number", (sid,))]

content = {}   # 计划写入

# ---------- Writing ----------
wb = between("Writing", "Listening Comprehension")
wd = collapse(re.sub(r"^（?\s*\d+\s*minutes\s*）?", "", wb).strip())
wd = re.sub(r"\s*Part\s+[IVXⅠⅡⅢⅣ]+\s*$", "", wd).strip().replace("Trans portation", "Transportation")
content["writing"] = {"instruction": wd, "passage": re.sub(r"^Directions:\s*", "", wd)}

# ---------- Listening A/B/C（set3 卷听力为空，跳过）----------
li0, rd0 = findre(LIST_RE), findre(READ_RE)
sa1 = full.find("Section A")  # 个别卷 OCR 把 Section A 排在 "Listening Comprehension" 之前
li_start = min([p for p in (li0, sa1) if p >= 0], default=-1)
lc = full[li_start:rd0] if (li_start >= 0 and rd0 > li_start) else ""
def secqn(kind):
    secs = SEC.get(kind, [])
    return (secs[0]["id"], qnums(secs[0]["id"])) if secs else (None, [])
for kind, (a, b) in [("listening_news", ("Section A", "Section B")),
                     ("listening_conv", ("Section B", "Section C")),
                     ("listening_passage", ("Section C", None))]:
    sid, ns = secqn(kind)
    if ns and lc:
        content[kind] = {"opts": parse_options(sec_span(lc, a, b), ns)}

# ---------- Reading A 选词填空 ----------
rc = full[findre(READ_RE):] if findre(READ_RE) >= 0 else full
# 词库 A–O
wb_letters = "ABCDEFGHIJKLMNO"
wbres = []
wbspan = sec_span(rc, "Section A", "Section B")
for L in wb_letters:
    mm = re.search(r"(?m)^\s*" + L + r"\s*[）)]?\s*([a-z][a-zA-Z\-]{2,})\s*$", wbspan)
    wbres.append((L, mm.group(1).strip() if mm else "⟨缺⟩"))
for L, w in OV.get("wordbank_fix", {}).items():
    wbres = [(x, w if x == L else ww) for x, ww in wbres]
if OV.get("wordbank"):
    wbres = list(zip(wb_letters, OV["wordbank"]))
cloze_instr = re.split(r"(?<=once\.)", collapse(wbspan[:300]))[0]
cloze_instr = re.sub(r"^.*?Directions[:：]\s*", "Directions: ", cloze_instr).strip()

# 自动重建带空篇章：篇章在 directions 与词库之间；把孤立/行内的 26–35 替换成 [N]
def build_cloze(region):
    parts = []
    for ln in region.split("\n"):
        s = ln.strip()
        if not s:
            continue
        mfull = re.fullmatch(r"[\(（]?\s*(2[6-9]|3[0-5])\s*[•·．.)）_\-]*\s*", s)
        if mfull:
            parts.append(f"[{mfull.group(1)}]"); continue
        s = re.sub(r"[_]*\s*(2[6-9]|3[0-5])\s*[•·]", lambda mo: f" [{mo.group(1)}] ", s)
        parts.append(s)
    return collapse(" ".join(parts))
dir_end = wbspan.find("more than once")
dir_end = wbspan.find("\n", dir_end) if dir_end >= 0 else 0
wbm0 = re.search(r"(?m)^\s*[A-O]\s*[）)]?\s*[a-z][a-zA-Z\-]{2,}\s*$", wbspan)
wb_start = wbm0.start() if wbm0 else len(wbspan)
auto_cloze = build_cloze(wbspan[dir_end:wb_start])
cloze_passage = OV.get("cloze_passage") or auto_cloze
content["banked_cloze"] = {"wordbank": wbres, "passage": cloze_passage, "instruction": cloze_instr}

# ---------- Reading B 信息匹配 ----------
# 标题：Section B 后、首段(A）)前的非 Directions 行
mb = sec_span(rc, "Section B", "Section C")
m_instr = collapse(re.split(r"(?m)^\s*A\s*[）)]", mb)[0])
m_instr = re.sub(r"^Directions:\s*", "Directions: ", m_instr)
# 标题 = instruction 末尾一行(在 Directions 之后、A 段之前) —— 取最后一段较短的非指令行
title_cand = [l.strip() for l in mb.split("\n") if l.strip() and not l.strip().startswith(("Direction", "A）", "A)"))]
# 段落 A..(到 O 或 P)
plet = "ABCDEFGHIJKLMNOP"
mregion = mb
positions = []
for L in plet:
    mm = re.search(r"(?m)^\s*" + L + r"(?:[）)]|\s)\s*(?=[A-Z“\"])", mregion)
    positions.append((L, mm.start() if mm else -1))
positions = [(L, p) for L, p in positions if p >= 0]
paras = []
for idx, (L, pos) in enumerate(positions):
    end = positions[idx + 1][1] if idx + 1 < len(positions) else len(mregion)
    body = re.sub(r"(?m)^\s*" + L + r"(?:[）)]|\s)\s*", "", mregion[pos:end], count=1)
    paras.append((L, collapse(body)))
if OV.get("para_override"):
    d = dict(paras); d.update(OV["para_override"]); paras = sorted(d.items())
# 标题：A 段之前最后一个不含 Directions 关键词的短行
pre_A = mregion[:positions[0][1]] if positions else mregion
title = ""
for l in reversed([x.strip() for x in pre_A.split("\n") if x.strip()]):
    if "Direction" not in l and "Sheet" not in l and "paragraph" not in l.lower() and len(l) < 80:
        title = l; break
title = OV.get("title", title)
content["matching"] = {"instruction": m_instr, "title": title, "paragraphs": paras,
                       "stmts": None}  # 陈述下面补
# 陈述 36–45：matching 区之后到 Section C 之间，按题号
stmt_span = mb
stmts = {}
for mm in re.finditer(r"(?m)^\s*(3[6-9]|4[0-5])\s*[\.、]\s*(.+)$", stmt_span):
    stmts[int(mm.group(1))] = collapse(mm.group(2))
stmts.update({int(k): v for k, v in OV.get("stmt_override", {}).items()})
content["matching"]["stmts"] = stmts

# ---------- Reading C 仔细阅读（按位置切；部分卷无此节，跳过）----------
cr_secs = SEC.get("careful_reading", [])
if len(cr_secs) >= 2:
    cr = sec_span(rc, "Section C", None)
    fp = "following passage."
    i1 = cr.find(fp)
    i2 = cr.find(fp, i1 + 1) if i1 >= 0 else -1
    q46 = cr.find("46.", i1) if i1 >= 0 else -1
    q51 = cr.find("51.", i2) if i2 >= 0 else -1
    P1 = cr[i1 + len(fp): q46] if q46 >= 0 else ""
    P2 = cr[i2 + len(fp): q51] if q51 >= 0 else ""
    span1 = cr[i1:i2] if i2 >= 0 else cr[i1:]
    span2 = cr[i2:] if i2 >= 0 else ""
    def stems_from(span, ns):
        st = {}
        for mm in re.finditer(r"(?m)^\s*(\d{2})\s*[\.、]\s*(.+?)\s*$", span):
            if int(mm.group(1)) in ns:
                st[int(mm.group(1))] = collapse(mm.group(2))
        return st, parse_options(span, ns)
    ns1 = qnums(cr_secs[0]["id"]); ns2 = qnums(cr_secs[1]["id"])
    st1, op1 = stems_from(span1, ns1)
    st2, op2 = stems_from(span2, ns2)
    content["careful_reading"] = [
        {"order": cr_secs[0]["order"], "passage": collapse(P1), "stems": st1, "opts": op1},
        {"order": cr_secs[1]["order"], "passage": collapse(P2), "stems": st2, "opts": op2},
    ]

# ---------- Translation ----------
tb = between("translate a passage from Chinese into English", None)
zh = tb
k = re.search(r"[一-鿿]", zh)
zh = zh[k.start():] if k else zh
content["translation"] = {
    "instruction": "Directions: For this part, you are allowed 30 minutes to translate a passage from Chinese into English. You should write your answer on Answer Sheet 2.",
    "passage": collapse(zh)}

# ================= 预览 =================
def h(x, n=110): return (x or "")[:n].replace("\n", "⏎")
print(f"───── {KEY} 预览 ─────")
print("写作:", h(content["writing"]["instruction"]))
for k_ in ["listening_news", "listening_conv", "listening_passage"]:
    if k_ in content:
        bad = [q for q, o in content[k_]["opts"].items() if "⟨缺⟩" in o or len(set(o)) < 4]
        print(f"{k_}: {len(content[k_]['opts'])}题  异常题={bad or '无'}")
    else:
        print(f"{k_}: (空/跳过)")
print("词库:", " ".join(f"{l}={w}" for l, w in content['banked_cloze']['wordbank']))
_blanks = sorted(int(x) for x in re.findall(r"\[(\d+)\]", content['banked_cloze']['passage']))
print(f"选词空位({len(_blanks)}/10): {_blanks}  passage:", h(content['banked_cloze']['passage'], 60))
print("匹配title:", content["matching"]["title"])
print("匹配段落:", " ".join(f"{L}({len(t)})" for L, t in content["matching"]["paragraphs"]))
print("匹配陈述:", sorted(content["matching"]["stmts"].keys()))
for sec in content.get("careful_reading", []):
    bad = [q for q, o in sec["opts"].items() if "⟨缺⟩" in o or len(set(o)) < 4]
    print(f"careful#{sec['order']}: P({len(sec['passage'])}字) stems={sorted(sec['stems'])} 异常={bad or '无'}")
print("翻译:", h(content["translation"]["passage"]))

if not APPLY:
    print("\n(预览模式，未写库)"); con.close(); sys.exit(0)

# ================= 写库（逐节弹性：合格的节才写，不合格的跳过并报告；correct 绝不动）=================
def set_section(sid, **f):
    cols = ", ".join(f'"{k}"=?' for k in f)
    con.execute(f"UPDATE Section SET {cols} WHERE id=?", (*f.values(), sid))
def opts_ok(sid, mapping):
    qs = [r["number"] for r in con.execute("SELECT number FROM Question WHERE sectionId=? ORDER BY number", (sid,))]
    return len(qs) == len(mapping) and all(len(mapping.get(n, [])) == 4 and "⟨缺⟩" not in mapping[n] for n in qs)
def stems_ok(sid, mapping):
    qs = [r["number"] for r in con.execute("SELECT number FROM Question WHERE sectionId=? ORDER BY number", (sid,))]
    return all(n in mapping and mapping[n] for n in qs)
def put_options(sid, mapping):
    for q in con.execute("SELECT id,number FROM Question WHERE sectionId=? ORDER BY number", (sid,)):
        con.execute("UPDATE Question SET optionsJson=? WHERE id=?", (json.dumps(mapping[q["number"]], ensure_ascii=False), q["id"]))
def put_stems(sid, mapping):
    for q in con.execute("SELECT id,number FROM Question WHERE sectionId=? ORDER BY number", (sid,)):
        con.execute("UPDATE Question SET stem=? WHERE id=?", (mapping[q["number"]], q["id"]))

before = {r["id"]: r["correct"] for r in con.execute(
    "SELECT q.id,q.correct FROM Question q JOIN Section s ON q.sectionId=s.id WHERE s.paperId=?", (pid,))}
done, skip = [], []

set_section(SEC["writing"][0]["id"], instruction=content["writing"]["instruction"], passage=content["writing"]["passage"]); done.append("writing")
for k_ in ["listening_news", "listening_conv", "listening_passage"]:
    if k_ not in content:
        continue
    sid = SEC[k_][0]["id"]
    if opts_ok(sid, content[k_]["opts"]):
        put_options(sid, content[k_]["opts"]); done.append(k_)
    else:
        bad = [q for q, o in content[k_]["opts"].items() if len(set(o)) < 4 or "⟨缺⟩" in o]
        skip.append(f"{k_}(选项缺:{bad})")

bc = content["banked_cloze"]
nbl = len(set(re.findall(r"\[(\d+)\]", bc["passage"])))
wb_ok = all(w != "⟨缺⟩" for _, w in bc["wordbank"])
if nbl == 10 and "⟨" not in bc["passage"] and wb_ok:
    set_section(SEC["banked_cloze"][0]["id"], instruction=bc["instruction"], passage=bc["passage"],
                wordBankJson=json.dumps([{"letter": l, "word": w} for l, w in bc["wordbank"]], ensure_ascii=False)); done.append("banked_cloze")
else:
    skip.append(f"banked_cloze(空位{nbl}/10,词库{'全' if wb_ok else '缺'})")

mt = content["matching"]
mp_ok = len(mt["paragraphs"]) >= 8 and all(t for _, t in mt["paragraphs"]) and bool(mt["title"])
sid = SEC["matching"][0]["id"]
if mp_ok:
    set_section(sid, instruction=mt["instruction"], title=mt["title"],
                paragraphsJson=json.dumps([{"letter": l, "text": t} for l, t in mt["paragraphs"]], ensure_ascii=False))
    if stems_ok(sid, mt["stmts"]):
        put_stems(sid, mt["stmts"]); done.append("matching")
    else:
        done.append("matching(段落,陈述缺)")
else:
    skip.append("matching(段落/标题缺)")

for i, sec in enumerate(content.get("careful_reading", [])):
    sid = cr_secs[i]["id"]
    set_section(sid, passage=sec["passage"])
    if stems_ok(sid, sec["stems"]) and opts_ok(sid, sec["opts"]):
        put_stems(sid, sec["stems"]); put_options(sid, sec["opts"]); done.append(f"careful#{sec['order']}")
    else:
        skip.append(f"careful#{sec['order']}(题干/选项缺)")

set_section(SEC["translation"][0]["id"], instruction=content["translation"]["instruction"], passage=content["translation"]["passage"]); done.append("translation")

after = {r["id"]: r["correct"] for r in con.execute(
    "SELECT q.id,q.correct FROM Question q JOIN Section s ON q.sectionId=s.id WHERE s.paperId=?", (pid,))}
assert before == after, "❌ 答案被改动，已回滚"
con.commit(); con.close()
print(f"\n✅ {KEY} 已写 {len(done)} 节: {done}")
if skip:
    print(f"⚠ 跳过 {len(skip)} 节(保留原样,待补): {skip}")
