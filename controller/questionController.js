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
  const levelCol = headerList.find((h) =>
    h.toLowerCase().includes("question level")
  ) || headerList[1]; // Fallback to second column if not found
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
    
    // Debug logging for first few rows to verify parsing
    if (index < 3) {
      console.log(`Row ${index}: rawLevel="${rawLevel}" -> difficulty="${difficulty}", levelNumber=${levelNumber}`);
    }
    
    // Validate that we have valid difficulty and level
    if (!['easy', 'medium', 'hard'].includes(difficulty) || !levelNumber) {
      console.warn(`Invalid question level format at row ${index}: "${rawLevel}"`);
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
      symbol: row[symbolCol] || "",
      valid: row[validCol] || "",
      combo: row[comboCol] || "",
      finalLevel: Number(row[finalCol] || 1),
    };
  });
  
  console.log("Processed questions:", questionCache.length);
  
  // Debug: Log difficulty distribution
  const difficultyCount = questionCache.reduce((acc, q) => {
    acc[q.difficulty] = (acc[q.difficulty] || 0) + 1;
    return acc;
  }, {});
  console.log("Questions by difficulty:", difficultyCount);
  
  return questionCache;
}

exports.getQuestion = (req, res) => {
  const diff = String(req.query.difficulty || '').trim().toLowerCase();
  const rating = Number(req.query.playerRating);

  if (!['easy', 'medium', 'hard'].includes(diff) || isNaN(rating)) {
    return res.status(400).json({
      message: 'Provide difficulty=(easy|medium|hard) and numeric playerRating',
    });
  }

  try {
    const allQs = loadQuestionsFromExcel();
    console.log(`Total questions loaded: ${allQs.length}`);

    // First, find what levels are actually available for this difficulty
    const difficultyPool = allQs.filter(q => 
      String(q.difficulty || '').trim().toLowerCase() === diff
    );
    
    if (!difficultyPool.length) {
      return res.status(404).json({
        message: `No questions available for difficulty "${diff}"`,
        requestedDifficulty: diff,
        totalQuestions: allQs.length
      });
    }
    
    const availableLevels = [...new Set(difficultyPool.map(q => q.levelNumber))]
      .filter(level => level != null)
      .sort((a, b) => a - b);
    
    console.log(`Available levels for "${diff}":`, availableLevels);

    // Determine starting level based on difficulty and rating, but cap it to available levels
    let desiredStartLevel = 1;
    if (rating > 2000) {
      desiredStartLevel = diff === 'easy' ? 2 : diff === 'medium' ? 4 : 5;
    } else if (rating > 1600) {
      desiredStartLevel = diff === 'easy' ? 2 : diff === 'medium' ? 3 : 4;
    } else if (rating > 1200) {
      desiredStartLevel = diff === 'easy' ? 2 : 3;
    } else if (rating > 800) {
      desiredStartLevel = 2;
    }

    // Find the highest available level that doesn't exceed the desired start level
    const startLevel = availableLevels.filter(level => level <= desiredStartLevel).pop() || availableLevels[0];
    
    console.log(`Player rating: ${rating}, desired start level: ${desiredStartLevel}, actual start level: ${startLevel}`);

    // Filter questions for the determined starting level
    const pool = allQs.filter((q) => {
      const questionDiff = String(q.difficulty || '').trim().toLowerCase();
      const questionLevel = Number(q.levelNumber);
      
      return questionDiff === diff && questionLevel === startLevel;
    });

    console.log(`Finding questions for: difficulty="${diff}", level=${startLevel}`);
    console.log(`Matching questions found: ${pool.length}`);
    
    if (pool.length > 0) {
      console.log('Sample filtered question:', {
        difficulty: pool[0].difficulty,
        levelNumber: pool[0].levelNumber,
        questionLevel: pool[0].questionLevel
      });
    }

    if (!pool.length) {
      return res.status(404).json({
        message: `No questions available for difficulty "${diff}" at level ${startLevel}`,
        requestedDifficulty: diff,
        requestedLevel: startLevel,
        availableLevels: availableLevels,
        totalQuestions: allQs.length
      });
    }

    const question = pool[Math.floor(Math.random() * pool.length)];
    return res.json({ question });
  } catch (err) {
    console.error('Error in getQuestion:', err);
    return res.status(500).json({ message: 'Server error' });
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