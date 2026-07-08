const { prisma } = require("../config/db");


async function getAllStocks() {
    return prisma.txn_stock_summary.findMany({
        orderBy: { id: "asc" },
    });
}


async function getStockById(id) {
    return prisma.txn_stock_summary.findUnique({
        where: { id },
    });
}

async function createStock(data) {
    return prisma.txn_stock_summary.create({
        data,
    });
}

async function updateStock(id, data) {
    data.updated_at = new Date();
    return prisma.txn_stock_summary.update({
        where: { id : Number(id) },
        data,
    });
}

async function deleteStock(id) {
    return prisma.txn_stock_summary.delete({
        where: { id : Number(id) },
    });
}


module.exports = {
    getAllStocks,
    getStockById,
    createStock,
    updateStock,
    deleteStock,
};