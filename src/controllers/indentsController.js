const express = require("express");
const router = express.Router();
const indentService = require("../services/indents.service");
const authMiddleware = require("../middlewares/authMiddleware");

router.use(authMiddleware);


module.exports = router;