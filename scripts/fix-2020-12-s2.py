#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
试点：把 2020.12 第2套的干净 OCR 文本写回库，只改题面/选项/篇章/翻译文字，
绝不动结构与答案(correct)。长篇文字从 OCR 逐字提取(不手抄→无转写误差)，
短结构件(选项/选词)按字母核对后内置(已处理 Q19–25 分栏错位)。

用法：
  python3 scripts/fix-2020-12-s2.py            # 仅预览(不写库)
  python3 scripts/fix-2020-12-s2.py --apply    # 校验通过后写库
"""
import sqlite3, re, json, sys

OCR = "scripts/.ocr-cache/2020-12-s2.paper.txt"
DB = "prisma/dev.db"
APPLY = "--apply" in sys.argv

# ---------- 读 OCR，剥水印/页脚 ----------
WM = re.compile(r"淘宝店铺|^四级\s*2020\s*年\s*12\s*月.*$|^\s*\d{1,3}\s*$")
raw = open(OCR, encoding="utf-8").read().splitlines()
lines = [l for l in raw if not WM.search(l.strip())]
full = "\n".join(lines)


def between(a, b, s=0):
    i = full.find(a, s)
    j = full.find(b, i + len(a)) if b else len(full)
    return full[i + len(a):j].strip(), (j if b else len(full))


def collapse(t):
    t = t.replace("•", " ").replace("・", " ").replace("·", " ")  # 去 OCR 漏入的间隔点
    return re.sub(r"\s*\n\s*", " ", re.sub(r"[ \t]{2,}", " ", t)).strip()


# ---------- 听力选项(A,B,C,D 顺序，已核对) ----------
LISTEN = {
 1:["He wanted to buy a home.","He suffered from a shock.","He lost a huge sum of money.","He did an unusual good deed."],
 2:["Invite the waiter to a fancy dinner.","Tell her story to the Daily News.","Give some money to the waiter.","Pay the waiter's school tuition."],
 3:["Whether or not to move to the state's mainland.","How to keep the village from sinking into the sea.","Where to get the funds for rebuilding their village.","What to do about the rising level of the seawater."],
 4:["It takes too long a time.","It costs too much money.","It has to wait for the state's final approval.","It faces strong opposition from many villagers."],
 5:["To investigate whether people are grateful for help.","To see whether people hold doors open for strangers.","To explore ways of inducing gratitude in people.","To find out how people express gratitude."],
 6:["They induced strangers to talk with them.","They helped 15 to 20 people in a bad mood.","They held doors open for people at various places.","They interviewed people who didn't say thank you."],
 7:["People can be educated to be grateful.","Most people express gratitude for help.","Most people have bad days now and then.","People are ungrateful when in a bad mood."],
 8:["To order a solar panel installation.","To report a serious leak in his roof.","To enquire about solar panel installations.","To complain about the faulty solar panels."],
 9:["He plans to install solar panels.","He owns a four-bedroom house.","He saves $300 a year.","He has a large family."],
 10:["The service of the solar panel company.","The cost of a solar panel installation.","The maintenance of the solar panels.","The quality of the solar panels."],
 11:["One year and a half.","Less than four years.","Roughly six years.","About five years."],
 12:["At a travel agency.","At an Australian airport.","At an airline transfer service.","At a local transportation authority."],
 13:["She would be able to visit more scenic spots.","She wanted to save as much money as possible.","She would like to have everything taken care of.","She wanted to spend more time with her family."],
 14:["Four days.","Five days.","One week.","Two weeks."],
 15:["Choosing some activities herself.","Spending Christmas with Australians.","Driving along the Great Ocean Road.","Learning more about wine making."],
 16:["Bring their own bags when shopping.","Use public transport when traveling.","Dispose of their trash properly.","Pay a green tax upon arrival."],
 17:["It has not been doing a good job in recycling.","It has witnessed a rise in accidental drowning.","It has not attracted many tourists in recent years.","It has experienced an overall decline in air quality."],
 18:["To charge a small fee on plastic products in supermarkets.","To ban single-use plastic bags and straws on Bali Island.","To promote the use of paper bags for shopping.","To impose a penalty on anyone caught littering."],
 19:["It gives birth to several babies at a time.","It is the least protected mammal species.","Its breeding grounds are now better preserved.","Its population is now showing signs of increase."],
 20:["Global warming.","Polluted seawaters.","Commercial hunting.","Decreasing birthrates."],
 21:["To mate.","To look for food.","To escape hunters.","To seek breeding grounds."],
 22:["They prefer to drink low-fat milk.","They think milk is good for health.","They consume less milk these days.","They buy more milk than the British."],
 23:["It is not as healthy as once thought.","It is not easy to stay fresh for long.","It benefits the elderly more.","It tends to make people fat."],
 24:["They drink too many pints every day.","They are sensitive to certain minerals.","They lack the necessary proteins to digest it.","They have eaten food incompatible with milk."],
 25:["It is easier for sick people to digest.","It provides some necessary nutrients.","It is healthier than other animal products.","It supplies the body with enough calories."],
}

# ---------- 仔细阅读题干 + 选项(A,B,C,D 顺序，已核对) ----------
CR_STEM = {
 46:"When are people likely to experience boredom, according to an accepted psychological definition?",
 47:"What does the author say boredom can lead to?",
 48:"What is the finding of one team of psychologists in their experiment?",
 49:"Why does the author say boredom isn't all bad?",
 50:"What does the author suggest one do when faced with a challenging problem?",
 51:"What is catching environmentalists' attention nowadays?",
 52:"Which countries have the fastest forest growth?",
 53:"What has encouraged forest growth historically?",
 54:"What accounts for our increasing desire for forests?",
 55:"What does the author conclude about the prospects of forestation?",
}
CR_OPT = {
 46:["When they don't have the chance to do what they want.","When they don't enjoy the materials they are studying.","When they experience something unpleasant.","When they engage in some routine activities."],
 47:["Determination.","Concentration.","Mental deterioration.","Harmful conduct."],
 48:["Volunteers prefer watching a boring movie to sitting alone deliberating.","Many volunteers choose to hurt themselves rather than endure boredom.","Male volunteers are more immune to the effects of boredom than females.","Many volunteers are unable to resist boredom longer than fifteen minutes."],
 49:["It stimulates memorization.","It allows time for relaxation.","It may promote creative thinking.","It may facilitate independent learning."],
 50:["Stop idling and think big.","Unlock one's smartphone.","Look around oneself for stimulation.","Allow oneself some time to be bored."],
 51:["Rich countries are stripping poor ones of their resources.","Forests are fast shrinking in many developing countries.","Forests are eating away the fertile farmland worldwide.","Rich countries are doing little to address deforestation."],
 52:["Those that have newly achieved independence.","Those that have the greatest demand for timber.","Those that used to have the lowest forest coverage.","Those that provide enormous government subsidies."],
 53:["The government's advocacy.","The use of wood for fuel.","The favourable climate.","The green movement."],
 54:["Their unique scenic beauty.","Their use as fruit plantations.","Their capability of improving air quality.","Their stable supply of building materials."],
 55:["Deserts in sub-Saharan Africa will diminish gradually.","It will play a more and more important role in people's lives.","Forest destruction in the developing world will quickly slow down.","Developed and developing countries are moving in opposite directions."],
}

# ---------- 选词填空：词库(O: undertaker→undertaken 修正) + 带空篇章 ----------
WORDBANK = [("A","choose"),("B","constant"),("C","disappointing"),("D","distinguish"),("E","exhausting"),
 ("F","experienced"),("G","negative"),("H","outcome"),("I","pattern"),("J","plural"),("K","repeatedly"),
 ("L","rewarded"),("M","separately"),("N","simply"),("O","undertaken")]
CLOZE_PASSAGE = (
 "When my son completes a task, I can't help but praise him. It's only natural to give praise where "
 "praise is due, right? But is there such a thing as too much praise? According to psychologist Katherine "
 "Phillip, children don't benefit from [26] praise as much as we'd like to think. \"Parents often praise, "
 "believing they are building their child's self-confidence. However, over-praising can have a [27] effect,\" "
 "says Phillip. \"When we use the same praise [28], it may become empty and no longer valued by the child. "
 "It can also become an expectation that anything they do must be [29] with praise. This may lead to the "
 "child avoiding taking risks due to fear of [30] their parents.\"\n"
 "Does this mean we should do away with all the praise? Phillip says no. \"The key to healthy praise is to "
 "focus on the process rather than the [31]. It is the recognition of a child's attempt, or the process in "
 "which they achieved something, that is essential,\" she says. \"Parents should encourage their child to "
 "take the risks needed to learn and grow.\"\n"
 "So how do we break the [32] of praise we're all so accustomed to? Phillip says it's important to [33] "
 "between \"person praise\" and \"process praise\". \"Person praise is [34] saying how great someone is. "
 "It's a form of personal approval. Process praise is acknowledgement of the efforts the person has just "
 "[35]. Children who receive person praise are more likely to feel shame after losing,\" says Phillip.")

# ---------- 信息匹配：陈述 36–45 ----------
MATCH_STMT = {
 36:"One legislative staffer assumed that a woman of color who advocated affordable childcare must be a single mother.",
 37:"People from different races, genders, and regions all suffer from a lack of financial security.",
 38:"According to a survey, while the majority believe too little assistance is given to the poor, more than a third believe too much is spent on welfare.",
 39:"A research group has found that Americans who are struggling are thought to be lazy and to have made the wrong decisions.",
 40:"Under the old system in America, a mother was supposed to stay home and take care of her children.",
 41:"It was found that nearly 50% of Americans are poor or receive low pay.",
 42:"Americans usually overestimate the number of blacks receiving welfare benefits.",
 43:"It is impossible for Americans to lift themselves out of poverty entirely on their own.",
 44:"Nowadays, it seems none of us can get away from income inequality.",
 45:"Assumptions about poor people become even more negative when they live on welfare.",
}

# ---------- 逐字提取长篇 ----------
# 写作
writing_block, _ = between("Writing", "Listening Comprehension")
writing_dir = collapse(re.sub(r"^（30 minutes）", "", writing_block).strip())
writing_dir = writing_dir.replace("Trans portation", "Transportation")
writing_dir = re.sub(r"\s*Part\s+[IVXⅠⅡⅢⅣ]+\s*$", "", writing_dir).strip()  # 去尾部漏入的下一部分标题
WRITING_INSTR = writing_dir
WRITING_PASSAGE = re.sub(r"^Directions:\s*", "", writing_dir)

# 选词填空 instruction（Reading 之后的 Section A Directions）
cloze_dir_block, _ = between("Reading Comprehension", "When my son")
CLOZE_INSTR = collapse(re.sub(r"^（40 minutes）\s*Section A", "", cloze_dir_block).strip())

# 信息匹配：标题 + 段落 A–P
MATCH_TITLE = "Poverty is a story about us, not them"
match_region, _ = between(MATCH_TITLE, "36.")
# 阅读 Section B 的 Directions（须取 Reading 之后那个 Section B，避开听力 Section B）
_rc = full.find("Reading Comprehension")
_sb = full.find("Section B", _rc)
match_dir_block = full[_sb + len("Section B"): full.find(MATCH_TITLE, _sb)]
MATCH_INSTR = collapse(match_dir_block.strip())
paras = []
PL = "ABCDEFGHIJKLMNOP"
positions = []
for L in PL:
    m = re.search(r"(?m)^" + L + r"(?:[）)]|\s)\s*(?=[A-Z“\"])", match_region)
    positions.append((L, m.start() if m else -1))
for idx, (L, pos) in enumerate(positions):
    if pos < 0:
        paras.append((L, "")); continue
    end = next((p for _, p in positions[idx + 1:] if p > pos), len(match_region))
    body = match_region[pos:end]
    body = re.sub(r"(?m)^" + L + r"(?:[）)]|\s)\s*", "", body, count=1)
    paras.append((L, collapse(body)))

# 仔细阅读两篇 passage
P1, _ = between("Questions 46 to 50 are based on the following passage.", "46.")
P2, _ = between("Questions 51 to 55 are based on the following passage.", "51.")
CR_PASSAGE = {6: collapse(P1), 7: collapse(P2)}

# 翻译中文(修 OCR 错字)
trans_block, _ = between("translate a passage from Chinese into English. You", "")
zh = trans_block
zh = zh[zh.find("春节"):] if "春节" in zh else zh
zh = (zh.replace("团固饭", "团圆饭").replace("特辣含义", "特殊含义")
        .replace("因沟汉语", "因为汉语"))
TRANS_PASSAGE = collapse(zh)
TRANS_INSTR = "Directions: For this part, you are allowed 30 minutes to translate a passage from Chinese into English. You should write your answer on Answer Sheet 2."

# ============ 预览 ============
def head(s, n=200): return (s or "")[:n].replace("\n", "⏎")
print("───── 预览 ─────")
print("写作 instruction:", head(WRITING_INSTR))
print("写作 passage:", head(WRITING_PASSAGE, 120))
print("选词 instruction:", head(CLOZE_INSTR, 200))
print("匹配 instruction:", head(MATCH_INSTR, 200))
print("选词 passage:", head(CLOZE_PASSAGE, 140))
print("词库:", " ".join(f"{l}={w}" for l, w in WORDBANK))
print("匹配 title:", MATCH_TITLE)
for L, t in paras:
    print(f"  段{L}({len(t)}字): {head(t,60)}")
print("阅读P1:", head(CR_PASSAGE[6], 100))
print("阅读P2:", head(CR_PASSAGE[7], 100))
print("翻译:", head(TRANS_PASSAGE, 120))
miss = [L for L, t in paras if not t] + [k for k in LISTEN if len(LISTEN[k]) != 4]
print("\n缺失段落/异常:", miss or "无")

# ============ 写库 ============
if not APPLY:
    print("\n(预览模式，未写库；加 --apply 写入)"); sys.exit(0)

con = sqlite3.connect(DB); con.row_factory = sqlite3.Row
pid = con.execute("SELECT id FROM Paper WHERE year=2020 AND month=12 AND setNo=2 AND source='real'").fetchone()["id"]
def secid(kind, order=None):
    if order is None:
        return con.execute("SELECT id FROM Section WHERE paperId=? AND kind=?", (pid, kind)).fetchone()["id"]
    return con.execute("SELECT id FROM Section WHERE paperId=? AND kind=? AND \"order\"=?", (pid, kind, order)).fetchone()["id"]

def set_section(sid, **fields):
    cols = ", ".join(f'"{k}"=?' for k in fields)
    con.execute(f"UPDATE Section SET {cols} WHERE id=?", (*fields.values(), sid))

def set_options(sid, mapping):
    qs = con.execute("SELECT id,number,correct FROM Question WHERE sectionId=? ORDER BY number", (sid,)).fetchall()
    assert len(qs) == len(mapping), f"题数不符 {len(qs)}≠{len(mapping)}"
    for q in qs:
        opts = mapping[q["number"]]
        assert len(opts) == 4, f"题{q['number']}选项≠4"
        con.execute("UPDATE Question SET optionsJson=? WHERE id=?", (json.dumps(opts, ensure_ascii=False), q["id"]))

def set_stems(sid, mapping):
    qs = con.execute("SELECT id,number FROM Question WHERE sectionId=? ORDER BY number", (sid,)).fetchall()
    assert len(qs) == len(mapping), f"题数不符 {len(qs)}≠{len(mapping)}"
    for q in qs:
        con.execute("UPDATE Question SET stem=? WHERE id=?", (mapping[q["number"]], q["id"]))

# 写库前：记录所有 correct，事后比对必须一致
before = {r["id"]: r["correct"] for r in con.execute(
    "SELECT q.id,q.correct FROM Question q JOIN Section s ON q.sectionId=s.id WHERE s.paperId=?", (pid,))}

set_section(secid("writing"), instruction=WRITING_INSTR, passage=WRITING_PASSAGE)
set_options(secid("listening_news"), {k: LISTEN[k] for k in range(1, 8)})
set_options(secid("listening_conv"), {k: LISTEN[k] for k in range(8, 16)})
set_options(secid("listening_passage"), {k: LISTEN[k] for k in range(16, 26)})
set_section(secid("banked_cloze"), instruction=CLOZE_INSTR, passage=CLOZE_PASSAGE,
            wordBankJson=json.dumps([{"letter": l, "word": w} for l, w in WORDBANK], ensure_ascii=False))
set_section(secid("matching"), instruction=MATCH_INSTR, title=MATCH_TITLE,
            paragraphsJson=json.dumps([{"letter": l, "text": t} for l, t in paras], ensure_ascii=False))
set_stems(secid("matching"), MATCH_STMT)
set_section(secid("careful_reading", 6), passage=CR_PASSAGE[6])
set_stems(secid("careful_reading", 6), {k: CR_STEM[k] for k in range(46, 51)})
set_options(secid("careful_reading", 6), {k: CR_OPT[k] for k in range(46, 51)})
set_section(secid("careful_reading", 7), passage=CR_PASSAGE[7])
set_stems(secid("careful_reading", 7), {k: CR_STEM[k] for k in range(51, 56)})
set_options(secid("careful_reading", 7), {k: CR_OPT[k] for k in range(51, 56)})
set_section(secid("translation"), instruction=TRANS_INSTR, passage=TRANS_PASSAGE)

after = {r["id"]: r["correct"] for r in con.execute(
    "SELECT q.id,q.correct FROM Question q JOIN Section s ON q.sectionId=s.id WHERE s.paperId=?", (pid,))}
assert before == after, "❌ 答案被改动，回滚！"
con.commit()
print("\n✅ 已写库，且全部 correct 答案校验一致（未改动）")
con.close()
