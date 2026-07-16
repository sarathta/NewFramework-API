const { prisma } = require("../config/db");

const ROLE_L1_APPROVER = 2;
const ROLE_L2_APPROVER = 5;
const STATUS_MATERIAL_ISSUE_CODE_ID = 1;
const STATUS_L1_APPROVAL_PENDING_CODE_ID = 2;
const STATUS_L1_APPROVED_CODE_ID = 3;
const STATUS_REJECTED_CODE_ID = 6;
const STATUS_L1_L2_APPROVED_CODE_ID = 7;

const indentInclude = {
    mst_departments: { select: { id: true, name: true } },
    mst_indent_statuses: {
        select: { id: true, code: true, codeId: true, description: true },
    },
    txn_indent_items: true,
    mst_employees_txn_indents_requested_byTomst_employees: {
        select: { id: true, employee_name: true, email: true, department_id: true },
    },
    mst_employees_txn_indents_l1_approved_byTomst_employees: {
        select: { id: true, employee_name: true },
    },
    mst_employees_txn_indents_l2_approved_byTomst_employees: {
        select: { id: true, employee_name: true },
    },
};

function formatIndent(indent) {
    const {
        mst_indent_statuses,
        mst_departments,
        mst_area,
        txn_indent_items,
        mst_employees_txn_indents_requested_byTomst_employees,
        mst_employees_txn_indents_l1_approved_byTomst_employees,
        mst_employees_txn_indents_l2_approved_byTomst_employees,
        ...indentData
    } = indent;

    return {
        ...indentData,
        department: mst_departments,
        areas: mst_area,
        status: mst_indent_statuses
            ? {
                  id: mst_indent_statuses.id,
                  code: mst_indent_statuses.code,
                  code_id: mst_indent_statuses.codeId,
                  description: mst_indent_statuses.description,
              }
            : null,
        items: txn_indent_items,
        requested_by_employee: mst_employees_txn_indents_requested_byTomst_employees,
        l1_approved_by_employee: mst_employees_txn_indents_l1_approved_byTomst_employees,
        l2_approved_by_employee: mst_employees_txn_indents_l2_approved_byTomst_employees,
    };
}

async function getIndents(userId, roleId, departmentId , areaId) {
    const conditions = [{ requested_by: userId }];

    if (roleId === ROLE_L1_APPROVER  && areaId && departmentId) {
        conditions.push({
            l1_approval_required: true,
            mst_indent_statuses: {
                codeId: { not: STATUS_MATERIAL_ISSUE_CODE_ID },
            },
            mst_employees_txn_indents_requested_byTomst_employees: {
                area_id : areaId,
                department_id: departmentId,
            },
        });
    }

    if (roleId === ROLE_L2_APPROVER && areaId && departmentId) {
        conditions.push({
            l2_approval_required: true,
            mst_indent_statuses: {
                codeId: { not: STATUS_MATERIAL_ISSUE_CODE_ID },
            },
            mst_employees_txn_indents_requested_byTomst_employees: {
                area_id : areaId,
                department_id: departmentId,
            },
        });
    }

    const indents = await prisma.txn_indents.findMany({
        where: {
            OR: conditions,
            NOT: {
                AND: [
                    { mst_indent_statuses: { codeId: STATUS_MATERIAL_ISSUE_CODE_ID } },
                    { requested_by: { not: userId } },
                ],
            },
        },
        include: indentInclude,
        orderBy: { created_at: "desc" },
    });

    return indents.map(formatIndent);
}

function isApprover(roleId) {
    return roleId === ROLE_L1_APPROVER || roleId === ROLE_L2_APPROVER;
}

async function generateIndentNo(prefix = "IND") {
    const count = await prisma.txn_indents.count();
    const year = new Date().getFullYear();
    return `${prefix}-${year}-${String(count + 1).padStart(5, "0")}`;
}

