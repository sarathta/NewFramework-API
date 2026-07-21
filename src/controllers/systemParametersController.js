const express = require("express");
const router = express.Router();
const systemParameterService = require("../services/system-parameters.service");
const authMiddleware = require("../middlewares/authMiddleware");

router.use(authMiddleware);

router.get("/", async (req, res, next) => {
    try {
        const parameters = await systemParameterService.getAllSystemParameters();
        return res.status(200).json(parameters);
    } catch (error) {
        next(error);
    }
});

router.put("/", async (req, res, next) => {
    const { id, value, uom } = req.body;

    if (id === undefined || id === null || id === "") {
        return res.status(400).json({
            status: 400,
            message: "id is required",
            data: null,
        });
    }

    try {
        const parameter = await systemParameterService.updateSystemParameter(id, value, uom);
        return res.status(200).json(parameter);
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({
                status: error.statusCode,
                message: error.message,
                data: null,
            });
        }
        next(error);
    }
});

module.exports = router;
