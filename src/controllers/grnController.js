const express = require("express");
const router = express.Router();
const grnService = require("../services/grn.service");
const authMiddleware = require("../middlewares/authMiddleware");
const { grnFileUpload } = require("../middlewares/grnFileUpload");

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

function handleMulterError(error, res, next) {
    if (
        error instanceof Error &&
        (error.message.includes("Only image") || error.message.includes("File too large"))
    ) {
        return res.status(400).json({
            status: 400,
            message: error.message,
            data: null,
        });
    }
    return handleServiceError(error, res, next);
}

router.get("/", async (req, res, next) => {
    try {
        const grns = await grnService.getGrns();
        return res.status(200).json({
            status: 200,
            message: "GRNs fetched successfully",
            data: grns,
        });
    } catch (error) {
        next(error);
    }
});

router.get("/phase-one", async (req, res, next) => {
    try {
        const grns = await grnService.getPhaseOneGrns();
        return res.status(200).json({
            status: 200,
            message: "Phase one GRNs fetched successfully",
            data: grns,
        });
    } catch (error) {
        next(error);
    }
});

router.get("/phase-two", async (req, res, next) => {
    try {
        const grns = await grnService.getPhaseTwoGrns();
        return res.status(200).json(grns);
    } catch (error) {
        next(error);
    }
});

router.post("/phase-one", async (req, res, next) => {
    try {
        const grn = await grnService.createPhaseOneGrn(req.body, req.user.id, {
            roleId: req.user.role_id,
            departmentId: req.user.department_id,
        });
        return res.status(201).json({
            status: 201,
            message: "GRN phase one created successfully",
            data: grn,
        });
    } catch (error) {
        return handleServiceError(error, res, next);
    }
});

router.put(
    "/phase-two/:id/confirm",
    grnFileUpload.single("file"),
    async (req, res, next) => {
        try {
            const grn = await grnService.confirmPhaseTwoGrn(
                req.params.id,
                req.body,
                req.file,
                req.user.id
            );
            return res.status(200).json({
                status: 200,
                message: "GRN phase two confirmed successfully",
                data: grn,
            });
        } catch (error) {
            return handleMulterError(error, res, next);
        }
    }
);

router.delete("/:id", async (req, res, next) => {
    try {
        const grn = await grnService.deleteGrn(req.params.id);
        return res.status(200).json({
            status: 200,
            message: "GRN deleted successfully",
            data: grn,
        });
    } catch (error) {
        return handleServiceError(error, res, next);
    }
});

module.exports = router;