function validateItems(items) {
    if (!Array.isArray(items) || items.length === 0) {
        const error = new Error("At least one indent item is required");
        error.statusCode = 400;
        throw error;
    }

    const requiredFields = [
        "material_id",
        "quantity",
        "unit_price",
        "material_code",
        "description",
        "uom",
        "gst_rate",
    ];

    for (const [index, item] of items.entries()) {
        for (const field of requiredFields) {
            if (item[field] === undefined || item[field] === null || item[field] === "") {
                const error = new Error(`items[${index}].${field} is required`);
                error.statusCode = 400;
                throw error;
            }
        }
    }
}

async function validateDepartment(departmentId) {
    const department = await prisma.mst_departments.findUnique({
        where: { id: Number(departmentId) },
    });

    if (!department) {
        const error = new Error("Department not found");
        error.statusCode = 404;
        throw error;
    }
}

async function validateArea(areaId) {
    const area = await prisma.mst_area.findUnique({
        where: { id: Number(areaId) },
    });

    if (!area) {
        const error = new Error("Area not found");
        error.statusCode = 404;
        throw error;
    }
}

async function validateMaterials(items) {
    const materialIds = [...new Set(items.map((item) => Number(item.material_id)))];

    const materials = await prisma.mst_materials.findMany({
        where: { id: { in: materialIds } },
        select: { id: true },
    });

    if (materials.length !== materialIds.length) {
        const error = new Error("One or more materials not found");
        error.statusCode = 404;
        throw error;
    }
}

async function getStatusIdByCodeId(codeId, notFoundMessage) {
    const status = await prisma.mst_indent_statuses.findFirst({
        where: { codeId },
        select: { id: true },
    });

    if (!status) {
        const error = new Error(notFoundMessage);
        error.statusCode = 404;
        throw error;
    }

    return status.id;
}

async function getL1ApprovalPendingStatusId() {
    return getStatusIdByCodeId(
        STATUS_L1_APPROVAL_PENDING_CODE_ID,
        "L1 approval pending status not found"
    );
}

async function getMaterialIssueStatusId() {
    return getStatusIdByCodeId(
        STATUS_MATERIAL_ISSUE_CODE_ID,
        "Material issue status not found"
    );
}

function calculateTotalValue(items) {
    return items.reduce(
        (sum, item) => sum + Number(item.quantity) * Number(item.unit_price),
        0
    );
}

function mapIndentItems(items) {
    return items.map((item) => ({
        material_id: Number(item.material_id),
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
        material_code: item.material_code,
        description: item.description,
        uom: item.uom,
        gst_rate: Number(item.gst_rate),
    }));
}

async function validateCreateInput(userId, departmentId,areaId, data) {
    const { items } = data;
    const resolvedDepartmentId = data.department_id ?? departmentId;
    const resolvedAreaId = data.area_id ?? areaId;

    if (!resolvedDepartmentId) {
        const error = new Error("department_id is required");
        error.statusCode = 400;
        throw error;
    }

    if (!resolvedAreaId) {
        const error = new Error("area id is required");
        error.statusCode = 400;
        throw error;
    }

    validateItems(items);
    await validateDepartment(resolvedDepartmentId);
    await validateArea(resolvedAreaId);
    await validateMaterials(items);

    return { items, resolvedDepartmentId: Number(resolvedDepartmentId), resolvedAreaId: Number(resolvedAreaId)};
}

async function createIndent(userId, roleId, departmentId,areaId, data) {
    const { items, resolvedDepartmentId, resolvedAreaId } = await validateCreateInput(
        userId,
        departmentId,
        areaId,
        data
    );

    const requiresApproval = !isApprover(roleId);
    const statusId = requiresApproval ? await getL1ApprovalPendingStatusId() : null;

    const indent = await prisma.txn_indents.create({
        data: {
            indent_no: await generateIndentNo(),
            department_id: resolvedDepartmentId,
            area_id: resolvedAreaId,
            requested_by: userId,
            total_value: calculateTotalValue(items),
            l1_approval_required: requiresApproval,
            l2_approval_required: requiresApproval,
            status_id: statusId,
            txn_indent_items: {
                create: mapIndentItems(items),
            },
        },
        include: indentInclude,
    });

    return formatIndent(indent);
}

