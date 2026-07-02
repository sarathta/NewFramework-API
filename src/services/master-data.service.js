const { prisma } = require("../config/db");


async function getMaterials() {
    return prisma.mst_materials.findMany({
        orderBy: { id: "asc" },
    });
}

async function getUoms() {
    return prisma.mst_uoms.findMany({
        orderBy: { id: "asc" },
    });
}

async function getTaxCodes() {
    return prisma.mst_tax_codes.findMany({
        orderBy: { id: "asc" },
    });
}

async function getCurrencies() {
    return prisma.mst_currencies.findMany({
        orderBy: { id: "asc" },
    });
}

async function getCurrencyRates() {
    return prisma.mst_currency_rates.findMany({
        orderBy: { id: "asc" },
    });
}

async function getMaterialCategories() {
    return prisma.mst_material_categories.findMany({
        orderBy: { id: "asc" },
    });
}

async function getVendorMaterials() {
    return prisma.mst_vendor_materials.findMany({
        orderBy: { id: "asc" },
    });
}

async function getVendors() {
    return prisma.mst_vendors.findMany({
        orderBy: { id: "asc" },
    });
}

async function getInventoryControlThresholds() {
    return prisma.mst_inventory_control_thresholds.findMany({
        orderBy: { id: "asc" },
    });
}

module.exports = {
    getMaterials,
    getUoms,
    getTaxCodes,
    getCurrencies,
    getCurrencyRates,
    getInventoryControlThresholds,
    getMaterialCategories,
    getVendorMaterials,
    getVendors,
};