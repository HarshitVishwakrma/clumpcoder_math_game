const { loadQuestionsFromExcel } = require("../loadQuestion");

class QuestionService {
  constructor() {
    this.questionCache = new Map(); // Cache for loaded questions
    this.preloadQuestions();
  }

  preloadQuestions() {
    console.log("[Startup] Preloading questions from Excel...");
    try {
      const data = loadQuestionsFromExcel();
      console.log(`[Startup] Preloaded ${data.length} questions`);

      const cache = new Map();
      data.forEach((question) => {
        const key = `${question.difficulty}_${question.finalLevel}`;
        if (!cache.has(key)) {
          cache.set(key, []);
        }
        cache.get(key).push(question);
      });

      this.questionCache = cache;

      const stats = {
        byDifficulty: {},
        byFinalLevel: {},
      };

      data.forEach((q) => {
        stats.byDifficulty[q.difficulty] = (stats.byDifficulty[q.difficulty] || 0) + 1;
        stats.byFinalLevel[q.finalLevel] = (stats.byFinalLevel[q.finalLevel] || 0) + 1;
      });

      console.log("[Startup] Questions by difficulty:", stats.byDifficulty);
      console.log("[Startup] Questions by final level:", stats.byFinalLevel);
    } catch (error) {
      console.error("[Startup] Error preloading questions:", error);
    }
  }

  determineQuestionLevel(playerRating, difficulty) {
    if (playerRating < 800) return 1;
    else if (playerRating < 1200) return 2;
    else if (playerRating < 1600) return difficulty === "easy" ? 2 : 3;
    else if (playerRating < 2000) return difficulty === "hard" ? 4 : 3;
    else {
      if (difficulty === "medium") return 4;
      if (difficulty === "hard") return 5;
      return 3;
    }
  }

  getQuestionLevelFromQM(qm) {
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
      { level: 10, start: 38, end: 45 },
    ];

    for (const range of qmRanges) {
      if (qm >= range.start && qm <= range.end) {
        return range.level;
      }
    }

    return 10;
  }

  determineFinalQuestionLevel(playerRating, difficulty, qm = null) {
    if (qm !== null && qm !== undefined && qm >= 0) {
      const qmLevel = this.getQuestionLevelFromQM(qm);
      console.log(`Using QM-based level: QM=${qm} -> Level=${qmLevel}`);
      return qmLevel;
    }

    const ratingLevel = this.determineQuestionLevel(playerRating, difficulty);
    console.log(`Using rating-based level: Rating=${playerRating}, Difficulty=${difficulty} -> Level=${ratingLevel}`);
    return ratingLevel;
  }

  getInitialQuestionMeter(player1Rating, player2Rating) {
    const lowerRating = Math.min(player1Rating, player2Rating);

    if (lowerRating < 800) return 2;
    if (lowerRating < 1200) return 5;
    if (lowerRating < 1600) return 8;
    if (lowerRating < 2000) return 12;
    return 15;
  }

  generateQuestion(difficulty, symbols, playerRating, qm = null) {
    try {
      const targetFinalLevel = this.determineFinalQuestionLevel(playerRating, difficulty, qm);

      console.log(`Generating question - Rating: ${playerRating}, Difficulty: ${difficulty}, QM: ${qm}, Target level: ${targetFinalLevel}`);

      const cacheKey = `${difficulty}_${targetFinalLevel}`;
      let pool = this.questionCache.get(cacheKey) || [];

      if (pool.length === 0) {
        console.log(`No questions found for ${cacheKey}, falling back to full load`);
        const allQs = loadQuestionsFromExcel();
        pool = allQs.filter(q => q.difficulty === difficulty && q.finalLevel === targetFinalLevel);
      }

      if (symbols && symbols.length > 0) {
        const symbolList = Array.isArray(symbols) 
          ? symbols.map(s => s.toLowerCase().trim())
          : [symbols.toLowerCase().trim()];

        pool = pool.filter(q => {
          if (!q.symbol) return false;
          const qSymbols = q.symbol.split(",").map(s => s.trim().toLowerCase());
          return symbolList.some(sym => qSymbols.includes(sym));
        });
      }

      if (pool.length === 0) {
        throw new Error(`No questions available for difficulty: ${difficulty}, level: ${targetFinalLevel}, symbols: ${symbols}`);
      }

      const question = pool[Math.floor(Math.random() * pool.length)];
      return { ...question, qm };
    } catch (error) {
      console.error("Error generating question:", error);
      throw error;
    }
  }

  calculateQMChange(isCorrect, playerRating, questionFinalLevel) {
    const tiers = [
      { max: 400, thresh: 1 },
      { max: 800, thresh: 2 },
      { max: 1200, thresh: 2 },
      { max: 1600, thresh: 3 },
      { max: 2000, thresh: 4 },
      { max: Infinity, thresh: 5 },
    ];

    for (const tier of tiers) {
      if (playerRating <= tier.max) {
        return questionFinalLevel <= tier.thresh 
          ? (isCorrect ? 2 : -1) 
          : (isCorrect ? 1 : -1);
      }
    }

    return isCorrect ? 1 : -1;
  }

  calculateScore(currentScore, isCorrect, streak) {
    if (!isCorrect) return currentScore;

    if (streak <= 2) return currentScore + 1;
    if (streak === 3) return currentScore + 3;
    if (streak === 5) return currentScore + 5;
    if (streak === 10) return currentScore + 10;
    if (streak % 10 === 0) return currentScore + 10;

    return currentScore + 1;
  }

  generateQuestions(count, difficulty = null, category = null) {
    const questions = [];
    const defaultSymbols = ['+', '-', '*', '/'];

    for (let i = 0; i < count; i++) {
      try {
        const question = this.generateQuestion(
          difficulty || 'medium',
          defaultSymbols,
          1200,
          null
        );
        questions.push(question);
      } catch (error) {
        console.error(`Error generating question ${i + 1}:`, error);
      }
    }

    return questions;
  }

  checkAnswer(question, givenAnswer) {
    return String(givenAnswer).trim() === String(question.answer).trim();
  }
}

