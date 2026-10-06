const express = require("express");
const router = express.Router();
const rulesService = require("../services/rules.service");
const authMiddleware = require("../middlewares/authMiddleware");

router.use(authMiddleware);

function handleServiceError(error, res, next) {
    if (error.statusCode) {
        return res.status(error.statusCode).json({
            status: error.statusCode,
            message: error.message,
            data: null,
        });
    }
    return next(error);
}

router.get("/", async (req, res, next) => {
    try {
        const rules = await rulesService.getRules();
        return res.status(200).json(rules);
    } catch (error) {
        return handleServiceError(error, res, next);
    }
});

router.post("/", async (req, res, next) => {
    try {
        const rules = await rulesService.updateRules(req.body);
        return res.status(200).json(rules);
    } catch (error) {
        return handleServiceError(error, res, next);
    }
});

module.exports = router;
