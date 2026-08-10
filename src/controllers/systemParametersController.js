const express = require("express");
const router = express.Router();
const systemParameterService = require("../services/system-parameters.service");
const approvalRulesService = require("../services/approval-rules.service");
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

router.get("/approval-rules", async (req, res, next) => {
    try {
        const rules = await approvalRulesService.getApprovalRules(req.query.module);
        return res.status(200).json(rules);
    } catch (error) {
        next(error);
    }
});

router.get("/approval-rules/:id", async (req, res, next) => {
    try {
        const rule = await approvalRulesService.getApprovalRuleById(req.params.id);
        if (!rule) {
            return res.status(404).json({
                status: 404,
                message: "Approval rule not found",
                data: null,
            });
        }
        return res.status(200).json({
            status: 200,
            message: "Approval rule fetched successfully",
            data: rule,
        });
    } catch (error) {
        next(error);
    }
});

router.post("/approval-rules", async (req, res, next) => {
    try {
        const rule = await approvalRulesService.createApprovalRule(req.body);
        return res.status(201).json({
            status: 201,
            message: "Approval rule created successfully",
            data: rule,
        });
    } catch (error) {
        return handleServiceError(error, res, next);
    }
});

router.put("/approval-rules/:id", async (req, res, next) => {
    try {
        const rule = await approvalRulesService.updateApprovalRule(
            req.params.id,
            req.body
        );
        return res.status(200).json({
            status: 200,
            message: "Approval rule updated successfully",
            data: rule,
        });
    } catch (error) {
        return handleServiceError(error, res, next);
    }
});

router.delete("/approval-rules/:id", async (req, res, next) => {
    try {
        const rule = await approvalRulesService.deleteApprovalRule(req.params.id);
        return res.status(200).json({
            status: 200,
            message: "Approval rule deleted successfully",
            data: rule,
        });
    } catch (error) {
        return handleServiceError(error, res, next);
    }
});

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
        return handleServiceError(error, res, next);
    }
});

module.exports = router;
