const express = require("express");
const router = express.Router();
const masterDataService = require("../services/master-data.service");
const authMiddleware = require("../middlewares/authMiddleware");

router.use(authMiddleware);

router.get("/materials", async (req, res, next) => {
    try {
        const materials = await masterDataService.getMaterials();
        return res.status(200).json(materials);
    } catch (error) {
        next(error);
    }
});

router.get("/material-categories", async (req, res, next) => {
    try {
        const materialCategories = await masterDataService.getMaterialCategories();
        return res.status(200).json(materialCategories);
    } catch (error) {
        next(error);
    }
});

router.get("/uoms", async (req, res, next) => {
    try {
        const uoms = await masterDataService.getUoms();
        return res.status(200).json(uoms);
    } catch (error) {
        next(error);
    }
});

router.get("/tax-codes", async (req, res, next) => {
    try {
        const taxCodes = await masterDataService.getTaxCodes();
        return res.status(200).json(taxCodes);
    } catch (error) {
        next(error);
    }
});

router.get("/currencies", async (req, res, next) => {
    try {
        const currencies = await masterDataService.getCurrencies();
        return res.status(200).json(currencies);
    } catch (error) {
        next(error);
    }
});

router.get("/currency-rates", async (req, res, next) => {
    try {
        const currencyRates = await masterDataService.getCurrencyRates();
        return res.status(200).json(currencyRates);
    } catch (error) {
        next(error);
    }
});

router.get("/inventory-control-thresholds", async (req, res, next) => {
    try {
        const inventoryControlThresholds = await masterDataService.getInventoryControlThresholds();
        return res.status(200).json(inventoryControlThresholds);
    } catch (error) {
        next(error);
    }
});

router.get("/vendors", async (req, res, next) => {
    try {
        const vendors = await masterDataService.getVendors();
        return res.status(200).json(vendors);
    } catch (error) {
        next(error);
    }
});

router.get("/vendor-materials", async (req, res, next) => {
    try {
        const vendorMaterials = await masterDataService.getVendorMaterials();
        return res.status(200).json(vendorMaterials);
    } catch (error) {
        next(error);
    }
});


module.exports = router;