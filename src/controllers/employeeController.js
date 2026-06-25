const express = require("express");
const router = express.Router();
const employeeService = require("../services/employee.service");

router.post("/", async (req, res, next) => {
    const { employee_code, employee_name } = req.body;

    if (!employee_code || !employee_name) {
        return res.status(400).json({
            status: 400,
            message: "employee_code and employee_name are required",
            data: null,
        });
    }

    try {
        const employee = await employeeService.createEmployee(req.body);
        return res.status(201).json({
            status: 201,
            message: "Employee created successfully",
            data: employee,
        });
    } catch (error) {
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
                message: "Employee code, email, or username already exists",
                data: null,
            });
        }
        next(error);
    }
});

router.get("/", async (req, res, next) => {
    try {
        const employees = await employeeService.getAllEmployees();
        return res.status(200).json(employees);
    } catch (error) {
        next(error);
    }
});

router.get("/:id", async (req, res, next) => {
    try {
        const employee = await employeeService.getEmployeeById(req.params.id);
        if (!employee) {
            return res.status(404).json({
                status: 404,
                message: "Employee not found",
                data: null,
            });
        }
        return res.status(200).json(employee);
    } catch (error) {
        next(error);
    }
});

router.put("/:id", async (req, res, next) => {
    try {
        const employee = await employeeService.updateEmployee(req.params.id, req.body);
        return res.status(200).json({
            status: 200,
            message: "Employee updated successfully",
            data: employee,
        });
    } catch (error) {
        if (error.code === "P2025") {
            return res.status(404).json({
                status: 404,
                message: "Employee not found",
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
                message: "Employee code, email, or username already exists",
                data: null,
            });
        }
        next(error);
    }
});

router.delete("/:id", async (req, res, next) => {
    try {
        const employee = await employeeService.deleteEmployee(req.params.id);
        if (!employee) {
            return res.status(404).json({
                status: 404,
                message: "Employee not found",
                data: null,
            });
        }
        return res.status(200).json({
            status: 200,
            message: "Employee deleted successfully",
            data: employee,
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
