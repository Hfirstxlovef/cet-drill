#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从零 OCR 入库：把当初跳过(字符碎裂/扫描)的卷用 Vision OCR 文本结构化建库。
零 zenmux —— 结构化由本解析器(规则)完成，答案/选词篇章由窗口里的我读出后填进 CONFIG。
CET-4 结构固定：写作/听力A(1-7)B(8-15)C(16-25)/选词(26-35)/匹配(36-45)/仔细阅读(46-50,51-55)/翻译。

用法：python3 scripts/ocr-ingest.py 2024 12 1 [--apply]
  需先有 OCR 缓存 scripts/.ocr-cache/<y>-<mm>-s<set>.paper.txt
"""
import sqlite3, re, json, sys, os, binascii

y, m, s = int(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3])
APPLY = "--apply" in sys.argv
KEY = f"{y}-{m:02d}-s{s}"

CONFIG = {
    (2024, 12, 1): {
        "answers": {1:"A",2:"D",3:"D",4:"A",5:"B",6:"C",7:"B",8:"C",9:"D",10:"A",11:"C",12:"A",13:"B",14:"C",15:"B",
                    16:"C",17:"D",18:"A",19:"B",20:"B",21:"C",22:"D",23:"A",24:"D",25:"C",
                    26:"N",27:"I",28:"F",29:"E",30:"H",31:"A",32:"L",33:"B",34:"J",35:"C",
                    36:"E",37:"H",38:"B",39:"L",40:"G",41:"C",42:"K",43:"A",44:"I",45:"F",
                    46:"C",47:"A",48:"B",49:"C",50:"D",51:"B",52:"D",53:"B",54:"D",55:"A"},
        "wordbank": ["actually","approximately","assume","component","comprehend","deteriorate","equivalent",
                     "journey","literary","performed","rarely","sample","undermined","unique","unit"],
        "cloze_passage": (
            "When Toni Morrison died in 2019, the world lost one of its most influential authors. But Morrison was "
            "not an early success. Her first novel was not published until she was 39, and her last appeared when "
            "she was 84. And Morrison was not [26] in this regard. Numerous writers produce masterpieces well into "
            "their 70s and beyond. Such [27] accomplishments highlight an important point. Our capacity to speak, "
            "write and learn new vocabulary does not seem to [28] with age. Our eyesight may dim and our recall may "
            "weaken, but, by comparison, our ability to produce and [29] language is well preserved into older "
            "adulthood. Indeed, the latest research that has emerged on language and ageing shows that language "
            "mastery is a [30] that we begin as infants and continue on for the rest of our lives. Some aspects of "
            "our language abilities, such as our knowledge of word meanings, [31] improve during middle and late "
            "adulthood. One study, for example, found that adults over sixty had an average vocabulary size of over "
            "21,000 words. The researchers also studied a [32] of college students and found that their average "
            "vocabulary contained [33] 16,000 words. In another study, older adults, with an average age of 75, [34] "
            "better than participants in their youth or middle years on tasks that required them to determine the "
            "meaning of words. Thus, language seems to be a skill that, contrary to what many might [35], does not "
            "weaken with age."),
        "char_fix": {},
    },
    (2024, 12, 2): {
        "answers": {1:"C",2:"A",3:"C",4:"D",5:"B",6:"B",7:"A",8:"B",9:"D",10:"A",11:"B",12:"C",13:"D",14:"C",15:"A",
                    16:"B",17:"D",18:"C",19:"B",20:"A",21:"D",22:"A",23:"D",24:"B",25:"C",
                    26:"L",27:"D",28:"K",29:"M",30:"B",31:"A",32:"I",33:"N",34:"C",35:"O",
                    36:"B",37:"J",38:"E",39:"L",40:"G",41:"D",42:"K",43:"A",44:"H",45:"C",
                    46:"B",47:"A",48:"B",49:"D",50:"C",51:"A",52:"D",53:"A",54:"C",55:"B"},
        "wordbank": ["adaptable","closed","distribution","interact","narration","neutral","permanently","prescribes",
                     "readily","registered","reinforces","revealed","significant","specific","speculate"],
        "cloze_passage": (
            "Scientists have known that depriving adult mice of vision can increase the sensitivity of individual "
            "neurons (神经元) in the part of the brain devoted to hearing. New research from biologists at the "
            "University of Maryland [26] that sight deprivation also changes the way brain cells [27] with one "
            "another, shifting the mice's sensitivity to different frequencies. \"This study [28] what we are "
            "learning about how manipulating vision can have a [29] effect on the ability of an animal to hear long "
            "after the window for auditory (听觉的) learning was thought to have [30],\" said Patrick Kanold, senior "
            "author of the study. It was once thought that the sensory regions of the brain were not [31] after a "
            "critical period in childhood. This is why children learn languages much more [32] than adults. Kanold's "
            "earlier research disproved this idea by showing that depriving adult mice of vision for a short period "
            "increased the sensitivity of individual neurons in the auditory cortex (皮质), which is devoted to "
            "hearing. Young brains wire themselves according to the sounds they hear frequently, assigning areas of "
            "the auditory cortex to [33] frequencies based on what they are used to hearing. The researchers found "
            "that, in adult mice, a week in the dark also changed the [34] of space to different frequencies. \"We "
            "don't know why we are seeing these patterns,\" Kanold said. \"We [35] that it may have to do with what "
            "the mice are paying attention to while they are in the dark.\""),
        "char_fix": {},
    },
    (2024, 12, 3): {
        "no_listening": True,
        "answers": {26:"J",27:"K",28:"C",29:"F",30:"A",31:"L",32:"G",33:"D",34:"B",35:"I",
                    36:"C",37:"J",38:"F",39:"A",40:"E",41:"K",42:"G",43:"B",44:"I",45:"D",
                    46:"A",47:"B",48:"C",49:"D",50:"B",51:"A",52:"C",53:"B",54:"D",55:"A"},
        "wordbank": ["accurate","allow","artificial","cheating","deserted","establish","extremely","immediately",
                     "incorrectly","normal","observed","passed","reminding","repairable","resolve"],
        "cloze_passage": (
            "Super realistic masks are made from flexible materials such as silicone and are designed to imitate "
            "real human faces—down to every last detail. In a study by the Universities of York and Kyoto, "
            "researchers asked participants to look at pairs of photographs and decide which showed a [26] face and "
            "which showed a person wearing a mask. Surprisingly, participants made the wrong call in one-in-five "
            "cases. The 20% error rate [27] in the study likely underestimates the extent to which people would "
            "struggle to tell an [28] face from the real thing outside of the lab. The researchers collected data "
            "from participants from both the UK and Japan to [29] any differences according to race. When trial "
            "participants were asked to choose between photographs of faces of a different race from theirs, "
            "response times were slower and selections were 5% less [30]. There are now dozens of criminal cases in "
            "which offenders have [31] themselves off as people of a different age, race or gender, sending police "
            "investigations down the wrong path. In one recent case, an international gang used an [32] realistic "
            "mask to pose as a French minister, [33] business executives out of millions of pounds. Dr Jet Sanders, "
            "who worked on the study while a PhD student at the University of York, said: \"Failure to detect "
            "synthetic faces may have important implications for security and crime prevention, as super realistic "
            "masks may [34] the key characteristics of a person's appearance to be [35].\""),
        "char_fix": {"1orice": "write"},
    },
    (2016, 12, 1): {
        "cloze_passage": (
            "Many men and women have long bought into the idea that there are \"male\" and \"female\" brains, "
            "believing that explains just about every difference between the sexes. A new study [26] that belief, "
            "questioning whether brains really can be distinguished by gender. In the study, Tel Aviv University "
            "researchers [27] for sex differences throughout the entire human brain. And what did they find? Not "
            "much. Rather than offer evidence for [28] brains as \"male\" or \"female,\" research shows that brains "
            "fall into a wide range, with most people falling right in the middle. Daphna Joel, who led the study, "
            "said her research found that while there are some gender-based [29], many different types of brain "
            "can't always be distinguished by gender. While the \"average\" male and \"average\" female brains were "
            "[30] different, you couldn't tell it by looking at individual brain scans. Only a small [31] of people "
            "had \"all-male\" or \"all-female\" characteristics. Larry Cahill, an American neuroscientist (神经科学家), "
            "said the study is an important addition to a growing body of research questioning [32] beliefs about "
            "gender and brain function. But he cautioned against concluding from this study that all brains are the "
            "same, [33] of gender. \"There's a mountain of evidence [34] the importance of sex influences at all "
            "levels of brain function,\" he told The Seattle Times. If anything, he said, the study [35] that gender "
            "plays a very important role in the brain—\"even when we are not clear exactly how.\""),
    },
    (2016, 6, 1): {
        "char_fix": {"Homeand Contentment,Too": "Home and Contentment, Too"},
        "cloze_passage": (
            "Physical activity does the body good, and there's growing evidence that it helps the brain too. "
            "Researchers in the Netherlands report that children who get more exercise, whether at school or on "
            "their own, [26] to have higher GPAs and better scores on standardized tests. In a [27] of 14 studies "
            "that looked at physical activity and academic [28], investigators found that the more children moved, "
            "the better their grades were in school, [29] in the basic subjects of math, English and reading. The "
            "data will certainly fuel the ongoing debate over whether physical education classes should be cut as "
            "schools struggle to [30] on smaller budgets. The arguments against physical education have included "
            "concerns that gym time may be taking away from study time. With standardized test scores in the U.S. "
            "[31] in recent years, some administrators believe students need to spend more time in the classroom "
            "instead of on the playground. But as these findings show, exercise and academics may not be [32] "
            "exclusive. Physical activity can improve blood [33] to the brain, fueling memory, attention and "
            "creativity, which are [34] to learning. And exercise releases hormones that can improve [35] and "
            "relieve stress, which can also help learning. So while it may seem as if kids are just exercising "
            "their bodies when they're running around, they may actually be exercising their brains as well."),
    },
}
cfg = CONFIG.get((y, m, s), {})
_A = cfg.get("answers")
if _A:
    A = {int(k): v for k, v in _A.items()}
else:                                    # 走 zenmux 的 get-answers.ts 产出的答案
    A = {int(k): v for k, v in json.load(open(f"scripts/.ocr-cache/{KEY}.answers.json"))["answers"].items()}
NOLIS = cfg.get("no_listening") or not any(n <= 25 for n in A)   # 无 1-25 答案=set3 残卷,无听力

# ---------- 读 OCR + 清洗 ----------
OCR = f"scripts/.ocr-cache/{KEY}.paper.txt"
WM = re.compile(r"淘宝店铺|微信|公众号|考研工作室|可复制可搜索|打印首选|准考证|姓名|答题卡|四级试题|^\s*[•·]\s*\d+\s*[•·]\s*$|^\s*20\d\d-\d+\s*四级|^\s*\d{1,3}\s*$|https?://")
raw = open(OCR, encoding="utf-8").read().splitlines()
full = "\n".join(l for l in raw if not WM.search(l.strip()))
full = re.sub(r"\s*\d{0,3}\s*[·・•]?\s*20\d\d\s*年\s*\d{1,2}\s*月\s*(?:大\s*学\s*英\s*语)?\s*四\s*级\s*真\s*题\s*[（(][^）)\n]{0,16}[）)]\s*[·・•»«,，\xad]?\s*\d{0,3}", " ", full)
for a, b in cfg.get("char_fix", {}).items():
    full = full.replace(a, b)


def collapse(t):
    t = t.replace("•", " ").replace("・", " ").replace("·", " ")
    return re.sub(r"\s*\n\s*", " ", re.sub(r"[ \t]{2,}", " ", t)).strip()


def findre(pat):
    mm = re.search(pat, full)
    return mm.start() if mm else -1


def sec_span(text, a, b):
    i = text.find(a)
    if i < 0:
        return ""
    j = text.find(b, i + len(a)) if b else len(text)
    return text[i:j if j > 0 else len(text)]


OPT_LINE = re.compile(r"^\s*([A-D])\s*(?:[）)]\s*|\s+)(\S.*)$")
QNUM = re.compile(r"^\s*(\d{1,2})\s*[\.、)]")


def parse_options(span_text, qnums):
    rows = span_text.split("\n")
    seq = []
    for ln in rows:
        work = ln
        mq = QNUM.match(work)
        if mq and int(mq.group(1)) in qnums:
            seq.append(("q", int(mq.group(1))))
            work = work[mq.end():]
        # 一行内找全部「X）text」段(处理 2-栏把 B/D 排同一行)
        segs = list(re.finditer(r"([A-D])\s*[）)]\s*(\S.*?)(?=\s+[A-D]\s*[）)]|$)", work))
        if segs:
            for mo in segs:
                seq.append(("opt", mo.group(1), mo.group(2).strip()))
        else:
            mo = OPT_LINE.match(work)
            if mo and mo.group(1) in "ABCD":
                seq.append(("opt", mo.group(1), mo.group(2).strip()))
    res = {q: {} for q in qnums}
    cur, orphans = None, []
    for it in seq:
        if it[0] == "q":
            cur = it[1]
        else:
            _, L, txt = it
            if cur is not None and L not in res[cur]:
                res[cur][L] = txt
            else:
                orphans.append((L, txt))
    incomplete = [q for q in qnums if len(res[q]) < 4]
    oi = 0
    for q in incomplete:
        for L in "ABCD":
            if L not in res[q]:
                while oi < len(orphans) and orphans[oi][0] != L:
                    oi += 1
                if oi < len(orphans):
                    res[q][L] = orphans[oi][1]; oi += 1
    return {q: [res[q].get(L, "⟨缺⟩") for L in "ABCD"] for q in qnums}


def stems_from(span, ns):
    st = {}
    for mm in re.finditer(r"(?m)^\s*(\d{2})\s*[\.、]\s*(.+?)\s*$", span):
        if int(mm.group(1)) in ns:
            st[int(mm.group(1))] = collapse(mm.group(2))
    return st


# ---------- 解析各节(固定结构) ----------
content = {}
# 写作
wb_ = sec_span(full, "Writing", "Listening")
wd = collapse(wb_.replace("Writing", "", 1))
wd = wd[wd.find("Directions"):] if "Directions" in wd else wd       # 去开考说明等前缀
mcjk = re.search(r"[一-鿿]", wd)
if mcjk:
    wd = wd[:mcjk.start()].strip()                                  # 写作指令是纯英文，遇中文(答题卡/答案速查)即截断
wd = re.sub(r"\s*Part\s+[IVXⅠⅡⅢⅣJ]+\s*$", "", wd).strip().replace("word.s", "words")
content["writing"] = (wd, re.sub(r"^Directions:\s*", "", wd))

# 听力 A/B/C
li = findre(r"[Ll]istening\s*Co\w+hension")
sa = full.find("Section A")
li0 = min([p for p in (li, sa) if p >= 0], default=-1)
rd = findre(r"[Rr]eading\s*Co\w+hension")
lc = full[li0:rd] if li0 >= 0 and rd > li0 else ""
if not NOLIS:
    content["listening_news"] = parse_options(sec_span(lc, "Section A", "Section B"), list(range(1, 8)))
    content["listening_conv"] = parse_options(sec_span(lc, "Section B", "Section C"), list(range(8, 16)))
    content["listening_passage"] = parse_options(sec_span(lc, "Section C", None), list(range(16, 26)))

# 选词填空
rc = full[rd:] if rd >= 0 else full
wbspan = sec_span(rc, "Section A", "Section B")
# 词库 A-O：cfg 优先，否则从 OCR 解析
if cfg.get("wordbank"):
    wbk = list(cfg["wordbank"])
else:
    wbk = []
    for L in "ABCDEFGHIJKLMNO":
        mm = re.search(r"(?m)^\s*" + L + r"\s*[）)]?\s*([a-z][a-zA-Z\-]{2,})\s*$", wbspan)
        wbk.append(mm.group(1) if mm else "⟨缺⟩")
# 带空篇章：cfg 优先，否则按漂浮数字自动插 [26]…[35]
def build_cloze(region):
    parts = []
    for ln in region.split("\n"):
        sln = ln.strip()
        if not sln:
            continue
        mf = re.fullmatch(r"[\(（]?\s*(2[6-9]|3[0-5])\s*[•·．.)）_\-]*\s*", sln)
        if mf:
            parts.append(f"[{mf.group(1)}]"); continue
        parts.append(re.sub(r"[_]*\s*(2[6-9]|3[0-5])\s*[•·]", lambda mo: f" [{mo.group(1)}] ", sln))
    return collapse(" ".join(parts))
wbm0 = re.search(r"(?m)^\s*[A-O]\s*[）)]?\s*[a-z][a-zA-Z\-]{2,}\s*$", wbspan)
wb_start = wbm0.start() if wbm0 else len(wbspan)
de_ = wbspan.find("more than once"); de_ = wbspan.find("\n", de_) + 1 if de_ >= 0 else 0
cp = cfg.get("cloze_passage") or build_cloze(wbspan[de_:wb_start])
cloze_instr = re.split(r"(?<=once\.)", collapse(wbspan[:320]))[0]
cloze_instr = re.sub(r"^.*?Directions[:：]\s*", "Directions: ", cloze_instr).strip()
content["banked_cloze"] = (cloze_instr, cp, wbk)

# 信息匹配
mb = sec_span(rc, "Section B", "Section C")
m_instr = collapse(re.split(r"(?m)^\s*A\s*[）)]", mb)[0])
plet = "ABCDEFGHIJKLMNOP"
positions = [(L, re.search(r"(?m)^\s*" + L + r"(?:[）)]|\s)\s*(?=[A-Z“\"])", mb).start())
             for L in plet if re.search(r"(?m)^\s*" + L + r"(?:[）)]|\s)\s*(?=[A-Z“\"])", mb)]
paras = []
for idx, (L, pos) in enumerate(positions):
    end = positions[idx + 1][1] if idx + 1 < len(positions) else len(mb)
    body = re.sub(r"(?m)^\s*" + L + r"(?:[）)]|\s)\s*", "", mb[pos:end], count=1)
    paras.append((L, collapse(body)))
pre = mb[:positions[0][1]] if positions else mb
de = mb.find("Answer Sheet 2"); de = mb.find("\n", de) if de >= 0 else 0
after = mb[de:positions[0][1]] if positions else mb[de:]
title = next((l.strip() for l in after.split("\n") if l.strip() and "Sheet" not in l and "paragraph" not in l.lower() and len(l.strip()) < 95), "")
stmts = {int(mm.group(1)): collapse(mm.group(2)) for mm in re.finditer(r"(?m)^\s*(3[6-9]|4[0-5])\s*[\.、]\s*(.+)$", mb)}
content["matching"] = (m_instr, title, paras, stmts)

# 仔细阅读
cr = sec_span(rc, "Section C", None)
fp = "following passage."
i1 = cr.find(fp); i2 = cr.find(fp, i1 + 1) if i1 >= 0 else -1
P1 = cr[i1 + len(fp):cr.find("46.", i1)] if i1 >= 0 else ""
P2 = cr[i2 + len(fp):cr.find("51.", i2)] if i2 >= 0 else ""
sp1 = cr[i1:i2] if i2 >= 0 else cr[i1:]; sp2 = cr[i2:] if i2 >= 0 else ""
content["careful"] = [(collapse(P1), stems_from(sp1, range(46, 51)), parse_options(sp1, list(range(46, 51)))),
                      (collapse(P2), stems_from(sp2, range(51, 56)), parse_options(sp2, list(range(51, 56))))]

# 翻译
tb = sec_span(full, "translate a passage from Chinese into English", None)
k = re.search(r"[一-鿿]", tb)
zh = tb[k.start():] if k else ""
zh = re.split(r"未得到监考|试题册|答案速查|参考译文|参考答案|Part\s+[IVXJ1]|Writing", zh)[0]   # 截掉译文后的尾页(答题卡/答案表)
zh = re.sub(r"[\s\d]+$", "", zh.strip())                                                       # 去尾部页码残留
content["translation"] = ("Directions: For this part, you are allowed 30 minutes to translate a passage from Chinese into English. You should write your answer on Answer Sheet 2.",
                          collapse(zh))

# ---------- 预览 ----------
def hh(x, n=70): return (x or "")[:n].replace("\n", "⏎")
print(f"───── {KEY} 从零入库预览 ─────")
print("写作:", hh(content["writing"][0]))
for kk, rng in [("listening_news", range(1, 8)), ("listening_conv", range(8, 16)), ("listening_passage", range(16, 26))]:
    if NOLIS:
        print(f"{kk}: (残卷无听力题,跳过)"); continue
    bad = [q for q in rng if len(set(content[kk][q])) < 4 or "⟨缺⟩" in content[kk][q]]
    print(f"{kk}: 异常={bad or '无'}")
print("词库:", " ".join(f"{l}={w}" for l, w in zip(plet, content['banked_cloze'][2])))
print("选词空位:", sorted(int(x) for x in re.findall(r"\[(\d+)\]", content['banked_cloze'][1])))
print("匹配 title:", content["matching"][1], "| 段落:", "".join(L for L, _ in content["matching"][2]), "| 陈述:", sorted(content["matching"][3]))
for idx, (p, st, op) in enumerate(content["careful"]):
    bad = [q for q in op if len(set(op[q])) < 4]
    print(f"careful#{idx}: P({len(p)}字) stems={sorted(st)} 异常={bad or '无'}")
print("翻译:", hh(content["translation"][1], 60))
# 答案↔选项核对(MCQ)
print("\n答案↔选项抽查:")
checks = [(46, "careful"), (55, "careful")] + ([] if NOLIS else [(1, "listening_news"), (16, "listening_passage")])
for n, _t in checks:
    if _t == "careful":
        opts = content["careful"][0][2].get(n) or content["careful"][1][2].get(n)
    else:
        opts = content[_t][n]
    ci = ord(A[n]) - 65
    print(f"  Q{n}={A[n]} → {opts[ci][:40] if opts and ci < len(opts) else '?'}")

if not APPLY:
    print("\n(预览，未写库)"); sys.exit(0)

# ---------- 建库 ----------
def nid(): return "o" + binascii.hexlify(os.urandom(12)).decode()
con = sqlite3.connect("prisma/dev.db")
old = con.execute("SELECT id FROM Paper WHERE year=? AND month=? AND setNo=? AND source='real'", (y, m, s)).fetchall()
for (oid,) in old:
    con.execute("DELETE FROM Attempt WHERE paperId=?", (oid,))
    con.execute("DELETE FROM Paper WHERE id=?", (oid,))
pid = nid()
title_p = f"{y}年{m}月 英语四级真题（第{s}套）"
con.execute("INSERT INTO Paper(id,level,year,month,setNo,source,title,status) VALUES(?,?,?,?,?,?,?,?)",
            (pid, "CET4", y, m, s, "real", title_p, "ready"))

def add_sec(order, kind, **f):
    sid = nid()
    cols = ",".join(["id", "paperId", "kind", '"order"'] + list(f.keys()))
    ph = ",".join("?" * (4 + len(f)))
    con.execute(f"INSERT INTO Section({cols}) VALUES({ph})", (sid, pid, kind, order, *f.values()))
    return sid

def add_q(sid, number, type_, correct, points, stem=None, options=None):
    con.execute("INSERT INTO Question(id,sectionId,number,type,stem,optionsJson,correct,points) VALUES(?,?,?,?,?,?,?,?)",
                (nid(), sid, number, type_, stem, json.dumps(options, ensure_ascii=False) if options else None, correct, points))

# writing
sid = add_sec(0, "writing", instruction=content["writing"][0], passage=content["writing"][1])
add_q(sid, None, "essay", None, 15)
# listening
for order, kind, rng in [(1, "listening_news", range(1, 8)), (2, "listening_conv", range(8, 16)), (3, "listening_passage", range(16, 26))]:
    sid = add_sec(order, kind)
    if not NOLIS:
        for n in rng:
            add_q(sid, n, "mcq", A[n], 1, options=content[kind][n])
# cloze
ci, cp, wbk = content["banked_cloze"]
sid = add_sec(4, "banked_cloze", instruction=ci, passage=cp,
              wordBankJson=json.dumps([{"letter": plet[i], "word": w} for i, w in enumerate(wbk)], ensure_ascii=False))
for n in range(26, 36):
    add_q(sid, n, "banked", A[n], 1)
# matching
mi, mt, mp, ms = content["matching"]
sid = add_sec(5, "matching", instruction=mi, title=mt,
              paragraphsJson=json.dumps([{"letter": L, "text": t} for L, t in mp], ensure_ascii=False))
for n in range(36, 46):
    add_q(sid, n, "matching", A[n], 1, stem=ms.get(n))
# careful
for order, (p, st, op), rng in [(6, content["careful"][0], range(46, 51)), (7, content["careful"][1], range(51, 56))]:
    sid = add_sec(order, "careful_reading", passage=p)
    for n in rng:
        add_q(sid, n, "mcq", A[n], 2, stem=st.get(n), options=op[n])
# translation
sid = add_sec(8, "translation", instruction=content["translation"][0], passage=content["translation"][1])
add_q(sid, None, "translation", None, 15)

con.commit()
nq = con.execute("SELECT COUNT(*) FROM Question q JOIN Section s ON q.sectionId=s.id WHERE s.paperId=?", (pid,)).fetchone()[0]
print(f"\n✅ 建库 {title_p}：id={pid}，9 节 {nq} 题")
con.close()
