const express = require('express');
const router = express.Router();
const authController = require('../controller/authController')

router.post('/verifymail', authController.sendVerificationMail);
router.post('/login', authController.login)
router.post('/signup', authController.signup)
router.post('/sendForgotPassOtp', authController.sendForgotPasswordOtp);
router.post('/changePass', authController.changePass);

module.exports = router;