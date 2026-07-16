const { prisma } = require("../config/db");

async function getAllAreas() {
    return prisma.mst_area.findMany({
        orderBy: { id: "asc" },
    });
}

async function getAreaById(id) {
    return prisma.mst_area.findUnique({
        where: { id: Number(id) },
    });
}

async function createArea(name) {
    return prisma.mst_area.create({
        data: { name },
    });
}

async function updateArea(id, name) {
    const data = {};
    if (name !== undefined) data.name = name;

    return prisma.mst_area.update({
        where: { id: Number(id) },
        data,
    });
}

async function deleteArea(id) {
    const area = await prisma.mst_area.findUnique({
        where: { id: Number(id) },
        include: {
            mst_employees: { select: { id: true } },
            txn_indents: { select: { id: true } },
        },
    });

    if (!area) {
        return null;
    }

    if (area.mst_area.length > 0) {
        const error = new Error("Cannot delete department with assigned employees");
        error.statusCode = 409;
        throw error;
    }

    if (area.mst_area.length > 0) {
        const error = new Error("Cannot delete department with associated indents");
        error.statusCode = 409;
        throw error;
    }

    return prisma.mst_area.delete({
        where: { id: Number(id) },
    });
}

module.exports = {
    getAllAreas,
    getAreaById,
    createArea,
    updateArea,
    deleteArea,
};