async function createMaterialIssueRequest(userId, departmentId,areaId, data) {
    const { items, resolvedDepartmentId, resolvedAreaId } = await validateCreateInput(
        userId,
        departmentId,
        areaId,
        data
    );

    const statusId = await getMaterialIssueStatusId();

    const indent = await prisma.txn_indents.create({
        data: {
            indent_no: await generateIndentNo("MIR"),
            department_id: resolvedDepartmentId,
            area_id: resolvedAreaId,
            requested_by: userId,
            total_value: calculateTotalValue(items),
            l1_approval_required: false,
            l2_approval_required: false,
            l1_approved: null,
            l2_approved: null,
            status_id: statusId,
            txn_indent_items: {
                create: mapIndentItems(items),
            },
        },
        include: indentInclude,
    });

    return formatIndent(indent);
}

async function getOwnedIndent(id, userId) {
    const indent = await prisma.txn_indents.findUnique({
        where: { id: Number(id) },
        include: {
            txn_purchase_orders: { select: { id: true } },
        },
    });

    if (!indent) {
        const error = new Error("Indent not found");
        error.statusCode = 404;
        throw error;
    }

    if (indent.requested_by !== userId) {
        const error = new Error("You are not authorized to modify this indent");
        error.statusCode = 403;
        throw error;
    }

    return indent;
}

function ensureNotApproved(indent) {
    if (indent.l1_approved || indent.l2_approved) {
        const error = new Error("Cannot modify an approved indent");
        error.statusCode = 409;
        throw error;
    }
}

async function updateIndent(id, userId, departmentId,areaId, data) {
    const indent = await getOwnedIndent(id, userId);
    ensureNotApproved(indent);

    const { items } = data;

    if (!departmentId) {
        const error = new Error("department_id is required");
        error.statusCode = 400;
        throw error;
    }

    if (!areaId) {
        const error = new Error("area id is required");
        error.statusCode = 400;
        throw error;
    }

    validateItems(items);
    await validateDepartment(departmentId);
    await validateArea(areaId);
    await validateMaterials(items);

    const updatedIndent = await prisma.txn_indents.update({
        where: { id: Number(id) },
        data: {
            department_id: Number(departmentId),
            area_id: Number(areaId),
            total_value: calculateTotalValue(items),
            updated_at: new Date(),
            txn_indent_items: {
                deleteMany: {},
                create: mapIndentItems(items),
            },
        },
        include: indentInclude,
    });

    return formatIndent(updatedIndent);
}

async function deleteIndent(id, userId) {
    const indent = await getOwnedIndent(id, userId);
    ensureNotApproved(indent);

    if (indent.txn_purchase_orders.length > 0) {
        const error = new Error("Cannot delete indent with associated purchase orders");
        error.statusCode = 409;
        throw error;
    }

    const fullIndent = await prisma.txn_indents.findUnique({
        where: { id: Number(id) },
        include: indentInclude,
    });

    await prisma.txn_indents.delete({
        where: { id: Number(id) },
    });

    return formatIndent(fullIndent);
}

async function getIndentForApproval(id) {
    const indent = await prisma.txn_indents.findUnique({
        where: { id: Number(id) },
        include: {
            mst_indent_statuses: { select: { codeId: true } },
            mst_employees_txn_indents_requested_byTomst_employees: {
                select: { department_id: true },
            },
        },
    });

    if (!indent) {
        const error = new Error("Indent not found");
        error.statusCode = 404;
        throw error;
    }

    return indent;
}

function ensureApproverRole(roleId) {
    if (!isApprover(roleId)) {
        const error = new Error("Only approvers can perform this action");
        error.statusCode = 403;
        throw error;
    }
}

function ensureSameDepartmentAndArea(indent,approverAreaId, approverDepartmentId) {
    const requesterAreaId =
    indent.mst_employees_txn_indents_requested_byTomst_employees?.area_id;
    
    const requesterDepartmentId =
        indent.mst_employees_txn_indents_requested_byTomst_employees?.department_id;

    if (requesterAreaId !== approverAreaId && requesterDepartmentId !== approverDepartmentId) {
        const error = new Error(
            "You can only act on indents from your department"
        );
        error.statusCode = 403;
        throw error;
    }
}

