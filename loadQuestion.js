const xlsx = require('xlsx');
const path = require('path');

// Cache for loaded questions
let questionCache = null;

// Path to your Excel file - update this path as needed
const WORKBOOK_PATH = './config/questionmaster_final.xlsx'; // Update this to your actual file path

/**
 * Load questions from Excel file with multi-row headers and cache the results
 * @returns {Array} Array of question objects
 */
function loadQuestionsFromExcel() {
  // Return cached data if already loaded
  if (questionCache) {
    console.log('Returning cached questions:', questionCache.length);
    return questionCache;
  }

  try {
    console.log('Loading Excel file from:', WORKBOOK_PATH);
    
    // Read the Excel file
    const workbook = xlsx.readFile(WORKBOOK_PATH);
    
    // Filter sheets that start with "QM" (Question Management)
    const sheetNames = workbook.SheetNames.filter(name => name.startsWith('QM'));
    console.log('Found QM sheets:', sheetNames);
    
    if (sheetNames.length === 0) {
      console.warn('No sheets starting with "QM" found. Available sheets:', workbook.SheetNames);
      questionCache = [];
      return questionCache;
    }

    const allRows = [];

    // Process each QM sheet
    sheetNames.forEach(sheetName => {
      console.log(`Processing sheet: ${sheetName}`);
      const worksheet = workbook.Sheets[sheetName];
      
      // Get the raw data including headers
      const rawData = xlsx.utils.sheet_to_json(worksheet, { 
        header: 1, // Use array of arrays format
        defval: '',
        raw: false
      });
      
      console.log(`Sheet ${sheetName} has ${rawData.length} rows`);
      
      if (rawData.length < 3) {
        console.warn(`Sheet ${sheetName} doesn't have enough rows (need at least 3 for headers + data)`);
        return;
      }

      // Extract the actual column headers from row 2 (index 1)
      const headerRow = rawData[1]; // Second row contains the actual headers
      console.log('Header row:', headerRow);
      
      // Create column mapping based on the actual header positions
      const columnMapping = createColumnMapping(headerRow);
      console.log('Column mapping:', columnMapping);
      
      // Process data rows (starting from row 3, index 2)
      const dataRows = rawData.slice(2);
      
      dataRows.forEach((row, index) => {
        if (row && row.length > 0 && row[0]) { // Skip empty rows
          const processedRow = processDataRow(row, columnMapping, index);
          if (processedRow) {
            allRows.push(processedRow);
          }
        }
      });
    });

    console.log('Total processed rows:', allRows.length);

    if (allRows.length === 0) {
      console.warn('No valid data rows found in Excel file');
      questionCache = [];
      return questionCache;
    }

    questionCache = allRows;

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
    console.error('Error loading Excel file:', error);
    questionCache = [];
    return questionCache;
  }
}

/**
 * Create column mapping based on header row
 * @param {Array} headerRow - Array of header values from row 2
 * @returns {Object} - Column index mapping
 */
function createColumnMapping(headerRow) {
  const mapping = {};
  
  headerRow.forEach((header, index) => {
    if (!header) return;
    
    const headerLower = header.toString().toLowerCase().trim();
    
    // Map headers to our standard field names
    if (headerLower.includes('question key') || headerLower === 'question key') {
      mapping.questionKey = index;
    } else if (headerLower.includes('question level') || headerLower === 'question level') {
      mapping.questionLevel = index;
    } else if (headerLower === 'question' || headerLower.includes('question details')) {
      mapping.question = index;
    } else if (headerLower === 'input 1' || headerLower.includes('input 1')) {
      mapping.input1 = index;
    } else if (headerLower === 'input 2' || headerLower.includes('input 2')) {
      mapping.input2 = index;
    } else if (headerLower === 'answer') {
      mapping.answer = index;
    } else if (headerLower === 'symbol') {
      mapping.symbol = index;
    } else if (headerLower === 'valid') {
      mapping.valid = index;
    } else if (headerLower === 'combo') {
      mapping.combo = index;
    } else if (headerLower === 'final level' || headerLower.includes('final level')) {
      mapping.finalLevel = index;
    }
  });
  
  return mapping;
}

/**
 * Process a single data row
 * @param {Array} row - Array of cell values
 * @param {Object} columnMapping - Column index mapping
 * @param {number} rowIndex - Row index for debugging
 * @returns {Object|null} - Processed question object or null if invalid
 */
function processDataRow(row, columnMapping, rowIndex) {
  try {
    // Extract and process question level
    const rawLevel = String(row[columnMapping.questionLevel] || '').trim();
    const { difficulty, levelNumber } = parseQuestionLevel(rawLevel);

    // Extract final level
    const finalLevelValue = row[columnMapping.finalLevel];
    let finalLevel = 1; // default value
    
    if (finalLevelValue) {
      const finalLevelStr = String(finalLevelValue).toLowerCase().trim();
      if (finalLevelStr.includes('level')) {
        // Extract number from "Level 1", "level 2", etc.
        const match = finalLevelStr.match(/level\s*(\d+)/);
        finalLevel = match ? parseInt(match[1], 10) : 1;
      } else {
        // Direct number conversion
        const parsed = parseInt(finalLevelValue, 10);
        finalLevel = isNaN(parsed) ? 1 : parsed;
      }
    }

    const questionObj = {
      questionKey: String(row[columnMapping.questionKey] || '').trim(),
      questionLevel: rawLevel,
      difficulty: difficulty,
      levelNumber: levelNumber,
      question: String(row[columnMapping.question] || '').trim(),
      input1: row[columnMapping.input1] || '',
      input2: row[columnMapping.input2] || '',
      answer: row[columnMapping.answer] || '',
      symbol: String(row[columnMapping.symbol] || '').trim(),
      valid: row[columnMapping.valid] || '',
      combo: row[columnMapping.combo] || '',
      finalLevel: finalLevel,
      _rowIndex: rowIndex
    };

    // Validate that we have essential data
    if (!questionObj.questionKey && !questionObj.question) {
      return null; // Skip rows without key data
    }

    return questionObj;

  } catch (error) {
    console.error(`Error processing row ${rowIndex}:`, error);
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
  return loadQuestionsFromExcel();
}

/**
 * Clear the question cache (useful for reloading)
 */
function clearCache() {
  questionCache = null;
  console.log('Question cache cleared');
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

module.exports = {
  loadQuestionsFromExcel,
  getQuestions,
  getQuestionsByDifficulty,
  getQuestionsByFinalLevel,
  getRandomQuestion,
  clearCache
};