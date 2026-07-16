const bcrypt = require("bcryptjs");
const { prisma } = require("../config/db");

const employeeSelect = {
    id: true,
    employee_name: true,
    email: true,
    phone: true,
    designation: true,
    department_id: true,
    role_id: true,
    area_id: true,
    username: true,
    created_at: true,
    mst_departments: { select: { id: true, name: true } },
    mst_area: { select: { id: true, name: true } },
    mst_user_roles: { select: { id: true, role_name: true } },
};

async function getAllEmployees() {
    return prisma.mst_employees.findMany({
        select: employeeSelect,
        orderBy: { id: "asc" },
    });
}

async function getEmployeeById(id) {
    return prisma.mst_employees.findUnique({
        where: { id: Number(id) },
    });
}

async function validateForeignKeys(department_id, role_id) {
    if (department_id !== undefined && department_id !== null) {
        const department = await prisma.mst_departments.findUnique({
            where: { id: Number(department_id) },
        });
        if (!department) {
            const error = new Error("Department not found");
            error.statusCode = 404;
            throw error;
        }
    }

    if (role_id !== undefined && role_id !== null) {
        const role = await prisma.mst_user_roles.findUnique({
            where: { id: Number(role_id) },
        });
        if (!role) {
            const error = new Error("User role not found");
            error.statusCode = 404;
            throw error;
        }
    }
}

async function createEmployee(data) {
    const {
        employee_name,
        email,
        phone,
        designation,
        department_id,
        role_id,
        area_id,
        username,
        password,
    } = data;

    await validateForeignKeys(department_id, role_id ,area_id);

    const createData = {
        employee_name,
        email: email ?? null,
        phone: phone ?? null,
        designation: designation ?? null,
        department_id: department_id ?? null,
        role_id: role_id ?? null,
        area_id: area_id ?? null,
        username: username ?? null,
    };

    if (password) {
        const salt = await bcrypt.genSalt(10);
        createData.password = await bcrypt.hash(password, salt);
    }

    return prisma.mst_employees.create({
        data: createData,
        select: employeeSelect,
    });
}

async function updateEmployee(id, data) {
    const {
        employee_name,
        email,
        phone,
        designation,
        department_id,
        role_id,
        area_id,
        username,
        password,
    } = data;

    await validateForeignKeys(department_id, role_id, area_id);

    const updateData = {};
    if (employee_name !== undefined) updateData.employee_name = employee_name;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (designation !== undefined) updateData.designation = designation;
    if (department_id !== undefined) updateData.department_id = department_id;
    if (area_id !== undefined) updateData.area_id = area_id;
    if (role_id !== undefined) updateData.role_id = role_id;
    if (username !== undefined) updateData.username = username;

    if (password) {
        const salt = await bcrypt.genSalt(10);
        updateData.password = await bcrypt.hash(password, salt);
    }

    return prisma.mst_employees.update({
        where: { id: Number(id) },
        data: updateData,
        select: employeeSelect,
    });
}

async function deleteEmployee(id) {
    const employee = await prisma.mst_employees.findUnique({
        where: { id: Number(id) },
        include: {
            txn_indents_txn_indents_requested_byTomst_employees: { select: { id: true } },
            txn_indents_txn_indents_l1_approved_byTomst_employees: { select: { id: true } },
            txn_indents_txn_indents_l2_approved_byTomst_employees: { select: { id: true } },
        },
    });

    if (!employee) {
        return null;
    }

    const hasIndents =
        employee.txn_indents_txn_indents_requested_byTomst_employees.length > 0 ||
        employee.txn_indents_txn_indents_l1_approved_byTomst_employees.length > 0 ||
        employee.txn_indents_txn_indents_l2_approved_byTomst_employees.length > 0;

    if (hasIndents) {
        const error = new Error("Cannot delete employee with associated indents");
        error.statusCode = 409;
        throw error;
    }

    return prisma.mst_employees.delete({
        where: { id: Number(id) },
        select: employeeSelect,
    });
}

module.exports = {
    getAllEmployees,
    getEmployeeById,
    createEmployee,
    updateEmployee,
    deleteEmployee,
};
