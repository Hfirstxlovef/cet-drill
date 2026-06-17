#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
零星 OCR 错字定点修：GLOBAL 规则(页脚残留/数字粘连/撇号被识成5)套到所有真题卷，
FIXES 按卷加特例。正则改文字，写库前后比对 correct 守恒，幂等可复跑。
用法：python3 scripts/polish-fixes.py [--apply]
"""
import sqlite3, sys, re

APPLY = "--apply" in sys.argv
con = sqlite3.connect("prisma/dev.db"); con.row_factory = sqlite3.Row

# 套到所有真题卷
GLOBAL = [
    # 页脚（中文，含全角空格分隔的「四 级 真 题（第 二 套）」、前后页码/间隔点）
    (r"\s*\d{0,3}\s*[·・•]?\s*20\d\d\s*年\s*\d{1,2}\s*月\s*(?:大\s*学\s*英\s*语)?\s*四\s*级\s*真\s*题\s*[（(][^）)\n]{0,16}[）)]\s*[·・•»«,，\xad]?\s*\d{0,3}", " "),
    (r"\b(least|than|over|under|about|with)(\d)", r"\1 \2"),    # least120→least 120
    (r"(\d)(minutes|words|blanks|hours)\b", r"\1 \2"),          # 30minutes→30 minutes
    (r"\b(\d{4})(was|is|were|saw|had)\b", r"\1 \2"),            # 1970was→1970 was
    (r"(\d+%)(more|less|of|off)\b", r"\1 \2"),                  # 30%more→30% more
    (r"\b(employees|customers)5\b", r"\1'"),                    # employees5→employees'（5是撇号）
    (r"\bo f\b", "of"),                                          # 裂词 o f→of
]

FIXES = {
    (2015, 6, 2): [(r"U\.s\.+", "U.S.")],
    (2015, 12, 2): [(r"(?:\d+-\d+\s+[A-D]{2,4}\s*){2,}", ""), (r"don\s*[’']\s*t\b", "don't")],
    (2017, 12, 2): [(r"was a n (\d\d)", r"was an [\1]")],
    (2018, 12, 2): [(r"30 m inutes", "30 minutes")],
    (2018, 12, 3): [(r"30 m inutes", "30 minutes")],
    (2019, 6, 2): [(r"parent s 32 1%", "parents 32.1%")],
    (2020, 9, 2): [(r"\bspmt\b", "spirit"), (r"max1m1zes", "maximizes"),
                   (r"New Year l Red envelopes l Lion", "New Year · Red envelopes · Lion")],
    (2021, 6, 1): [(r"肋r this part", "For this part"), (r"Saturday s\b", "Saturday's")],
    (2021, 6, 2): [(r"[肋和]r this part", "For this part"), (r"Eng比n", "English"), (r"s加uld", "should"),
                   (r"involved m a\b", "involved in a"), (r"You·may", "You may"), (r"W血e", "We")],
    (2023, 12, 1): [(r"（diet）o", "（diet）。")],
    (2023, 12, 2): [(r"home~~even", "home—even"), (r"win-at・all・costs", "win-at-all-costs"),
                    (r"w hafs important", "what's important"), (r"villagers567houses", "villagers' houses")],
    (2023, 12, 3): [(r"support~~whether", "support—whether"), (r"\bfo r\b", "for"), (r"\bd iet\b", "diet")],
    (2025, 6, 1): [(r"hybrid r i c e", "hybrid rice"), (r"studentsf", "students'")],
}
TEXT_COLS = ["instruction", "passage", "title", "paragraphsJson", "wordBankJson", "scriptText"]


def apply_rules(v, rules, hit):
    nv = v
    for f, r in rules:
        nv, n = re.subn(f, r, nv)
        hit[f] = hit.get(f, 0) + n
    return nv


def main():
    before = {r["id"]: r["correct"] for r in con.execute("SELECT id,correct FROM Question")}
    total = 0
    for p in con.execute("SELECT id,year,month,setNo FROM Paper WHERE source='real'"):
        rules = GLOBAL + FIXES.get((p["year"], p["month"], p["setNo"]), [])
        hit = {}
        for sec in con.execute("SELECT * FROM Section WHERE paperId=?", (p["id"],)):
            upd = {c: apply_rules(sec[c], rules, hit) for c in TEXT_COLS if sec[c]}
            upd = {c: v for c, v in upd.items() if v != sec[c]}
            if upd and APPLY:
                setc = ", ".join('"%s"=?' % c for c in upd)
                con.execute(f"UPDATE Section SET {setc} WHERE id=?", (*upd.values(), sec["id"]))
        for q in con.execute("SELECT q.id,q.stem,q.optionsJson FROM Question q JOIN Section s ON q.sectionId=s.id WHERE s.paperId=?", (p["id"],)):
            upd = {c: apply_rules(q[c], rules, hit) for c in ("stem", "optionsJson") if q[c]}
            upd = {c: v for c, v in upd.items() if v != q[c]}
            if upd and APPLY:
                setc = ", ".join('"%s"=?' % c for c in upd)
                con.execute(f"UPDATE Question SET {setc} WHERE id=?", (*upd.values(), q["id"]))
        n = sum(hit.values())
        if n:
            print(f"  {p['year']}.{p['month']}s{p['setNo']}: {n} 处 " + ", ".join(f"{f[:14]}×{c}" for f, c in hit.items() if c))
            total += n
    if APPLY:
        after = {r["id"]: r["correct"] for r in con.execute("SELECT id,correct FROM Question")}
        assert before == after, "❌ 答案被改动"
        con.commit(); print(f"\n✅ 已写库 {total} 处，correct 未变")
    else:
        print(f"\n(预览 {total} 处；--apply 写库)")
    con.close()


main()
