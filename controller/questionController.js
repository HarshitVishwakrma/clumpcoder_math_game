// src/controllers/gameController.js
const path = require("path");
const xlsx = require("xlsx");

const WORKBOOK_PATH = path.join(
  __dirname,
  "../config/questionmaster_final.xlsx"
);
let questionCache = null;

function loadQuestionsFromExcel() {
  if (questionCache) return questionCache;

  const wb = xlsx.readFile(WORKBOOK_PATH);
  const sheetNames = wb.SheetNames.filter((name) => name.startsWith("QM"));
  console.log("Loading sheets:", sheetNames);
  const allRows = [];

  sheetNames.forEach((sheetName) => {
    const sheet = wb.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });
    allRows.push(...rows);
  });

  console.log("Total raw rows:", allRows.length);

  if (!allRows.length) {
    questionCache = [];
    return questionCache;
  }

  const headerList = Object.keys(allRows[0]);
  const keyCol = headerList.find((h) =>
    h.toLowerCase().includes("question key")
  );
  const levelCol = headerList[1];
  const promptCol = "Question Details";
  const finalCol = "Final Level";
  const input1Col = headerList.find((h) => h.includes("EMPTY_1"));
  const input2Col = headerList.find((h) => h.includes("EMPTY_2"));
  const answerCol = headerList.find((h) => h.includes("EMPTY_3"));
  const symbolCol = headerList.find((h) => h.includes("EMPTY_4"));
  const validCol = headerList.find((h) => h.includes("EMPTY_5"));
  const comboCol = headerList.find((h) => h.includes("EMPTY_6"));

  console.log(
    "Using keyCol=",
    keyCol,
    "levelCol=",
    levelCol,
    "promptCol=",
    promptCol
  );

  questionCache = allRows.map((row) => {
    const rawLevel = String(row[levelCol] || "").trim();
    const [difficultyPart, levelPart] = rawLevel.split(/\s+/);
    return {
      key: String(row[keyCol] || "").trim(),
      questionLevel: rawLevel,
      difficulty: (difficultyPart || "").toLowerCase(),
      levelNumber: Number(levelPart) || null,
      prompt: String(row[promptCol] || "").trim(),
      input1: row[input1Col] || "",
      input2: row[input2Col] || "",
      answer: row[answerCol] || "",
      symbol: row[symbolCol] || "",
      valid: row[validCol] || "",
      combo: row[comboCol] || "",
      finalLevel: Number(row[finalCol] || 1),
    };
  });
  console.log("Processed questions:", questionCache.length);
  return questionCache;
}

exports.getQuestion = (req, res) => {
  const diffRaw = String(req.query.difficulty || "").trim();
  if (!diffRaw) {
    return res.status(400).json({ message: "Missing difficulty parameter" });
  }

  try {
    const allQs = loadQuestionsFromExcel();
    if (!allQs.length) {
      return res
        .status(500)
        .json({ message: "No questions loaded; check sheet and headers" });
    }

    let pool;
    const diffLower = diffRaw.toLowerCase();
    if (/^\w+\s+\d+$/.test(diffRaw)) {
      pool = allQs.filter((q) => q.questionLevel.toLowerCase() === diffLower);
    } else if (["easy", "medium", "hard"].includes(diffLower)) {
      pool = allQs.filter((q) => q.difficulty === diffLower);
    } else {
      return res
        .status(400)
        .json({
          message:
            'Invalid difficulty; use easy, medium, hard or specific like "Easy 1"',
        });
    }

    console.log(
      `Filtering with diffRaw='${diffRaw}'. Pool size=${pool.length}`
    );
    if (!pool.length)
      return res.status(404).json({ message: "No questions available" });

    const q = pool[Math.floor(Math.random() * pool.length)];
    return res.json({ question: q });
  } catch (err) {
    console.error("Error in getQuestion:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.submitAnswer = (req, res) => {
  const { playerRating, currentScore, givenAnswer, question } = req.body;

  if (
    typeof playerRating !== "number" ||
    typeof currentScore !== "number" ||
    !question ||
    !("answer" in question)
  ) {
    return res
      .status(400)
      .json({
        message:
          "Missing or invalid fields: playerRating, currentScore, or question",
      });
  }

  const correctAnswer = String(question.answer).trim();
  const isCorrect = String(givenAnswer).trim() === correctAnswer;

  // Extract level number from questionLevel like "Easy 1"
  const levelNumber = Number(
    String(question.questionLevel).match(/\d+$/)?.[0] || 1
  );
  let scoreDelta = 0;

  if (playerRating <= 400) {
    scoreDelta = levelNumber <= 3 ? (isCorrect ? 2 : -1) : isCorrect ? 1 : -1;
  } else if (playerRating <= 800) {
    scoreDelta = levelNumber <= 4 ? (isCorrect ? 2 : -1) : isCorrect ? 1 : -1;
  } else if (playerRating <= 1200) {
    scoreDelta = levelNumber <= 5 ? (isCorrect ? 2 : -1) : isCorrect ? 1 : -1;
  } else if (playerRating <= 1600) {
    scoreDelta = levelNumber <= 6 ? (isCorrect ? 2 : -1) : isCorrect ? 1 : -1;
  } else if (playerRating <= 2000) {
    scoreDelta = levelNumber <= 7 ? (isCorrect ? 2 : -1) : isCorrect ? 1 : -1;
  } else {
    scoreDelta = levelNumber <= 8 ? (isCorrect ? 2 : -1) : isCorrect ? 1 : -1;
  }

  const updatedScore = Math.max(0, currentScore + scoreDelta); // ensure score doesn't go below 0

  // Now use updatedScore to decide the next question
  const allQs = loadQuestionsFromExcel();
  const difficulty = question.difficulty.toLowerCase();
  const allowedLevel = getLevelFromScore(updatedScore);

  const nextQsPool = allQs.filter(
    (q) => q.difficulty === difficulty && q.levelNumber <= allowedLevel
  );

  if (!nextQsPool.length) {
    return res.status(404).json({
      message: "No further questions found for updated score.",
      updatedScore,
      isCorrect,
    });
  }

  const nextQuestion =
    nextQsPool[Math.floor(Math.random() * nextQsPool.length)];

  return res.json({
    isCorrect,
    oldScore: currentScore,
    updatedScore,
    scoreDelta,
    nextQuestion,
  });
};

// helper
function getLevelFromScore(score) {
  if (score <= 5) return 1;
  if (score <= 9) return 2;
  if (score <= 13) return 3;
  if (score <= 17) return 4;
  if (score <= 21) return 5;
  if (score <= 25) return 6;
  if (score <= 29) return 7;
  if (score <= 33) return 8;
  if (score <= 37) return 9;
  return 10;
}


function preloadQuestions() {
  console.log('[Startup] Preloading questions from Excel...');
  const data = loadQuestionsFromExcel();
  console.log(`[Startup] Preloaded ${data.length} questions`);
}

preloadQuestions();