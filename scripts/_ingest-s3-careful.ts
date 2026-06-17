import "dotenv/config";
import { prisma } from "../lib/db";

// 一次性补全 2025.12 第3套「仔细阅读 46–55」——早先 ingest 漏结构化的 Part III。
// 内容取自 完整版精排.pdf（文字层），答案取自 答案纯净版.pdf（已逐题核对）。
// 镜像 s1/s2 的 careful_reading 格式：title=null、段落以单个 \n 连接、直引号、points=2、
// optionsJson 为不含字母前缀的纯文本数组。幂等：若已存在 46 题则跳过。

const passageOne = [
  "New York's Eleven Madison Park has become the first vegan restaurant to be awarded three Michelin stars.",
  "The fine dining establishment received its first three-star Michelin rating in 2011 when the menu was famed for its fancy animal-based dishes.",
  "However, last year, the restaurant's co-owner and famous chef, Daniel Humm, made the bold decision to remove meat from the menu, citing our unsustainable food system. While cow milk is still served for tea and coffee, the menu is almost 100 percent vegan.",
  "At the time, Humm acknowledged the move was risky, admitting that \"it wasn't clear if guests would come\", but called the gamble \"a risk worth taking.\"",
  "\"In view of the climate crisis, I didn't want to open the same restaurant,\" Humm told the Financial Times in an interview. \"If we can show the possibilities of eating plant-based food in this setting, it can open a lot of doors\" for others to follow.",
  "Now, this impressive new accomplishment validates Eleven Madison Park's decision to take meat off the menu and embrace plant-based foods, with Michelin's 2022 New York guide branding it a 'bold vision of luxury dining'.",
  "\"We took the jump to transform Eleven Madison Park into a plant-based fine dining restaurant knowing in our hearts this is what we believed in,\" stated Humm on Instagram. \"Last night, we were honored to be awarded three Michelin stars for the 11th year in a row. I am so grateful to the team members who contributed through its nearly 25-year history. We are also grateful to our guests and partners who believed in our vision and encouraged us to push harder.\"",
  "Three Michelin stars is the highest award, given to chefs who are at the peak of their profession. \"Their cooking is elevated to an art form and some of their dishes are destined to become classics,\" reads Michelin's website, in a clear nod to plant-based foods' growing significance in the culinary world.",
  "\"I think luxury companies have a real role to play and a responsibility,\" says Humm. \"The more creative we are, the more beautiful and delicious our future will be.\"",
].join("\n");

const passageTwo = [
  "With genetic testing becoming increasingly popular, many people are left wondering exactly how accurate it is. Whether you are taking a DNA test to build your extended DNA family tree, or want precise information on inborn health conditions, it is important to understand how accurate genetic tests are, and what information we can rely upon.",
  "How accurate DNA tests are relies greatly upon the kind of test being taken, on the specific question you ask, and on how complex the genetics behind a trait is. For example, tests for traits that depend on a single gene provide much more reliable results, because you can see whether a disease-causing trait is present.",
  "Ancestry tests claim to reveal our genetic identities. But saying you are 30 percent East Asian or American hardly reflects your real ancestry.",
  "What about using DNA tests to discover distant family members? There are tools to compare one's DNA with others' to find distant relatives based on their genetic identification. These kinds of applications are generally accurate. It's relatively easy to tell whether two DNA samples belong to close relatives. With distant relatives, results become hazier.",
  "Genetic health tests claim to be able to detect certain hereditary diseases, or other health conditions. While certain rare diseases can be easily identified, most potential health conditions cannot be identified by genetic testing alone. The large majority of our traits and diseases also depend upon non-genetic factors, such as lifestyle, the environment, and many others.",
  "Genetic tests for multi-factorial traits are often very tricky to interpret. Height, for example, depends on hundreds of genes, each contributing a little to the outcome, together with a bunch of environmental factors. A test can look at many genes at once, but it's difficult to predict how they will play together. Then you should also account for non-genetic factors that are not written in the DNA.",
  "Tests that offer to find your perfect romantic match and those claiming to predict personality or talents based on your DNA are pure nonsense. At the moment, the scientific bases for these applications are non-existent or incredibly weak.",
].join("\n");

type Q = { number: number; stem: string; options: [string, string, string, string]; correct: string };

