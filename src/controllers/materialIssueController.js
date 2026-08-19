const express = require("express");
const router = express.Router();
const materialIssueService = require("../services/material-issue.service");
const authMiddleware = require("../middlewares/authMiddleware");

router.use(authMiddleware);

router.get("/", async (req, res, next) => {
    try {
        const materialIssues = await materialIssueService.getMaterialIssueIndents();
        return res.status(200).json(materialIssues);
    } catch (error) {
        next(error);
    }
});

router.post("/:id/issue", async (req, res, next) => {
    try {
        const result = await materialIssueService.issueMaterial(req.params.id, req.body);
        return res.status(200).json({
            status: 200,
            message: "Material issued successfully",
            data: result,
        });
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