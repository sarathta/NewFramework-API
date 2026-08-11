const express = require("express");
const router = express.Router();
const companySettingsService = require("../services/company-settings.service");
const authMiddleware = require("../middlewares/authMiddleware");
const { companyLogoUpload } = require("../middlewares/companyLogoUpload");

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
    if (error instanceof Error && error.message.includes("Only image")) {
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
        const settings = await companySettingsService.getCompanySettings();
        return res.status(200).json(settings);
    } catch (error) {
        next(error);
    }
});

router.post("/", companyLogoUpload.single("logo"), async (req, res, next) => {
    try {
        const settings = await companySettingsService.createCompanySettings(
            req.body,
            req.file
        );
        return res.status(201).json({
            status: 201,
            message: "Company settings created successfully",
            data: settings,
        });
    } catch (error) {
        return handleMulterError(error, res, next);
    }
});

router.put("/:id", companyLogoUpload.single("logo"), async (req, res, next) => {
    try {
        const settings = await companySettingsService.updateCompanySettings(
            req.params.id,
            req.body,
            req.file
        );
        return res.status(200).json(settings);
    } catch (error) {
        return handleMulterError(error, res, next);
    }
});

module.exports = router;
