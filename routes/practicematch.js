const express = require('express');
const router = express.Router();
const practiceMatchController = require('../controller/practiceMatchController');
const auth = require('../middleware/auth');


router.post('/endMatch', auth, practiceMatchController.endPracticeSession);

module.exports = router;