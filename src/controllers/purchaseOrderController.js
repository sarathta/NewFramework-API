const express = require("express");
const router = express.Router();
const purchaseOrderService = require("../services/purchase-order.service");
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

router.get("/approved-indents", async (req, res, next) => {
    try {
        const approvedIndents = await purchaseOrderService.getApprovedIndents();
        return res.status(200).json({
            status: 200,
            message: "Approved indents fetched successfully",
            data: approvedIndents,
        });
    } catch (error) {
        next(error);
    }
});

router.get("/approved-materials", async (req, res, next) => {
    try {
        const approvedMaterials = await purchaseOrderService.getApprovedMaterials();
        return res.status(200).json(approvedMaterials);
    } catch (error) {
        next(error);
    }
});

router.post("/draft", async (req, res, next) => {
    try {
        const draft = await purchaseOrderService.createDraft(req.body);
        return res.status(201).json({
            status: 201,
            message: "Purchase order draft created successfully",
            data: draft,
        });
    } catch (error) {
        return handleServiceError(error, res, next);
    }
});

router.get("/draft", async (req, res, next) => {
    try {
        const drafts = await purchaseOrderService.getDrafts();
        return res.status(200).json(drafts);
    } catch (error) {
        next(error);
    }
});

router.post("/", async (req, res, next) => {
    try {
        const purchaseOrder = await purchaseOrderService.createPurchaseOrder(req.body, {
            roleId: req.user.role_id,
            departmentId: req.user.department_id,
        });
        return res.status(201).json({
            status: 201,
            message: "Purchase order created successfully",
            data: purchaseOrder,
        });
    } catch (error) {
        return handleServiceError(error, res, next);
    }
});

router.put("/:id", async (req, res, next) => {
    try {
        const purchaseOrder = await purchaseOrderService.updatePurchaseOrder(
            req.params.id,
            req.body,
            {
                roleId: req.user.role_id,
                departmentId: req.user.department_id,
            }
        );
        return res.status(200).json({
            status: 200,
            message: "Purchase order updated successfully",
            data: purchaseOrder,
        });
    } catch (error) {
        return handleServiceError(error, res, next);
    }
});

router.delete("/:id", async (req, res, next) => {
    try {
        const purchaseOrder = await purchaseOrderService.deletePurchaseOrder(req.params.id);
        return res.status(200).json({
            status: 200,
            message: "Purchase order deleted successfully",
            data: purchaseOrder,
        });
    } catch (error) {
        return handleServiceError(error, res, next);
    }
});

router.get("/", async (req, res, next) => {
    try {
        const purchaseOrders = await purchaseOrderService.getPurchaseOrders();
        return res.status(200).json(purchaseOrders);
    } catch (error) {
        next(error);
    }
});

module.exports = router;
