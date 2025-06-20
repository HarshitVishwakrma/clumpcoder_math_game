const { loadQuestionsFromExcel } = require('../loadQuestion');

/**
 * Determine the appropriate question level based on player rating and difficulty
 * @param {number} playerRating - Player's current rating
 * @param {string} difficulty - Question difficulty (easy, medium, hard)
 * @returns {number} - Final level for questions
 */
function determineQuestionLevel(playerRating, difficulty) {
  if (playerRating < 800) {
    return 1;
  } else if (playerRating < 1200) {
    return 2;
  } else if (playerRating < 1600) {
    return difficulty === 'easy' ? 2 : 3;
  } else if (playerRating < 2000) {
    return difficulty === 'hard' ? 4 : 3;
  } else {
    if (difficulty === 'medium') return 4;
    if (difficulty === 'hard') return 5;
    return 3;
  }
}

/**
 * Determine question level based on Question Meter (QM) value
 * @param {number} qm - Question Meter value
 * @returns {number} - Level based on QM range
 */
function getQuestionLevelFromQM(qm) {
  // QM ranges based on the provided table
  const qmRanges = [
    { level: 1, start: 0, end: 5 },
    { level: 2, start: 6, end: 9 },
    { level: 3, start: 10, end: 13 },
    { level: 4, start: 14, end: 17 },
    { level: 5, start: 18, end: 21 },
    { level: 6, start: 22, end: 25 },
    { level: 7, start: 26, end: 29 },
    { level: 8, start: 30, end: 33 },
    { level: 9, start: 34, end: 37 },
    { level: 10, start: 38, end: 45 }
  ];

  // Find the appropriate level based on QM value
  for (const range of qmRanges) {
    if (qm >= range.start && qm <= range.end) {
      return range.level;
    }
  }

  // If QM is outside defined ranges, return level 1 as default
  return 10;
}

/**
 * Determine the final level for question selection
 * @param {number} playerRating - Player's current rating
 * @param {string} difficulty - Question difficulty
 * @param {number} qm - Question Meter value (optional)
 * @returns {number} - Final level to use for question filtering
 */
function determineFinalQuestionLevel(playerRating, difficulty, qm = null) {
  // If QM is provided and valid (>= 0), use QM-based level
  if (qm !== null && qm !== undefined && qm >= 0) {
    const qmLevel = getQuestionLevelFromQM(qm);
    console.log(`Using QM-based level: QM=${qm} -> Level=${qmLevel}`);
    return qmLevel;
  }
  
  // Otherwise, use player rating-based determination
  const ratingLevel = determineQuestionLevel(playerRating, difficulty);
  console.log(`Using rating-based level: Rating=${playerRating}, Difficulty=${difficulty} -> Level=${ratingLevel}`);
  return ratingLevel;
}

/**
 * Get a question based on difficulty, symbol, player rating, and optional QM
 */
