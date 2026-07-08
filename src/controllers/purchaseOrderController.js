const express = require("express");
const router = express.Router();
const purchaseOrderService = require("../services/purchase-order.service");
const authMiddleware = require("../middlewares/authMiddleware");

router.use(authMiddleware);

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

module.exports = router;