// Export using CommonJS
module.exports = { QuestionService };




// const { loadQuestionsFromExcel } = require('../loadQuestion');

// class QuestionService {
//     constructor() {
//         this.questions = [];
//         this.loadQuestions();
//     }

//     loadQuestions() {
//         try {
//             this.questions = loadQuestionsFromExcel();
//             console.log(`QuestionService: Loaded ${this.questions.length} questions`);
//         } catch (error) {
//             console.error('QuestionService: Error loading questions:', error);
//             this.questions = [];
//         }
//     }

//     /**
//      * Get a question for the game based on difficulty, rating, and question meter
//      */
//     getQuestionForGame(difficulty, playerRating, questionMeter = null) {
//         try {
//             // Determine the final level using the same logic as the controller
//             const targetFinalLevel = this.determineFinalQuestionLevel(playerRating, difficulty, questionMeter);
            
//             // Default symbols for math game (you can modify this based on your game logic)
//             const symbols = ['sum', 'difference', 'product', 'quotient'];
            
//             // Filter questions by difficulty and final level
//             let pool = this.questions.filter(q => {
//                 return q.difficulty === difficulty && q.finalLevel === targetFinalLevel;
//             });

//             // Further filter by symbol match
//             pool = pool.filter(q => {
//                 if (!q.symbol) return false;

//                 const qSymbols = q.symbol
//                     .split(',')
//                     .map(s => s.trim().toLowerCase())
//                     .filter(s => s);

//                 return symbols.some(sym => qSymbols.includes(sym));
//             });

//             if (pool.length === 0) {
//                 console.warn(`No questions found for difficulty: ${difficulty}, level: ${targetFinalLevel}`);
//                 return null;
//             }

//             // Select random question from pool
//             const selectedQuestion = pool[Math.floor(Math.random() * pool.length)];
            