async function approveIndent(id, userId, roleId, departmentId, areaId) {
    ensureApproverRole(roleId);

    if (!departmentId) {
        const error = new Error("department_id is required");
        error.statusCode = 400;
        throw error;
    }

    const indent = await getIndentForApproval(id);
    ensureSameDepartmentAndArea(indent, departmentId, areaId);

    if (indent.mst_indent_statuses?.codeId === STATUS_REJECTED_CODE_ID) {
        const error = new Error("Cannot approve a rejected indent");
        error.statusCode = 409;
        throw error;
    }

    const now = new Date();
    let updateData = { updated_at: now };

    if (roleId === ROLE_L1_APPROVER) {
        if (indent.l1_approved) {
            const error = new Error("Indent is already L1 approved");
            error.statusCode = 409;
            throw error;
        }

        if (!indent.l1_approval_required) {
            const error = new Error("L1 approval is not required for this indent");
            error.statusCode = 409;
            throw error;
        }

        const statusId = await getStatusIdByCodeId(
            STATUS_L1_APPROVED_CODE_ID,
            "L1 approved status not found"
        );

        updateData = {
            ...updateData,
            l1_approved: true,
            l1_approved_by: userId,
            l1_approved_at: now,
            status_id: statusId,
        };
    } else if (roleId === ROLE_L2_APPROVER) {
        if (!indent.l1_approved) {
            const error = new Error("L1 approval is required before L2 approval");
            error.statusCode = 409;
            throw error;
        }

        if (indent.l2_approved) {
            const error = new Error("Indent is already L2 approved");
            error.statusCode = 409;
            throw error;
        }

        if (!indent.l2_approval_required) {
            const error = new Error("L2 approval is not required for this indent");
            error.statusCode = 409;
            throw error;
        }

        const statusId = await getStatusIdByCodeId(
            STATUS_L1_L2_APPROVED_CODE_ID,
            "L1 & L2 approved status not found"
        );

        updateData = {
            ...updateData,
            l2_approved: true,
            l2_approved_by: userId,
            l2_approved_at: now,
            status_id: statusId,
        };
    }

    const updatedIndent = await prisma.txn_indents.update({
        where: { id: Number(id) },
        data: updateData,
        include: indentInclude,
    });

    return formatIndent(updatedIndent);
}

async function rejectIndent(id, userId, roleId, departmentId, areaId, rejectionReason) {
    ensureApproverRole(roleId);

    if (!departmentId) {
        const error = new Error("department_id is required");
        error.statusCode = 400;
        throw error;
    }

    if (!areaId) {
        const error = new Error("area id is required");
        error.statusCode = 400;
        throw error;
    }

    if (!rejectionReason) {
        const error = new Error("rejection_reason is required");
        error.statusCode = 400;
        throw error;
    }

    const indent = await getIndentForApproval(id);
    ensureSameDepartmentAndArea(indent, departmentId, areaId);

    if (indent.mst_indent_statuses?.codeId === STATUS_REJECTED_CODE_ID) {
        const error = new Error("Indent is already rejected");
        error.statusCode = 409;
        throw error;
    }

    if (indent.l1_approved && indent.l2_approved) {
        const error = new Error("Cannot reject a fully approved indent");
        error.statusCode = 409;
        throw error;
    }

    const rejectedStatusId = await getStatusIdByCodeId(
        STATUS_REJECTED_CODE_ID,
        "Rejected status not found"
    );

    const updatedIndent = await prisma.txn_indents.update({
        where: { id: Number(id) },
        data: {
            status_id: rejectedStatusId,
            rejection_reason: rejectionReason,
            updated_at: new Date(),
        },
        include: indentInclude,
    });

    return formatIndent(updatedIndent);
}

module.exports = {
    getIndents,
    createIndent,
    createMaterialIssueRequest,
    updateIndent,
    deleteIndent,
    approveIndent,
    rejectIndent,
};
