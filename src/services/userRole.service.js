const { prisma } = require("../config/db");

async function getAllUserRoles() {
    return prisma.mst_user_roles.findMany({
        orderBy: { id: "asc" },
    });
}

async function getUserRoleById(id) {
    return prisma.mst_user_roles.findUnique({
        where: { id: Number(id) },
    });
}

async function createUserRole(role_name, description) {
    return prisma.mst_user_roles.create({
        data: { role_name, description },
    });
}

async function updateUserRole(id, role_name, description) {
    return prisma.mst_user_roles.update({
        where: { id: Number(id) },
        data: { role_name, description },
    });
}

async function deleteUserRole(id) {
    const role = await prisma.mst_user_roles.findUnique({
        where: { id: Number(id) },
        include: { mst_employees: { select: { id: true } } },
    });

    if (!role) {
        return null;
    }

    if (role.mst_employees.length > 0) {
        const error = new Error("Cannot delete role assigned to employees");
        error.statusCode = 409;
        throw error;
    }

    return prisma.mst_user_roles.delete({
        where: { id: Number(id) },
    });
}

module.exports = {
    getAllUserRoles,
    getUserRoleById,
    createUserRole,
    updateUserRole,
    deleteUserRole,
};