//             return {
//                 id: selectedQuestion.questionKey,
//                 question: selectedQuestion.question,
//                 input1: selectedQuestion.input1,
//                 input2: selectedQuestion.input2,
//                 answer: selectedQuestion.answer,
//                 difficulty: selectedQuestion.difficulty,
//                 level: selectedQuestion.finalLevel,
//                 symbol: selectedQuestion.symbol,
//                 options: this.generateOptions(selectedQuestion) // For multiple choice if needed
//             };

//         } catch (error) {
//             console.error('QuestionService: Error getting question:', error);
//             return null;
//         }
//     }

//     /**
//      * Generate multiple choice options for a question (if needed)
//      */
//     generateOptions(question) {
//         const correctAnswer = parseFloat(question.answer);
//         if (isNaN(correctAnswer)) return null;

//         const options = [correctAnswer];
        
//         // Generate 3 wrong answers
//         for (let i = 0; i < 3; i++) {
//             let wrongAnswer;
//             do {
//                 const variation = Math.floor(Math.random() * 20) - 10; // ±10 variation
//                 wrongAnswer = correctAnswer + variation;
//             } while (options.includes(wrongAnswer) || wrongAnswer === correctAnswer);
            
//             options.push(wrongAnswer);
//         }

//         // Shuffle options
//         for (let i = options.length - 1; i > 0; i--) {
//             const j = Math.floor(Math.random() * (i + 1));
//             [options[i], options[j]] = [options[j], options[i]];
//         }

//         return options;
//     }

//     /**
//      * Determine question level from QM value (copied from controller)
//      */
//     getQuestionLevelFromQM(qm) {
//         const qmRanges = [
//             { level: 1, start: 0, end: 5 },
//             { level: 2, start: 6, end: 9 },
//             { level: 3, start: 10, end: 13 },
//             { level: 4, start: 14, end: 17 },
//             { level: 5, start: 18, end: 21 },
//             { level: 6, start: 22, end: 25 },
//             { level: 7, start: 26, end: 29 },
//             { level: 8, start: 30, end: 33 },
//             { level: 9, start: 34, end: 37 },
//             { level: 10, start: 38, end: 45 },
//         ];

//         for (const range of qmRanges) {
//             if (qm >= range.start && qm <= range.end) {
//                 return range.level;
//             }
//         }

//         return 10;
//     }

//     /**
//      * Determine question level from player rating (copied from controller)
//      */
//     determineQuestionLevel(playerRating, difficulty) {
//         if (playerRating < 800) {
//             return 1;
//         } else if (playerRating < 1200) {
//             return 2;
//         } else if (playerRating < 1600) {
//             return difficulty === "easy" ? 2 : 3;
//         } else if (playerRating < 2000) {
//             return difficulty === "hard" ? 4 : 3;
//         } else {
//             if (difficulty === "medium") return 4;
//             if (difficulty === "hard") return 5;
//             return 3;
//         }
//     }

//     /**
//      * Determine final question level (copied from controller)
//      */
//     determineFinalQuestionLevel(playerRating, difficulty, qm = null) {
//         if (qm !== null && qm !== undefined && qm >= 0) {
//             const qmLevel = this.getQuestionLevelFromQM(qm);
//             console.log(`QuestionService: Using QM-based level: QM=${qm} -> Level=${qmLevel}`);
//             return qmLevel;
//         }

//         const ratingLevel = this.determineQuestionLevel(playerRating, difficulty);
//         console.log(`QuestionService: Using rating-based level: Rating=${playerRating}, Difficulty=${difficulty} -> Level=${ratingLevel}`);
//         return ratingLevel;
//     }

//     /**
//      * Get question statistics
//      */
//     getStatistics() {
//         const stats = {
//             total: this.questions.length,
//             byDifficulty: {},
//             byFinalLevel: {}
//         };

//         this.questions.forEach(q => {
//             stats.byDifficulty[q.difficulty] = (stats.byDifficulty[q.difficulty] || 0) + 1;
//             stats.byFinalLevel[q.finalLevel] = (stats.byFinalLevel[q.finalLevel] || 0) + 1;
//         });

//         return stats;
//     }

//     /**
//      * Reload questions from Excel file
//      */
//     reloadQuestions() {
//         this.loadQuestions();
//     }
// }

// module.exports = { QuestionService };