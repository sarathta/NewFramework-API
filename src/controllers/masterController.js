const express = require("express");
const router = express.Router();
const masterService = require("../services/master.service");
const importExportService = require("../services/masterImportExport.service");
const authMiddleware = require("../middlewares/authMiddleware");
const upload = require("../middlewares/uploadMiddleware");

router.use(authMiddleware);

function getFormat(req) {
    const format = String(req.query.format || "xlsx").toLowerCase();
    return format === "csv" ? "csv" : "xlsx";
}

router.get("/groups", async (req, res, next) => {
    try {
        return res.status(200).json(masterService.getGroups());
    } catch (error) {
        next(error);
    }
});

router.get("/:groupKey", async (req, res, next) => {
    try {
        const tables = masterService.getGroupTables(req.params.groupKey);
        if (!tables) {
            return res.status(404).json({
                status: 404,
                message: "Group not found",
                data: null,
            });
        }
        return res.status(200).json(tables);
    } catch (error) {
        next(error);
    }
});

router.get("/:groupKey/:masterKey/export", async (req, res, next) => {
    try {
        const { buffer, filename, contentType } = await importExportService.exportMasterData(
            req.params.groupKey,
            req.params.masterKey,
            getFormat(req)
        );

        res.setHeader("Content-Type", contentType);
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        return res.status(200).send(buffer);
    } catch (error) {
        if (error.statusCode === 404) {
            return res.status(404).json({
                status: 404,
                message: error.message,
                data: null,
            });
        }
        next(error);
    }
});

router.post("/:groupKey/:masterKey/import", upload.single("file"), async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                status: 400,
                message: "File is required. Upload using form field name 'file'.",
                data: null,
            });
        }

        const format = req.file.originalname.toLowerCase().endsWith(".csv")
            ? "csv"
            : getFormat(req);

        const result = await importExportService.importMasterData(
            req.params.groupKey,
            req.params.masterKey,
            req.file.buffer,
            format
        );

        return res.status(200).json({
            status: 200,
            message: "Import completed",
            data: result,
        });
    } catch (error) {
        if (error.statusCode === 404) {
            return res.status(404).json({
                status: 404,
                message: error.message,
                data: null,
            });
        }
        if (error.message === "Only CSV or Excel files are allowed") {
            return res.status(400).json({
                status: 400,
                message: error.message,
                data: null,
            });
        }
        next(error);
    }
});

router.get("/:groupKey/:masterKey", async (req, res, next) => {
    try {
        const page = await masterService.getMasterPage(req.params.groupKey, req.params.masterKey);
        return res.status(200).json(page);
    } catch (error) {
        if (error.statusCode === 404) {
            return res.status(404).json({
                status: 404,
                message: error.message,
                data: null,
            });
        }
        next(error);
    }
});

router.post("/:groupKey/:masterKey", async (req, res, next) => {
    try {
        const record = await masterService.createMasterRecord(
            req.params.groupKey,
            req.params.masterKey,
            req.body
        );
        return res.status(201).json({
            status: 201,
            message: "Record created successfully",
            data: record,
        });
    } catch (error) {
        if (error.statusCode === 400) {
            return res.status(400).json({
                status: 400,
                message: error.message,
                data: null,
            });
        }
        if (error.statusCode === 404) {
            return res.status(404).json({
                status: 404,
                message: error.message,
                data: null,
            });
        }
        if (error.code === "P2002") {
            return res.status(409).json({
                status: 409,
                message: "A record with this value already exists",
                data: null,
            });
        }
        if (error.code === "P2003") {
            return res.status(400).json({
                status: 400,
                message: "Invalid reference value",
                data: null,
            });
        }
        next(error);
    }
});

router.put("/:groupKey/:masterKey/:id", async (req, res, next) => {
    try {
        const record = await masterService.updateMasterRecord(
            req.params.groupKey,
            req.params.masterKey,
            req.params.id,
            req.body
        );
        return res.status(200).json({
            status: 200,
            message: "Record updated successfully",
            data: record,
        });
    } catch (error) {
        if (error.statusCode === 400) {
            return res.status(400).json({
                status: 400,
                message: error.message,
                data: null,
            });
        }
        if (error.statusCode === 404) {
            return res.status(404).json({
                status: 404,
                message: error.message,
                data: null,
            });
        }
        if (error.code === "P2025") {
            return res.status(404).json({
                status: 404,
                message: "Record not found",
                data: null,
            });
        }
        if (error.code === "P2002") {
            return res.status(409).json({
                status: 409,
                message: "A record with this value already exists",
                data: null,
            });
        }
        if (error.code === "P2003") {
            return res.status(400).json({
                status: 400,
                message: "Invalid reference value",
                data: null,
            });
        }
        next(error);
    }
});

router.delete("/:groupKey/:masterKey/:id", async (req, res, next) => {
    try {
        const record = await masterService.deleteMasterRecord(
            req.params.groupKey,
            req.params.masterKey,
            req.params.id
        );
        return res.status(200).json({
            status: 200,
            message: "Record deleted successfully",
            data: record,
        });
    } catch (error) {
        if (error.statusCode === 404) {
            return res.status(404).json({
                status: 404,
                message: error.message,
                data: null,
            });
        }
        if (error.code === "P2025") {
            return res.status(404).json({
                status: 404,
                message: "Record not found",
                data: null,
            });
        }
        if (error.code === "P2003") {
            return res.status(409).json({
                status: 409,
                message: "Cannot delete record because it is referenced by other records",
                data: null,
            });
        }
        next(error);
    }
});



module.exports = router;
