const fs = require('fs');
const path = require('path');

// Cache for loaded questions
let questionCache = null;

// Path to your JSON file - update this path as needed
const QUESTIONS_JSON_PATH = './config/questions.json';

/**
 * Load questions from JSON file and cache the results
 * @returns {Array} Array of question objects
 */
function loadQuestionsFromJSON() {
  // Return cached data if already loaded
  if (questionCache) {
    console.log('Returning cached questions:', questionCache.length);
    return questionCache;
  }

  try {
    console.log('Loading JSON file from:', QUESTIONS_JSON_PATH);
    
    // Check if file exists
    if (!fs.existsSync(QUESTIONS_JSON_PATH)) {
      console.error('Questions JSON file not found:', QUESTIONS_JSON_PATH);
      questionCache = [];
      return questionCache;
    }

    // Read and parse JSON file
    const jsonData = fs.readFileSync(QUESTIONS_JSON_PATH, 'utf8');
    const parsedData = JSON.parse(jsonData);
    
    // Validate JSON structure
    if (!Array.isArray(parsedData.questions)) {
      console.error('Invalid JSON structure: questions should be an array');
      questionCache = [];
      return questionCache;
    }

    // Process and validate each question
    const processedQuestions = parsedData.questions
      .map((question, index) => processQuestionData(question, index))
      .filter(q => q !== null); // Remove invalid questions

    console.log('Total processed questions:', processedQuestions.length);

    if (processedQuestions.length === 0) {
      console.warn('No valid questions found in JSON file');
      questionCache = [];
      return questionCache;
    }

    questionCache = processedQuestions;

    // Log statistics
    const stats = generateStatistics(questionCache);
    console.log('Question Statistics:', stats);

    // Log first few questions for verification
    console.log('Sample questions (first 3):');
    questionCache.slice(0, 3).forEach((q, i) => {
      console.log(`  ${i + 1}. Key: ${q.questionKey}, Level: ${q.questionLevel}, Final Level: ${q.finalLevel}`);
    });

    return questionCache;

  } catch (error) {
    console.error('Error loading JSON file:', error);
    questionCache = [];
    return questionCache;
  }
}

/**
 * Process and validate a single question object
 * @param {Object} question - Raw question object from JSON
 * @param {number} index - Question index for debugging
 * @returns {Object|null} - Processed question object or null if invalid
 */
function processQuestionData(question, index) {
  try {
    // Extract and process question level
    const rawLevel = String(question.questionLevel || '').trim();
    const { difficulty, levelNumber } = parseQuestionLevel(rawLevel);

    // Process final level
    let finalLevel = 1; // default value
    if (question.finalLevel !== undefined) {
      if (typeof question.finalLevel === 'number') {
        finalLevel = question.finalLevel;
      } else {
        const finalLevelStr = String(question.finalLevel).toLowerCase().trim();
        if (finalLevelStr.includes('level')) {
          const match = finalLevelStr.match(/level\s*(\d+)/);
          finalLevel = match ? parseInt(match[1], 10) : 1;
        } else {
          const parsed = parseInt(question.finalLevel, 10);
          finalLevel = isNaN(parsed) ? 1 : parsed;
        }
      }
    }

    const questionObj = {
      questionKey: String(question.questionKey || '').trim(),
      questionLevel: rawLevel,
      difficulty: difficulty,
      levelNumber: levelNumber,
      question: String(question.question || '').trim(),
      input1: question.input1 || '',
      input2: question.input2 || '',
      answer: question.answer || '',
      symbol: String(question.symbol || '').trim(),
      valid: question.valid || '',
      combo: question.combo || '',
      finalLevel: finalLevel,
      _index: index
    };

    // Validate that we have essential data
    if (!questionObj.questionKey && !questionObj.question) {
      console.warn(`Skipping question at index ${index}: missing key data`);
      return null;
    }

    return questionObj;

  } catch (error) {
    console.error(`Error processing question at index ${index}:`, error);
    return null;
  }
}

/**
 * Parse question level string into difficulty and level number
 * @param {string} rawLevel - Raw level string like "Easy 1"
 * @returns {Object} - Object with difficulty and levelNumber
 */