const passageOneQs: Q[] = [
  {
    number: 46,
    stem: "What do we learn about New York's Eleven Madison Park?",
    options: [
      "It is the first vegan restaurant to receive the highest Michelin rating.",
      "It is the first restaurant in the city to remove meat from its menu.",
      "It was famed throughout the U.S. for its fancy regional dishes.",
      "It was established as a three-star Michelin restaurant in 2011.",
    ],
    correct: "A",
  },
  {
    number: 47,
    stem: "Why did Daniel Humm decide to remove meat from the menu of his restaurant?",
    options: [
      "To encourage more customers to be vegan.",
      "To contribute to a sustainable food system.",
      "To show the appeal of a plant-based menu.",
      "To strive for the three-star Michelin rating.",
    ],
    correct: "B",
  },
  {
    number: 48,
    stem: "What did Daniel Humm think of his move to a meat-free menu?",
    options: [
      "It was a worthwhile effort even though he was unsure of its success.",
      "It would set a model for many more restaurants to follow.",
      "It was a mad gamble few chefs in the fine dining world would risk taking.",
      "It would prove a right step to take in today's catering business.",
    ],
    correct: "A",
  },
  {
    number: 49,
    stem: "What does Michelin's 2022 New York guide say about Eleven Madison Park's decision?",
    options: [
      "It elevates the restaurant's cooking to an art form.",
      "It proves the validity of ratings awarded by Michelin.",
      "It shows a daring foresight regarding future fine dining.",
      "It is an effort to transform the restaurant into a luxury one.",
    ],
    correct: "C",
  },
  {
    number: 50,
    stem: "What does the awarding of three Michelin stars to Eleven Madison Park indicate?",
    options: [
      "An optimistic vision of vegan foods becoming mainstream.",
      "A greater responsibility for the culinary world to undertake.",
      "A strong incentive for more restaurants to offer healthier foods to their customers.",
      "An explicit recognition of the rising importance of restaurants serving vegan foods.",
    ],
    correct: "D",
  },
];

const passageTwoQs: Q[] = [
  {
    number: 51,
    stem: "What does the passage say is of importance regarding genetic tests?",
    options: [
      "Knowing their accuracy.",
      "Evaluating their applicability.",
      "Utilizing the information they provide.",
      "Weighing the consequences they have.",
    ],
    correct: "A",
  },
  {
    number: 52,
    stem: "What kind of genetic tests tend to be comparatively reliable?",
    options: [
      "Those complex enough to reveal the genetics behind a trait.",
      "Those looking for traits responsible for certain diseases.",
      "Those focusing on the specific questions being asked.",
      "Those looking for traits determined by a single gene.",
    ],
    correct: "D",
  },
  {
    number: 53,
    stem: "What do we learn about genetic health tests from the passage?",
    options: [
      "They are unable to identify certain hereditary diseases by themselves.",
      "They are generally unable to separate genetic and non-genetic factors.",
      "They cannot independently identify the majority of potential diseases.",
      "They cannot tell apart the impact of lifestyle and that of the environment.",
    ],
    correct: "C",
  },
  {
    number: 54,
    stem: "What makes genetic tests for multi-factorial traits tricky to interpret?",
    options: [
      "The challenge in determining the role of each individual gene.",
      "The difficulty of foretelling how the various genes will interact.",
      "The difficulty of telling genetic factors from environmental ones.",
      "The enormous work to identify the hundreds of genes involved.",
    ],
    correct: "B",
  },
  {
    number: 55,
    stem: "What does the passage say about DNA tests to predict personality or talents?",
    options: [
      "They are solid scientific bases for application.",
      "They are helpful in finding a romantic match.",
      "They do not look promising at the moment.",
      "They do not make any sense at present.",
    ],
    correct: "D",
  },
];

async function main() {
  const paper = await prisma.paper.findFirst({
    where: { source: "real", year: 2025, month: 12, setNo: 3 },
    include: { sections: { include: { questions: true } } },
  });
  if (!paper) throw new Error("找不到 2025.12 第3套");

  const exists = paper.sections.some((s) => s.questions.some((q) => q.number === 46));
  if (exists) {
    console.log("⏭ 第3套已存在 46 题，跳过（幂等）");
    return;
  }

  const translation = paper.sections.find((s) => s.kind === "translation");

  await prisma.$transaction(async (tx) => {
    // 翻译挪到 order 8，给仔细阅读让出 6/7（与 s1/s2 一致）
    if (translation && translation.order !== 8) {
      await tx.section.update({ where: { id: translation.id }, data: { order: 8 } });
    }

    const mk = async (order: number, passage: string, qs: Q[]) => {
      const sec = await tx.section.create({
        data: { paperId: paper.id, kind: "careful_reading", order, passage },
      });
      for (const q of qs) {
        await tx.question.create({
          data: {
            sectionId: sec.id,
            number: q.number,
            type: "mcq",
            stem: q.stem,
            optionsJson: JSON.stringify(q.options),
            correct: q.correct,
            points: 2,
          },
        });
      }
    };

    await mk(6, passageOne, passageOneQs);
    await mk(7, passageTwo, passageTwoQs);
  });

  console.log("✅ 已补全 2025.12 第3套 仔细阅读（46–55）+ 答案");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