exports.getQuestion = (req, res) => {
  const diff = String(req.query.difficulty || "").trim().toLowerCase();
  const rawSymbols = req.query.symbol;
  const rating = Number(req.query.playerRating);
  const qm = req.query.qm !== undefined ? Number(req.query.qm) : null;

  // Parse symbol parameter (comma-separated or single)
  const symbolList = rawSymbols
    ? String(rawSymbols)
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s)
    : [];

  // Validation
  if (!["easy", "medium", "hard"].includes(diff) ||
      !symbolList.length ||
      isNaN(rating) || rating < 0) {
    return res.status(400).json({
      message: 'Provide difficulty=(easy|medium|hard), symbol (one or comma-separated), numeric playerRating, and optional qm (Question Meter)',
    });
  }

  // Validate QM if provided
  if (qm !== null && (isNaN(qm) || qm < 0)) {
    return res.status(400).json({
      message: 'Question Meter (qm) must be a non-negative number if provided',
    });
  }

  try {
    const allQs = loadQuestionsFromExcel();
    console.log(`Total questions loaded: ${allQs.length}`);

    // Determine the appropriate final level using QM or player rating
    const targetFinalLevel = determineFinalQuestionLevel(rating, diff, qm);
    console.log(`Player rating: ${rating}, Difficulty: ${diff}, QM: ${qm}, Target final level: ${targetFinalLevel}`);

    // Filter by difficulty and final level
    let pool = allQs.filter((q) => {
      return q.difficulty === diff && q.finalLevel === targetFinalLevel;
    });

    console.log(`Questions after difficulty & final level filter: ${pool.length}`);

    // Further filter by symbol match
    pool = pool.filter((q) => {
      if (!q.symbol) return false;
      
      const qSymbols = q.symbol
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s);
      
      // Check if any requested symbol exists in question symbols
      return symbolList.some((sym) => qSymbols.includes(sym));
    });

    console.log(`Questions after symbol filter: ${pool.length}`);

    if (!pool.length) {
      return res.status(404).json({
        message: `No questions available matching difficulty "${diff}", final level ${targetFinalLevel}, and symbols [${symbolList.join(', ')}]`,
        debug: {
          difficulty: diff,
          finalLevel: targetFinalLevel,
          symbols: symbolList,
          playerRating: rating,
          questionMeter: qm,
          levelDeterminedBy: qm !== null && qm >= 0 ? 'QM' : 'PlayerRating'
        }
      });
    }

    // Select random question from the filtered pool
    const question = pool[Math.floor(Math.random() * pool.length)];
    
    // Return the question with consistent field names
    const responseQuestion = {
      questionKey: question.questionKey,
      questionLevel: question.questionLevel,
      difficulty: question.difficulty,
      // levelNumber: question.levelNumber,
      question: question.question,
      input1: question.input1,
      input2: question.input2,
      answer: question.answer,
      symbol: question.symbol,
      valid: question.valid,
      combo: question.combo,
      finalLevel: question.finalLevel,
      qm : qm
    };

    return res.json({ 
      question: responseQuestion,
      debug: {
        poolSize: pool.length,
        targetFinalLevel: targetFinalLevel,
        levelDeterminedBy: qm !== null && qm >= 0 ? 'QM' : 'PlayerRating',
        questionMeter: qm
      }
    });
  } catch (err) {
    console.error("Error in getQuestion:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

/**
 * Submit an answer and get the next question
 */
exports.submitAnswer = (req, res) => {
  const { playerRating, currentScore, givenAnswer, question, symbol, qm } = req.body;
  
  if (typeof playerRating !== 'number' || 
      typeof currentScore !== 'number' || 
      !question || 
      typeof question.answer === 'undefined') {
    return res.status(400).json({ 
      message: 'Missing required fields: playerRating, currentScore, question.answer' 
    });
  }

  // Validate QM if provided
  const questionMeter = qm !== undefined ? Number(qm) : null;
  if (questionMeter !== null && (isNaN(questionMeter) || questionMeter < 0)) {
    return res.status(400).json({
      message: 'Question Meter (qm) must be a non-negative number if provided',
    });
  }

  const symbolList = Array.isArray(symbol)
    ? symbol.map(s => String(s).trim().toLowerCase())
    : String(symbol || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

  // Check if answer is correct
  const correct = String(givenAnswer).trim() === String(question.answer).trim();
  
  // Get the final level from the question (use the new structure)
  const questionFinalLevel = question.finalLevel || 1;

  // Calculate score delta based on rating brackets and question final level
  let delta = 0;
  const tiers = [
    {max: 400, thresh: 1},
    {max: 800, thresh: 2}, 
    {max: 1200, thresh: 2},
    {max: 1600, thresh: 3},
    {max: 2000, thresh: 4},
    {max: Infinity, thresh: 5}
  ];

  for (const t of tiers) {
    if (playerRating <= t.max) {
      // If question final level is within player's threshold, give more points
      delta = questionFinalLevel <= t.thresh ? (correct ? 2 : -1) : (correct ? 1 : -1);
      break;
    }
  }

  const nextQM = Math.max(0, qm + delta);
  let newCurrentScore = currentScore;
  if(correct)  newCurrentScore = currentScore + 1;
  
  try {
    const allQs = loadQuestionsFromExcel();
    
    // Determine appropriate final level for next question using QM or rating
    const nextFinalLevel = determineFinalQuestionLevel(playerRating, question.difficulty, nextQM);
    
    // Filter questions for next question
    let nextPool = allQs.filter(q =>
      q.difficulty === question.difficulty &&
      q.finalLevel === nextFinalLevel &&
      symbolList.some(sym => {
        if (!q.symbol) return false;
        const qSymbols = q.symbol.toLowerCase().split(',').map(s => s.trim());
        return qSymbols.includes(sym);
      })
    );

    if (!nextPool.length) {
      return res.status(404).json({ 
        message: 'No next questions available',
        newCurrentScore,
        correct,
        debug: {
          difficulty: question.difficulty,
          finalLevel: nextFinalLevel,
          symbols: symbolList,
          levelDeterminedBy: questionMeter !== null && questionMeter >= 0 ? 'QM' : 'PlayerRating',
          questionMeter: questionMeter
        }
      });
    }

    const nextQ = nextPool[Math.floor(Math.random() * nextPool.length)];
    
    // Format the next question with consistent field names
    const responseNextQuestion = {
      questionKey: nextQ.questionKey,
      questionLevel: nextQ.questionLevel,
      score : newCurrentScore,
      difficulty: nextQ.difficulty,
      levelNumber: nextQ.levelNumber,
      question: nextQ.question,
      input1: nextQ.input1,
      input2: nextQ.input2,
      answer: nextQ.answer,
      symbol: nextQ.symbol,
      valid: nextQ.valid,
      combo: nextQ.combo,
      finalLevel: nextQ.finalLevel,
      qm : nextQM
    };

    return res.json({ 
      correct, 
      oldScore: currentScore, 
      updatedScore: newCurrentScore, 
      scoreDelta: delta, 
      nextQuestion: responseNextQuestion,
      debug: {
        nextPoolSize: nextPool.length,
        nextFinalLevel: nextFinalLevel,
        levelDeterminedBy: questionMeter !== null && questionMeter >= 0 ? 'QM' : 'PlayerRating',
        questionMeter: nextQM
      }
    });
  } catch (err) {
    console.error("Error in submitAnswer:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

/**
 * Helper to translate score to max level (if still needed for other parts)
 */
exports.getLevelFromScore = score => {
  const breakpoints = [5, 9, 13, 17, 21, 25, 29, 33, 37];
  return breakpoints.findIndex(bp => score <= bp) + 1 || 10;
};

/**
 * Preload questions on startup
 */
function preloadQuestions() {
  console.log("[Startup] Preloading questions from Excel...");
  try {
    const data = loadQuestionsFromExcel();
    console.log(`[Startup] Preloaded ${data.length} questions`);
    
    // Log some statistics
    const stats = {
      byDifficulty: {},
      byFinalLevel: {}
    };
    
    data.forEach(q => {
      stats.byDifficulty[q.difficulty] = (stats.byDifficulty[q.difficulty] || 0) + 1;
      stats.byFinalLevel[q.finalLevel] = (stats.byFinalLevel[q.finalLevel] || 0) + 1;
    });
    
    console.log("[Startup] Questions by difficulty:", stats.byDifficulty);
    console.log("[Startup] Questions by final level:", stats.byFinalLevel);
  } catch (error) {
    console.error("[Startup] Error preloading questions:", error);
  }
}

// Export functions for testing
exports.determineQuestionLevel = determineQuestionLevel;
exports.getQuestionLevelFromQM = getQuestionLevelFromQM;
exports.determineFinalQuestionLevel = determineFinalQuestionLevel;

// Preload questions on module load
preloadQuestions();