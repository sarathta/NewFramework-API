const express = require("express");
const router = express.Router();
const stockService = require("../services/stock.service");
const authMiddleware = require("../middlewares/authMiddleware");

router.use(authMiddleware);

router.get("/", async (req, res, next) => {
    try {
        const stocks = await stockService.getAllStocks();
        return res.status(200).json(stocks);
    } catch (error) {
        next(error);
    }
});

router.get("/:id", async (req, res, next) => {
    try {
        const stock = await stockService.getStockById(req.params.id);
        return res.status(200).json(stock);
    } catch (error) {
        next(error);
    }
});

router.post("/", async (req, res, next) => {
    try {
        const stock = await stockService.createStock(req.body);
        return res.status(201).json(stock);
    } catch (error) {
        next(error);
    }
});

router.put("/:id", async (req, res, next) => {
    try {
        const stock = await stockService.updateStock(req.params.id, req.body);
        return res.status(200).json(stock);
    } catch (error) {
        next(error);
    }
});

router.delete("/:id", async (req, res, next) => {
    try {
        const stock = await stockService.deleteStock(req.params.id);
        return res.status(200).json(stock);
    } catch (error) {
        next(error);
    }
});

module.exports = router;