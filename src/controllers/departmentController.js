const express = require("express");
const router = express.Router();
const departmentService = require("../services/department.service");

const authMiddleware = require("../middlewares/authMiddleware");

router.use(authMiddleware);

router.post("/", async (req, res, next) => {
    const { name, is_active } = req.body;

    if (!name) {
        return res.status(400).json({
            status: 400,
            message: "name is required",
            data: null,
        });
    }

    try {
        const department = await departmentService.createDepartment(name, is_active);
        return res.status(201).json({
            status: 201,
            message: "Department created successfully",
            data: department,
        });
    } catch (error) {
        if (error.code === "P2002") {
            return res.status(409).json({
                status: 409,
                message: "Department name already exists",
                data: null,
            });
        }
        next(error);
    }
});

router.get("/", async (req, res, next) => {
    try {
        const departments = await departmentService.getAllDepartments();
        return res.status(200).json(departments);
    } catch (error) {
        next(error);
    }
});

router.get("/:id", async (req, res, next) => {
    try {
        const department = await departmentService.getDepartmentById(req.params.id);
        if (!department) {
            return res.status(404).json({
                status: 404,
                message: "Department not found",
                data: null,
            });
        }
        return res.status(200).json(department);
    } catch (error) {
        next(error);
    }
});

router.put("/:id", async (req, res, next) => {
    const { name, is_active } = req.body;

    if (name === undefined && is_active === undefined) {
        return res.status(400).json({
            status: 400,
            message: "At least one of name or is_active is required",
            data: null,
        });
    }

    try {
        const department = await departmentService.updateDepartment(
            req.params.id,
            name,
            is_active
        );
        return res.status(200).json(department);
    } catch (error) {
        if (error.code === "P2025") {
            return res.status(404).json({
                status: 404,
                message: "Department not found",
                data: null,
            });
        }
        if (error.code === "P2002") {
            return res.status(409).json({
                status: 409,
                message: "Department name already exists",
                data: null,
            });
        }
        next(error);
    }
});

router.delete("/:id", async (req, res, next) => {
    try {
        const department = await departmentService.deleteDepartment(req.params.id);
        if (!department) {
            return res.status(404).json({
                status: 404,
                message: "Department not found",
                data: null,
            });
        }
        return res.status(200).json({
            status: 200,
            message: "Department deleted successfully",
            data: department,
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

module.exports = router;
