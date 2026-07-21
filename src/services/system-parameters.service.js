const { prisma } = require("../config/db");

async function getAllSystemParameters() {
    return prisma.mst_system_parameters.findMany({
        orderBy: { id: "asc" },
    });
}

async function updateSystemParameter(id, value, uom) {
    const parameter = await prisma.mst_system_parameters.findUnique({
        where: { id: Number(id) },
    });

    if (!parameter) {
        const error = new Error("System parameter not found");
        error.statusCode = 404;
        throw error;
    }

    const data = {};
    if (value !== undefined) data.value = value;
    if (uom !== undefined) data.uom = uom;

    return prisma.mst_system_parameters.update({
        where: { id: Number(id) },
        data,
    });
}

module.exports = {
    getAllSystemParameters,
    updateSystemParameter,
};
