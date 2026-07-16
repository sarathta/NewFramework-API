const express = require("express");
const router = express.Router();
const vendorMaterialService = require("../services/vendor-material.service");
const authMiddleware = require("../middlewares/authMiddleware");

router.use(authMiddleware);

router.get("/", async (req, res, next) => {
    try {
        const vendorMaterials = await vendorMaterialService.getVendorMaterials();
        return res.status(200).json(vendorMaterials);
    } catch (error) {
        next(error);
    }
});

router.post("/", async (req, res, next) => {
    const { vendor_id, material_ids } = req.body;

    if (!vendor_id) {
        return res.status(400).json({
            status: 400,
            message: "vendor_id is required",
            data: null,
        });
    }

    if (!Array.isArray(material_ids)) {
        return res.status(400).json({
            status: 400,
            message: "material_ids must be an array",
            data: null,
        });
    }

    try {
        const vendorMaterials = await vendorMaterialService.saveVendorMaterials(
            vendor_id,
            material_ids
        );
        return res.status(200).json(vendorMaterials);
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
