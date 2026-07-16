const express = require("express");
const router = express.Router();
const areaService = require("../services/area.service");

const authMiddleware = require("../middlewares/authMiddleware");

router.use(authMiddleware);

router.get("/", async (req, res, next) => {
    try {
        const areas = await areaService.getAllAreas();
        return res.status(200).json(areas);
    } catch (error) {
        next(error);
    }
});

router.get("/:id", async (req, res, next) => {
    try {
        const area = await areaService.getAreaById(req.params.id);
        if (!area) {
            return res.status(404).json({
                status: 404,
                message: "area not found",
                data: null,
            });
        }
        return res.status(200).json(area);
    } catch (error) {
        next(error);
    }
});

router.post("/", async (req, res, next) => {
    const { name } = req.body;

    if (!name) {
        return res.status(400).json({
            status: 400,
            message: "name is required",
            data: null,
        });
    }

    try {
        const area = await areaService.createArea(name);
        return res.status(201).json({
            status: 201,
            message: "area created successfully",
            data: area,
        });
    } catch (error) {
        if (error.code === "P2002") {
            return res.status(409).json({
                status: 409,
                message: "area name already exists",
                data: null,
            });
        }
        next(error);
    }
});

router.put("/:id", async (req, res, next) => {
    const { name } = req.body;

    if (name === undefined ) {
        return res.status(400).json({
            status: 400,
            message: "name is required",
            data: null,
        });
    }

    try {
        const area = await areaService.updateArea(
            req.params.id,
            name
        );
        return res.status(200).json(area);
    } catch (error) {
        if (error.code === "P2025") {
            return res.status(404).json({
                status: 404,
                message: "area not found",
                data: null,
            });
        }
        if (error.code === "P2002") {
            return res.status(409).json({
                status: 409,
                message: "area name already exists",
                data: null,
            });
        }
        next(error);
    }
});

router.delete("/:id", async (req, res, next) => {
    try {
        const area = await areaService.deleteArea(req.params.id);
        if (!area) {
            return res.status(404).json({
                status: 404,
                message: "area not found",
                data: null,
            });
        }
        return res.status(200).json({
            status: 200,
            message: "area deleted successfully",
            data: area,
        });
    } catch (error) {
        if (error.statusCode === 409) {
            return res.status(409).json({
                status: 409,
                message: error.message,
                data: null,
            });
        }
        next(error);
    }
});


module.exports = router