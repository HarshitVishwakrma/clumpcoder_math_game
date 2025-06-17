const express = require("express");
const questionController = require("../controller/questionController");
const auth = require("../middleware/auth");

const router = express.Router();

router.get("/", auth, questionController.getQuestion);
router.post("/submitAnswer", auth, questionController.submitAnswer);


module.exports = router;