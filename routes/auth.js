const express = require('express');
const router = express.Router();
const authController = require('../controller/authController')

router.post('/verifymail', authController.sendVerificationMail);
router.post('/login', authController.login)
router.post('/signup', authController.signup)

module.exports = router;