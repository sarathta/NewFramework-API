const express = require("express");
const router = express.Router();
const indentService = require("../services/indents.service");
const authMiddleware = require("../middlewares/authMiddleware");

router.use(authMiddleware);

router.post("/material-issue-request", async (req, res, next) => {
    try {
        const materialIssueRequest = await indentService.createMaterialIssueRequest(
            req.user.id,
            req.user.area_id,
            req.user.department_id,
            req.body
        );
        return res.status(201).json({
            status: 201,
            message: "Material issue request created successfully",
            data: materialIssueRequest,
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

router.post("/", async (req, res, next) => {
    try {
        const indent = await indentService.createIndent(
            req.user.id,
            req.user.role_id,
            req.user.area_id,
            req.user.department_id,
            req.body
        );
        return res.status(201).json({
            status: 201,
            message: "Indent created successfully",
            data: indent,
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

router.get("/", async (req, res, next) => {
    try {
        const indents = await indentService.getIndents(
            req.user.id,
            req.user.role_id,
            req.user.area_id,
            req.user.department_id
        );
        return res.status(200).json({
            status: 200,
            message: "Indents fetched successfully",
            data: indents,
        });
    } catch (error) {
        next(error);
    }
});

router.put("/:id/approve", async (req, res, next) => {
    try {
        const indent = await indentService.approveIndent(
            req.params.id,
            req.user.id,
            req.user.role_id,
            req.user.area_id,
            req.user.department_id
        );
        return res.status(200).json({
            status: 200,
            message: "Indent approved successfully",
            data: indent,
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

router.put("/:id/reject", async (req, res, next) => {
    const { rejection_reason } = req.body;

    try {
        const indent = await indentService.rejectIndent(
            req.params.id,
            req.user.id,
            req.user.role_id,
            req.user.area_id,
            req.user.department_id,
            rejection_reason
        );
        return res.status(200).json({
            status: 200,
            message: "Indent rejected successfully",
            data: indent,
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

router.put("/:id", async (req, res, next) => {
    try {
        const indent = await indentService.updateIndent(
            req.params.id,
            req.user.id,
            req.user.role_id,
            req.user.area_id,
            req.user.department_id,
            req.body
        );
        return res.status(200).json({
            status: 200,
            message: "Indent updated successfully",
            data: indent,
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

router.delete("/:id", async (req, res, next) => {
    try {
        const indent = await indentService.deleteIndent(
            req.params.id,
            req.user.id,
            req.user.role_id
        );
        return res.status(200).json({
            status: 200,
            message: "Indent deleted successfully",
            data: indent,
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