const path = require("path");
const xlsx = require("xlsx");
const Player = require('../models/Player');

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
  const levelCol =
    headerList.find((h) => h.toLowerCase().includes("question level")) ||
    headerList[1];
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

  questionCache = allRows.map((row, index) => {
    const rawLevel = String(row[levelCol] || "").trim();
    const parts = rawLevel.split(/\s+/);
    const difficultyPart = parts[0] || "";
    const levelPart = parts[1] || "";

    const difficulty = difficultyPart.toLowerCase();
    const levelNumber = Number(levelPart) || null;

    if (index < 3) {
      console.log(
        `Row ${index}: rawLevel="${rawLevel}" -> difficulty="${difficulty}", levelNumber=${levelNumber}`
      );
    }

    if (!["easy", "medium", "hard"].includes(difficulty) || !levelNumber) {
      console.warn(
        `Invalid question level format at row ${index}: "${rawLevel}"`
      );
    }

    return {
      key: String(row[keyCol] || "").trim(),
      questionLevel: rawLevel,
      difficulty: difficulty,
      levelNumber: levelNumber,
      prompt: String(row[promptCol] || "").trim(),
      input1: row[input1Col] || "",
      input2: row[input2Col] || "",
      answer: row[answerCol] || "",
      symbol: String(row[symbolCol] || "").trim(),
      valid: row[validCol] || "",
      combo: row[comboCol] || "",
      finalLevel: Number(row[finalCol] || 1),
    };
  });

  console.log("Processed questions:", questionCache.length);

  const difficultyCount = questionCache.reduce((acc, q) => {
    acc[q.difficulty] = (acc[q.difficulty] || 0) + 1;
    return acc;
  }, {});
  console.log("Questions by difficulty:", difficultyCount);

  return questionCache;
}

exports.getQuestion = (req, res) => {
  const diff = String(req.query.difficulty || "").trim().toLowerCase();
  const digit = Number(req.query.digit);
  const rawSymbols = req.query.symbol;
  const rating = Number(req.query.playerRating);

  // Parse symbol parameter (comma-separated or single)
  const symbolList = rawSymbols
    ? String(rawSymbols)
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s)
    : [];

  if (!["easy", "medium", "hard"].includes(diff) ||
      isNaN(digit) || digit <= 0 ||
      !symbolList.length ||
      isNaN(rating)) {
    return res.status(400).json({
      message: 'Provide difficulty=(easy|medium|hard), digit>0, symbol (one or comma-separated), and numeric playerRating',
    });
  }

  try {
    const allQs = loadQuestionsFromExcel();
    console.log(`Total questions loaded: ${allQs.length}`);

    // Filter by difficulty and digit
    let pool = allQs.filter((q) => {
      return q.difficulty === diff && q.levelNumber === digit;
    });

    console.log(`Questions after difficulty & digit filter: ${pool.length}`);

    // Further filter by symbol match
    pool = pool.filter((q) => {
      const qSymbols = q.symbol
        .split(',')
        .map((s) => s.trim().toLowerCase());
      // Check if any requested symbol exists in question symbols
      return symbolList.some((sym) => qSymbols.includes(sym));
    });

    console.log(`Questions after symbol filter: ${pool.length}`);

    if (!pool.length) {
      return res.status(404).json({
        message: `No questions available matching difficulty "${diff}", digit ${digit}, and symbols [${symbolList.join(', ')}]`,
      });
    }

    // Select random question
    const question = pool[Math.floor(Math.random() * pool.length)];
    return res.json({ question });
  } catch (err) {
    console.error("Error in getQuestion:", err);
    return res.status(500).json({ message: "Server error" });
  }
};


exports.submitAnswer = (req, res) => {
  const { playerRating, currentScore, givenAnswer, question, symbol } = req.body;
  if (typeof playerRating !== 'number' || typeof currentScore !== 'number' || !question || typeof question.answer === 'undefined') {
    return res.status(400).json({ message: 'Missing fields: playerRating, currentScore, question.answer' });
  }

  const symbolList = Array.isArray(symbol)
    ? symbol.map(s => String(s).trim().toLowerCase())
    : String(symbol || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

  const correct = String(givenAnswer).trim() === String(question.answer).trim();
  const lvl = Number(String(question.questionLevel).match(/\d+$/)?.[0] || 1);

  // score delta based on rating brackets
  let delta = 0;
  const tiers = [ {max:400,thresh:3}, {max:800,thresh:4}, {max:1200,thresh:5}, {max:1600,thresh:6}, {max:2000,thresh:7}, {max:Infinity,thresh:8} ];
  for (const t of tiers) {
    if (playerRating <= t.max) {
      delta = lvl <= t.thresh ? (correct?2:-1) : (correct?1:-1);
      break;
    }
  }

  const nextScore = Math.max(0, currentScore + delta);
  const allQs = loadQuestionsFromExcel();
  const allowed = exports.getLevelFromScore(nextScore);

  let nextPool = allQs.filter(q =>
    q.difficulty === question.difficulty &&
    q.levelNumber <= allowed &&
    symbolList.some(sym => q.symbol.toLowerCase().split(',').includes(sym))
  );

  if (!nextPool.length) {
    return res.status(404).json({ message: 'No next questions', nextScore, correct });
  }

  const nextQ = nextPool[Math.floor(Math.random()*nextPool.length)];
  return res.json({ correct, oldScore:currentScore, updatedScore:nextScore, scoreDelta:delta, nextQuestion: nextQ });
};

// helper to translate score to max level
exports.getLevelFromScore = score => {
  const breakpoints = [5,9,13,17,21,25,29,33,37];
  return breakpoints.findIndex(bp => score <= bp) + 1 || 10;
};


function preloadQuestions() {
  console.log("[Startup] Preloading questions from Excel...");
  const data = loadQuestionsFromExcel();
  console.log(`[Startup] Preloaded ${data.length} questions`);
}

preloadQuestions();
