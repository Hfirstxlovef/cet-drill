#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
全库文字层审计（诊断脚本，非入库流水线的一部分）。

目的：找出真题入库时从 PDF 文字层带进来的损坏 —— 撇号→f、字母错认(for→fbr)、
凭字形位置裂词(of→"o f"、just→"ju st")、字母数字/标点乱码(t4Ifs、people/5)等。

方法：对每套卷的所有「人读文本」(Section 各列 + Question stem/options/参考译文，
JSON 列只取 text/word 值，跳过 letter 键以免把选项字母 B/C/D 误报)做检测：
  · 词典法：/usr/share/dict/words(23.5万词) + 词形还原 + 常见现代/英式词补丁，
    认不出的词记为「疑似」；小写未识 vs 大写未识(多为人名)分开报。
  · 结构法(高准确，可直接动手)：裂词、撇号→f、字母数字/标点乱码。

用法：python3 scripts/audit-text-layer.py            # 全库
      python3 scripts/audit-text-layer.py 2025.06    # 仅年月子串匹配的卷
只读，不改库。
"""
import sqlite3, re, json, sys, unicodedata
from collections import defaultdict, Counter

DB = "prisma/dev.db"
WORDS = "/usr/share/dict/words"

KNOWN = set()
with open(WORDS, encoding="utf-8", errors="ignore") as f:
    for w in f:
        KNOWN.add(w.strip().lower())

# web2(1934) 缺的现代词 / 常见英式拼写 / CET 高频词，补进词典以压误报
EXTRA = set("""email online internet website web app apps smartphone smartphones blog blogs
username login logout download downloads upload uploads laptop laptops offline website
ok okay tv ceo dna ai wifi selfie podcast podcasts startup startups url faq covid chatbot
ecommerce dataset datasets biodiversity sustainability recyclable reusable workplace lifestyle
worldwide cyber digital virtual global globalisation globalization organisation organisations
organise organised organising favour favourite favourites colour colours coloured behaviour
behaviours programme programmes centre centres theatre theatres realise realised realising
recognise recognised recognising analyse analysed analysing labour labours neighbour neighbours
traveller travellers travelled travelling modelling jewellery enrol enrolled fulfil skilful
percent percentage smartphone online offline website healthcare wellbeing lifelong multitask
multitasking screen screens app online dataset overconfidence underrepresented
""".split())
KNOWN |= EXTRA

ROMAN = set("i ii iii iv v vi vii viii ix x xi xii xiii xiv xv".split())
SUFFIXES = [("s", ""), ("es", ""), ("ed", ""), ("ing", ""), ("d", ""), ("ly", ""),
            ("er", ""), ("est", ""), ("ers", ""), ("ings", ""), ("ies", "y"), ("ied", "y"),
            ("ier", "y"), ("iest", "y"), ("ness", ""), ("less", ""), ("ful", ""), ("ment", "")]
STRIP = " \t\n\r.,;:!?()[]{}\"'“”‘’`^/\\<>*…—–-"


def known(t):
    t = t.lower()
    if not t:
        return True
    if t in KNOWN:
        return True
    if "'" in t or "’" in t:  # 缩写/所有格，或漏空格的 X'Y(两侧都是真词)
        parts = [p for p in re.split("['’]", t) if p]
        if all((known(p) or p in ("s", "t", "re", "ll", "ve", "m", "d")) for p in parts):
            return True
    if "-" in t:
        return all(known(p) for p in t.split("-") if p)
    for suf, base in SUFFIXES:
        if t.endswith(suf) and len(t) > len(suf) + 1:
            stem = t[:-len(suf)] + base
            if stem in KNOWN:
                return True
            if base == "" and len(stem) > 2 and stem[-1] == stem[-2] and stem[:-1] in KNOWN:
                return True  # 双写辅音 stopped→stop
    return False


def deapos(w):
    """撇号被抽成 f 的还原；能还原成合法缩写/所有格则返回建议形，否则 None。"""
    if "f" not in w:
        return None
    if w.endswith("f") and known(w[:-1]):           # students' → studentsf
        return w[:-1] + "'"
    for a, b in (("nft", "n't"), ("fs", "'s"), ("fre", "'re"), ("fll", "'ll"),
                 ("fve", "'ve"), ("fm", "'m"), ("fd", "'d"), ("ft", "'t")):
        if a in w:
            cand = w.replace(a, b, 1)
            if "'" in cand:
                left, right = cand.split("'", 1)
                if right in ("s", "t", "re", "ll", "ve", "m", "d") and (known(left) or left == ""):
                    return cand
                if right == "t" and left.endswith("n") and known(left[:-1]):  # didn't
                    return cand
    return None


def collect_texts(con):
    """paper_key -> [(field, text), ...]，只取人读文本。"""
    texts = defaultdict(list)
    pid2key = {}
    for pid, y, m, st in con.execute(
            "SELECT id,year,month,setNo FROM Paper WHERE source='real'"):
        pid2key[pid] = f"{y}.{int(m):02d}s{st}"
    secid2pid = {}
    for sid, pid, instr, pas, paraj, wbj, scr, title in con.execute(
            "SELECT id,paperId,instruction,passage,paragraphsJson,wordBankJson,scriptText,title FROM Section"):
        if pid not in pid2key:
            continue
        secid2pid[sid] = pid
        k = pid2key[pid]
        for fld, val in (("instruction", instr), ("passage", pas), ("script", scr), ("title", title)):
            if val:
                texts[k].append((fld, val))
        if paraj:
            try:
                for it in json.loads(paraj):
                    if isinstance(it, dict) and it.get("text"):
                        texts[k].append(("para", it["text"]))
                    elif isinstance(it, str):
                        texts[k].append(("para", it))
            except Exception:
                pass
        if wbj:
            try:
                for it in json.loads(wbj):
                    if isinstance(it, dict) and it.get("word"):
                        texts[k].append(("wordbank", it["word"]))
            except Exception:
                pass
    for stem, optj, ref, sid in con.execute(
            "SELECT stem,optionsJson,referenceText,sectionId FROM Question"):
        pid = secid2pid.get(sid)
        if not pid:
            continue
        k = pid2key[pid]
        if stem:
            texts[k].append(("stem", stem))
        if ref:
            texts[k].append(("ref", ref))
        if optj:
            try:
                for o in json.loads(optj):
                    if isinstance(o, str):
                        texts[k].append(("option", o))
                    elif isinstance(o, dict) and o.get("text"):
                        texts[k].append(("option", o["text"]))
            except Exception:
                pass
    return texts


CJK = re.compile(r"[　-〿㐀-鿿！-｠￠-￦“”…]")  # 中文/标点/全角/双引号；单弯引号在 analyze 里归一为 '
SPLIT_PUNCT = re.compile(r"[.,;:!?()\[\]{}\"]")
VOWEL = re.compile(r"[aeiouy]")
DASHES = str.maketrans("—–‐‑­", "-----")


def deaccent(s):
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def analyze(snippets):
    buckets = defaultdict(list)   # 类别 -> [(标记, 上下文)]
    seen = defaultdict(set)

    def add(cat, mark, ctx):
        key = mark.lower()
        if key in seen[cat]:
            return
        seen[cat].add(key)
        buckets[cat].append((mark, ctx))

    for fld, text in snippets:
        text = text.translate(DASHES).replace("’", "'").replace("‘", "'").replace("℃", "°C").replace("℉", "°F")
        text = re.sub(r"\be\.?\s*g\.?(?=[\s,，)])", "eg", text)              # e.g. 缩写不拆成 e/g
        text = re.sub(r"\bi\.?\s*e\.?(?=[\s,，)])", "ie", text)
        text = re.sub(r"\b([ap])\.?\s*m\.?(?=[\s,，.)])", r"\1m", text)       # a.m./p.m. 不拆成 a/m
        text = re.sub(r"\ba\s*\(n\)", "an", text)                            # a(n) 合法写法，不拆成 a/n
        text = re.sub(r"\b(\w+)\(s\)", r"\1s", text)                         # parent(s)/year(s) 合法，不拆出 s
        # 乱码/替换符直接在原文层面抓(保留上下文)
        for mg in re.finditer(r"�+|<>|\^{2,}|''|``| u We|t4[A-Za-z]", text):
            s = mg.start()
            add("乱码/替换符", mg.group(0), "…" + text[max(0, s - 20):s + 20].replace("\n", " ") + "…")
        # 去中文与中文标点(中文内容不参与英文损坏检测)，再按句读标点切词
        clean = CJK.sub(" ", text)
        clean = SPLIT_PUNCT.sub(" ", clean)
        raw = clean.split()
        n = len(raw)
        for i, rt in enumerate(raw):
            tok = rt.strip(STRIP)
            if not tok:
                continue
            if "�" in tok:
                add("乱码/替换符", tok, "…" + " ".join(raw[max(0, i - 3):i + 4]) + "…")
                continue
            low = tok.lower()
            ctx = "…" + " ".join(raw[max(0, i - 4):i + 5]).replace("\n", " ").strip() + "…"
            # 纯数字/货币/序数/罗马数字/数字-词复合/年份所有格/货币代码(US$100,$5m)/温度(360°C)
            if re.fullmatch(r"[$£€¥]?\d[\d,./%$£€¥:+-]*", tok) or low in ROMAN \
               or re.fullmatch(r"\d+(-[a-z]+)+|\d+(st|nd|rd|th|s)?|\d+['’]s", low) \
               or re.fullmatch(r"[a-z]{0,3}[$£€¥][\d,]+\.?\d*[mbk]?", low) \
               or re.fullmatch(r"\d[\d,.]*\s*°\s*[cf]", low):
                continue
            # 字母数字混：连字符复合词(post-45/mid-1970s/covid-19)与短码(3d/b2)合法；
            # 只抓数字直接粘连多字母词的漏空格(30minutes/with10/1970was/fiel4)
            if re.search(r"[A-Za-z]", tok) and re.search(r"\d", tok):
                if "-" not in tok and not re.fullmatch(r"[a-z]{1,2}\d{1,3}|\d{1,3}[a-z]{1,2}", low):
                    add("字母数字乱码", tok, ctx)
                continue
            # 含符号垃圾(<>~^•=反斜杠)的"词"(斜杠/不算，and/or 合法)
            if re.search(r"[<>~^•=\\]", tok):
                add("乱码/替换符", tok, ctx)
                continue
            if len(tok) == 1:
                # 只抓小写单字母裂词(o f)；大写单字母多为缩写/首字母(U S D)，跳过
                if tok.islower() and tok.isascii() and tok.isalpha() and tok not in ("a", "i"):
                    add("裂词", tok, ctx)
                continue
            da = deaccent(tok)
            if not da.isascii():       # 去重音后仍非 ASCII(非 CJK 残留) → 多为损坏
                add("乱码/替换符", tok, ctx)
                continue
            if known(da):
                continue
            # 未识别：先试与右邻合并成词(裂词，如 ju+st→just)
            if i + 1 < n:
                nxt = deaccent(raw[i + 1].strip(STRIP))
                if nxt and nxt.isascii() and known(da.lower() + nxt.lower()) and not known(nxt.lower()):
                    add("裂词", tok + " " + raw[i + 1].strip(STRIP), ctx)
                    continue
            sug = deapos(da.lower()) if not da[:1].isupper() else None   # 大写词多为专有名词(Wolff)，不当撇号→f
            if sug:
                add("撇号→f", f"{tok}→{sug}", ctx)
                continue
            # 全字母但无元音且≥4 → 强损坏信号(fltff/mtlh 之类)
            if da.isalpha() and len(da) >= 4 and not VOWEL.search(da.lower()):
                add("乱码/替换符", tok, ctx)
                continue
            if da[0].isupper():
                add("大写未识(多为人名/地名)", tok, ctx)
            else:
                add("小写未识(疑似错认)", tok, ctx)
    return buckets


def main():
    flt = sys.argv[1] if len(sys.argv) > 1 else None
    con = sqlite3.connect(DB)
    texts = collect_texts(con)
    keys = sorted(texts, key=lambda k: (k.split("s")[0], k))
    if flt:
        keys = [k for k in keys if flt in k]

    HARD = ["乱码/替换符", "裂词", "撇号→f", "字母数字乱码"]   # 高准确，可直接定位
    SOFT = ["小写未识(疑似错认)", "大写未识(多为人名/地名)"]

    rows = []
    detail = {}
    for k in keys:
        b = analyze(texts[k])
        detail[k] = b
        rows.append((k, {c: len(b.get(c, [])) for c in HARD + SOFT}))

    print("=" * 74)
    print("全库文字层审计  ·  只按「高准确类损坏」定级（软信号=词典盲区/人名，已剔除不计）")
    print("=" * 74)
    print(f"{'卷':<11}{'乱码':>5}{'裂词':>5}{'撇f':>5}{'数混':>5}{'合计':>6}   定级")
    print("-" * 74)
    # 按高准确类合计降序
    rows.sort(key=lambda r: -(r[1]["乱码/替换符"] + r[1]["裂词"] + r[1]["撇号→f"] + r[1]["字母数字乱码"]))
    clean = light = severe = 0
    for k, c in rows:
        garble = c["乱码/替换符"]
        hard = garble + c["裂词"] + c["撇号→f"] + c["字母数字乱码"]
        if hard == 0:
            verdict = "✅ 干净"; clean += 1
        elif garble >= 8 or hard >= 12:
            verdict = "🔴 严重(文字层崩坏)"; severe += 1
        else:
            verdict = "🟡 轻微(零星瑕疵)"; light += 1
        print(f"{k:<11}{garble:>5}{c['裂词']:>5}{c['撇号→f']:>5}{c['字母数字乱码']:>5}{hard:>6}   {verdict}")
    print("-" * 74)
    print(f"共 {len(rows)} 套： ✅ 干净 {clean}　🟡 轻微 {light}　🔴 严重 {severe}\n")

    # 详情：只对有「高准确类」损坏的卷展开
    for k in keys:
        b = detail[k]
        hard_items = [(c, b[c]) for c in HARD if b.get(c)]
        if not hard_items:
            continue
        print(f"■ {k}")
        for cat, items in hard_items:
            print(f"   [{cat}] {len(items)} 处")
            for mark, ctx in items[:8]:
                print(f"       {mark:<26} {ctx}")
            if len(items) > 8:
                print(f"       … 还有 {len(items) - 8} 处")
        print()


if __name__ == "__main__":
    main()
