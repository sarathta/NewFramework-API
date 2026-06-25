const { prisma } = require("../config/db");

async function getAllDepartments() {
    return prisma.mst_departments.findMany({
        orderBy: { id: "asc" },
    });
}

async function getDepartmentById(id) {
    return prisma.mst_departments.findUnique({
        where: { id: Number(id) },
    });
}

async function createDepartment(name, is_active = true) {
    return prisma.mst_departments.create({
        data: { name, is_active },
    });
}

async function updateDepartment(id, name, is_active) {
    const data = {};
    if (name !== undefined) data.name = name;
    if (is_active !== undefined) data.is_active = is_active;

    return prisma.mst_departments.update({
        where: { id: Number(id) },
        data,
    });
}

async function deleteDepartment(id) {
    const department = await prisma.mst_departments.findUnique({
        where: { id: Number(id) },
        include: {
            mst_employees: { select: { id: true } },
            txn_indents: { select: { id: true } },
        },
    });

    if (!department) {
        return null;
    }

    if (department.mst_employees.length > 0) {
        const error = new Error("Cannot delete department with assigned employees");
        error.statusCode = 409;
        throw error;
    }

    if (department.txn_indents.length > 0) {
        const error = new Error("Cannot delete department with associated indents");
        error.statusCode = 409;
        throw error;
    }

    return prisma.mst_departments.delete({
        where: { id: Number(id) },
    });
}

module.exports = {
    getAllDepartments,
    getDepartmentById,
    createDepartment,
    updateDepartment,
    deleteDepartment,
};