function parseQuestionLevel(rawLevel) {
  if (!rawLevel) {
    return { difficulty: 'unknown', levelNumber: null };
  }

  const parts = rawLevel.split(/\s+/);
  const difficultyPart = (parts[0] || '').toLowerCase().trim();
  const levelPart = parts[1] || '';

  const difficulty = ['easy', 'medium', 'hard'].includes(difficultyPart) 
    ? difficultyPart 
    : 'unknown';
  
  const levelNumber = levelPart ? parseInt(levelPart, 10) : null;

  return { difficulty, levelNumber };
}

/**
 * Generate statistics about loaded questions
 * @param {Array} questions - Array of question objects
 * @returns {Object} - Statistics object
 */
function generateStatistics(questions) {
  const stats = {
    total: questions.length,
    byDifficulty: {},
    byFinalLevel: {},
    withValidData: 0
  };

  questions.forEach(q => {
    // Count by difficulty
    stats.byDifficulty[q.difficulty] = (stats.byDifficulty[q.difficulty] || 0) + 1;
    
    // Count by final level
    stats.byFinalLevel[q.finalLevel] = (stats.byFinalLevel[q.finalLevel] || 0) + 1;
    
    // Count questions with all required data
    if (q.questionKey && q.question && q.answer) {
      stats.withValidData++;
    }
  });

  return stats;
}

/**
 * Get cached questions or reload if cache is empty
 * @returns {Array} Array of question objects
 */
function getQuestions() {
  return loadQuestionsFromJSON();
}

/**
 * Clear the question cache (useful for reloading)
 */
function clearCache() {
  questionCache = null;
  console.log('Question cache cleared');
}

/**
 * Reload questions from JSON file (clears cache and reloads)
 * @returns {Array} Array of question objects
 */
function reloadQuestions() {
  clearCache();
  return loadQuestionsFromJSON();
}

/**
 * Get questions filtered by difficulty
 * @param {string} difficulty - 'easy', 'medium', or 'hard'
 * @returns {Array} Filtered questions
 */
function getQuestionsByDifficulty(difficulty) {
  const questions = getQuestions();
  return questions.filter(q => q.difficulty === difficulty.toLowerCase());
}

/**
 * Get questions filtered by final level
 * @param {number} level - Final level number
 * @returns {Array} Filtered questions
 */
function getQuestionsByFinalLevel(level) {
  const questions = getQuestions();
  return questions.filter(q => q.finalLevel === level);
}

/**
 * Get a random question by difficulty and/or final level
 * @param {string} difficulty - Optional difficulty filter
 * @param {number} finalLevel - Optional final level filter
 * @returns {Object|null} Random question or null if none found
 */
function getRandomQuestion(difficulty = null, finalLevel = null) {
  let questions = getQuestions();
  
  if (difficulty) {
    questions = questions.filter(q => q.difficulty === difficulty.toLowerCase());
  }
  
  if (finalLevel) {
    questions = questions.filter(q => q.finalLevel === finalLevel);
  }
  
  if (questions.length === 0) {
    return null;
  }
  
  const randomIndex = Math.floor(Math.random() * questions.length);
  return questions[randomIndex];
}

/**
 * Search questions by text (question content or key)
 * @param {string} searchTerm - Search term
 * @returns {Array} Matching questions
 */
function searchQuestions(searchTerm) {
  const questions = getQuestions();
  const term = searchTerm.toLowerCase();
  
  return questions.filter(q => 
    q.question.toLowerCase().includes(term) ||
    q.questionKey.toLowerCase().includes(term)
  );
}

/**
 * Get question by exact key
 * @param {string} key - Question key
 * @returns {Object|null} Question object or null if not found
 */
function getQuestionByKey(key) {
  const questions = getQuestions();
  return questions.find(q => q.questionKey === key) || null;
}

module.exports = {
  loadQuestionsFromJSON,
  getQuestions,
  getQuestionsByDifficulty,
  getQuestionsByFinalLevel,
  getRandomQuestion,
  searchQuestions,
  getQuestionByKey,
  reloadQuestions,
  clearCache
};