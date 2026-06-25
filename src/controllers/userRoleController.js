const express = require("express");
const router = express.Router();
const userRoleService = require("../services/userRole.service");

router.post("/", async (req, res, next) => {
    const { role_name, description } = req.body;

    if (!role_name || !description) {
        return res.status(400).json({
            status: 400,
            message: "role_name and description are required",
            data: null
        });
    }

    try {
        const newRole = await userRoleService.createUserRole(role_name, description);
        return res.status(201).json({
            status: 201,
            message: "User role created successfully",
            data: newRole
        });
    } catch (error) {
        if (error.code === "P2002") {
            return res.status(409).json({
                message: "Role name already exists",

            });
        }
        next(error);
    }
});

router.get("/", async (req, res, next) => {
    try {
        const roles = await userRoleService.getAllUserRoles();
        return res.status(200).json(roles);
    } catch (error) {
        next(error);
    }
});

router.get("/:id", async (req, res, next) => {
    try {
        const role = await userRoleService.getUserRoleById(req.params.id);
        if (!role) {
            return res.status(404).json({
                status: 404,
                message: "User role not found",
                data: null
            });
        }
        handleResponse(res, 200, "User role fetched successfully", role);
    } catch (error) {
        next(error);
    }
});

router.put("/:id", async (req, res, next) => {
    const { role_name, description } = req.body;

    if (!role_name || !description) {
        return res.status(400).json({
            status: 400,
            message: "role_name and description are required",
            data: null
        });
    }

    try {
        const updatedRole = await userRoleService.updateUserRole(
            req.params.id,
            role_name,
            description
        );
        return res.status(200).json({
            status: 200,
            message: "User role updated successfully",
            data: updatedRole
        });
    } catch (error) {
        if (error.code === "P2025") {
            return handleResponse(res, 404, "User role not found", null);
        }
        if (error.code === "P2002") {
            return handleResponse(res, 409, "Role name already exists", null);
        }
        next(error);
    }
});

router.delete("/:id", async (req, res, next) => {
    try {
        const deletedRole = await userRoleService.deleteUserRole(req.params.id);
        if (!deletedRole) {
            return res.status(404).json({
                status: 404,
                message: "User role not found",
                data: null
            });
        }
        return res.status(200).json({
            status: 200,
            message: "User role deleted successfully",
            data: deletedRole
        });
    } catch (error) {
        if (error.statusCode === 409) {
            return res.status(409).json({
                status: 409,
                message: error.message,
                data: null
            });
        }
        next(error);
    }
});

module.exports = router;
