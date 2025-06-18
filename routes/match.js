const express = require('express');
const router = express.Router();
const matchController = require('../controller/matchController');
const auth = require('../middleware/auth')

router.post('/challenge', auth, matchController.createChallenge);

module.exports = router;