const { prisma } = require("../config/db");
const {
    ROLE_L1_APPROVER,
    ROLE_L2_APPROVER,
    isAdministrator,
    isApprover,
} = require("../config/roles.config");
const {
    APPROVAL_MODULE_INDENT,
    APPROVAL_MODULE_MATERIAL_ISSUE,
} = require("../config/approval-modules.config");
const { evaluateApprovalRequirements } = require("./approval-rule-evaluator.service");
const {
    STATUS_MATERIAL_ISSUE_CODE_ID,
    STATUS_L1_APPROVAL_PENDING_CODE_ID,
    STATUS_L1_APPROVED_CODE_ID,
    STATUS_COMPLETED_CODE_ID,
    STATUS_REJECTED_CODE_ID,
    STATUS_L1_L2_APPROVED_CODE_ID,
    STATUS_PARTIALLY_APPROVED_CODE_ID,
} = require("../config/status.config");

const indentInclude = {
    mst_area: { select: { id: true, name: true } },
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

function serializeIndentItem(item) {
    return {
        ...item,
        quantity: item.quantity?.toNumber?.() ?? Number(item.quantity),
        unit_price: item.unit_price?.toNumber?.() ?? Number(item.unit_price),
        gst_rate: item.gst_rate?.toNumber?.() ?? Number(item.gst_rate),
    };
}

function getItemStatus(item, indent, roleId = null) {
    if (item.is_rejected) {
        return "rejected";
    }

    if (roleId === ROLE_L1_APPROVER) {
        if (item.is_l1_approved && !item.is_rejected) {
            return "approved";
        }

        return "pending";
    }

    if (roleId === ROLE_L2_APPROVER) {
        if (item.is_l2_approved && !item.is_rejected) {
            return "approved";
        }

        return "pending";
    }

    if (indent.l1_approval_required && indent.l2_approval_required) {
        if (item.is_l1_approved && item.is_l2_approved) {
            return "approved";
        }

        return "pending";
    }

    if (indent.l1_approval_required && !indent.l2_approval_required) {
        if (item.is_l1_approved) {
            return "approved";
        }

        return "pending";
    }

    return "approved";
}

function shouldFilterItemsForRole(indent, userId, roleId) {
    if (isAdministrator(roleId)) {
        return false;
    }

    if (indent.requested_by === userId) {
        return false;
    }

    return roleId === ROLE_L1_APPROVER || roleId === ROLE_L2_APPROVER;
}

function filterItemsForRole(items, indent, roleId) {
    if (roleId === ROLE_L1_APPROVER) {
        return items.filter(
            (item) =>
                item.is_l1_approved ||
                item.is_rejected ||
                getItemStatus(item, indent, roleId) === "pending"
        );
    }

    if (roleId === ROLE_L2_APPROVER) {
        if (!indent.l2_approval_required) {
            return items;
        }

        return items.filter((item) => item.is_l1_approved);
    }

    return items;
}

function formatIndent(indent, roleId = null, userId = null) {
    const {
        mst_indent_statuses,
        mst_area,
        mst_departments,
        txn_indent_items,
        mst_employees_txn_indents_requested_byTomst_employees,
        mst_employees_txn_indents_l1_approved_byTomst_employees,
        mst_employees_txn_indents_l2_approved_byTomst_employees,
        ...indentData
    } = indent;

    let items = txn_indent_items || [];

    if (roleId != null && userId != null && shouldFilterItemsForRole(indent, userId, roleId)) {
        items = filterItemsForRole(items, indent, roleId);
    }

    return {
        ...indentData,
        area: mst_area,
        department: mst_departments,
        status: mst_indent_statuses
            ? {
                  id: mst_indent_statuses.id,
                  code: mst_indent_statuses.code,
                  code_id: mst_indent_statuses.codeId,
                  description: mst_indent_statuses.description,
              }
            : null,
        items: items.map((item) => ({
            ...serializeIndentItem(item),
            status: getItemStatus(item, indent, roleId),
        })),
        requested_by_employee: mst_employees_txn_indents_requested_byTomst_employees,
        l1_approved_by_employee: mst_employees_txn_indents_l1_approved_byTomst_employees,
        l2_approved_by_employee: mst_employees_txn_indents_l2_approved_byTomst_employees,
    };
}

async function getIndents(userId, roleId, areaId, departmentId) {
    if (isAdministrator(roleId)) {
        const indents = await prisma.txn_indents.findMany({
            include: indentInclude,
            orderBy: { created_at: "desc" },
        });
        return indents.map((indent) => formatIndent(indent, roleId, userId));
    }

    const conditions = [{ requested_by: userId }];

    if (roleId === ROLE_L1_APPROVER && areaId && departmentId) {
        conditions.push({
            l1_approval_required: true,
            mst_indent_statuses: {
                codeId: { not: STATUS_MATERIAL_ISSUE_CODE_ID },
            },
            mst_employees_txn_indents_requested_byTomst_employees: {
                department_id: departmentId,
                area_id: areaId,
            },
        });
    }

    if (roleId === ROLE_L2_APPROVER && areaId && departmentId) {
        conditions.push({
            l1_approved: true,
            l2_approval_required: true,
            mst_indent_statuses: {
                codeId: { not: STATUS_MATERIAL_ISSUE_CODE_ID },
            },
            mst_employees_txn_indents_requested_byTomst_employees: {
                department_id: departmentId,
                area_id: areaId,
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

    return indents.map((indent) => formatIndent(indent, roleId, userId));
}

async function generateIndentNo(prefix = "IND") {
    const year = new Date().getFullYear();
    const indentNoPrefix = `${prefix}-${year}-`;

    const latestIndent = await prisma.txn_indents.findFirst({
        where: {
            indent_no: {
                startsWith: indentNoPrefix,
            },
        },
        orderBy: {
            indent_no: "desc",
        },
        select: {
            indent_no: true,
        },
    });

    let nextSequence = 1;

    if (latestIndent) {
        const sequencePart = latestIndent.indent_no.slice(indentNoPrefix.length);
        const currentSequence = Number.parseInt(sequencePart, 10);

        if (!Number.isNaN(currentSequence)) {
            nextSequence = currentSequence + 1;
        }
    }

    return `${indentNoPrefix}${String(nextSequence).padStart(5, "0")}`;
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

async function validateDraftInput(userId, areaId, departmentId, data) {
    const { items = [] } = data;
    const resolvedAreaId = data.area_id ?? areaId;
    const resolvedDepartmentId = data.department_id ?? departmentId;

    if (!resolvedAreaId) {
        const error = new Error("area_id is required");
        error.statusCode = 400;
        throw error;
    }

    if (!resolvedDepartmentId) {
        const error = new Error("department_id is required");
        error.statusCode = 400;
        throw error;
    }

    await validateArea(resolvedAreaId);
    await validateDepartment(resolvedDepartmentId);

    const normalizedItems = Array.isArray(items) ? items : [];
    const itemsWithMaterial = normalizedItems.filter((item) => item.material_id);

    if (itemsWithMaterial.length > 0) {
        await validateMaterials(itemsWithMaterial);
    }

    return {
        items: normalizedItems,
        resolvedAreaId: Number(resolvedAreaId),
        resolvedDepartmentId: Number(resolvedDepartmentId),
    };
}

function mapDraftIndentItems(items) {
    return items
        .filter((item) => item.material_id)
        .map((item) => ({
            material_id: Number(item.material_id),
            quantity: Number(item.quantity ?? 0),
            unit_price: Number(item.unit_price ?? 0),
            material_code: item.material_code ?? "",
            description: item.description ?? "",
            uom: item.uom ?? "",
            gst_rate: Number(item.gst_rate ?? 0),
        }));
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

async function validateCreateInput(userId,areaId, departmentId, data) {
    const { items } = data;
    const resolvedAreaId = data.area_id ?? areaId;
    const resolvedDepartmentId = data.department_id ?? departmentId;

    if (!resolvedAreaId) {
        const error = new Error("area_id is required");
        error.statusCode = 400;
        throw error;
    }

    if (!resolvedDepartmentId) {
        const error = new Error("department_id is required");
        error.statusCode = 400;
        throw error;
    }

    validateItems(items);
    await validateArea(resolvedAreaId);
    await validateDepartment(resolvedDepartmentId);
    await validateMaterials(items);

    return { items, resolvedAreaId: Number(resolvedAreaId), resolvedDepartmentId: Number(resolvedDepartmentId) };
}

async function getOwnedDraftIndent(id, userId, roleId, isMaterialIssue) {
    const indent = await getOwnedIndent(id, userId, roleId);

    if (!indent.is_draft) {
        const error = new Error("Only draft indents can be submitted");
        error.statusCode = 409;
        throw error;
    }

    if (indent.is_material_issue !== isMaterialIssue) {
        const error = new Error(
            isMaterialIssue
                ? "Draft is not a material issue request"
                : "Draft is a material issue request"
        );
        error.statusCode = 409;
        throw error;
    }

    return indent;
}

async function createIndent(userId, roleId,areaId, departmentId, data) {
    const { items, resolvedAreaId, resolvedDepartmentId } = await validateCreateInput(
        userId,
        areaId,
        departmentId,
        data
    );

    const totalValue = calculateTotalValue(items);

    const approvalRequirements = await evaluateApprovalRequirements({
        module: APPROVAL_MODULE_INDENT,
        roleId,
        departmentId: resolvedDepartmentId,
        items,
        totalAmount: totalValue,
    });
    const l1ApprovalRequired = approvalRequirements.l1ApprovalRequired;
    const l2ApprovalRequired = approvalRequirements.l2ApprovalRequired;

    const requiresApproval = l1ApprovalRequired || l2ApprovalRequired;
    const statusId = requiresApproval
        ? await getL1ApprovalPendingStatusId()
        : await getStatusIdByCodeId(
              STATUS_L1_L2_APPROVED_CODE_ID,
              "Approved status not found"
          );

    const submitData = {
        area_id: resolvedAreaId,
        department_id: resolvedDepartmentId,
        total_value: totalValue,
        l1_approval_required: l1ApprovalRequired,
        l2_approval_required: l2ApprovalRequired,
        status_id: statusId,
        is_draft: false,
    };

    if (data.id) {
        await getOwnedDraftIndent(data.id, userId, roleId, false);

        const indent = await prisma.txn_indents.update({
            where: { id: Number(data.id) },
            data: {
                ...submitData,
                updated_at: new Date(),
                txn_indent_items: {
                    deleteMany: {},
                    create: mapIndentItems(items),
                },
            },
            include: indentInclude,
        });

        return formatIndent(indent);
    }

    const indent = await prisma.txn_indents.create({
        data: {
            indent_no: await generateIndentNo(),
            requested_by: userId,
            ...submitData,
            txn_indent_items: {
                create: mapIndentItems(items),
            },
        },
        include: indentInclude,
    });

    return formatIndent(indent);
}

async function createMaterialIssueRequest(userId, roleId, areaId, departmentId, data) {
    const { items, resolvedAreaId, resolvedDepartmentId } = await validateCreateInput(
        userId,
        areaId,
        departmentId,
        data
    );

    const totalValue = calculateTotalValue(items);

    const approvalRequirements = await evaluateApprovalRequirements({
        module: APPROVAL_MODULE_MATERIAL_ISSUE,
        roleId,
        departmentId: resolvedDepartmentId,
        items,
        totalAmount: totalValue,
    });
    const l1ApprovalRequired = approvalRequirements.l1ApprovalRequired;
    const l2ApprovalRequired = approvalRequirements.l2ApprovalRequired;

    const requiresApproval = l1ApprovalRequired || l2ApprovalRequired;

    const statusId = requiresApproval
        ? await getL1ApprovalPendingStatusId()
        : await getMaterialIssueStatusId();

    const submitData = {
        area_id: resolvedAreaId,
        department_id: resolvedDepartmentId,
        total_value: totalValue,
        l1_approval_required: l1ApprovalRequired,
        l2_approval_required: l2ApprovalRequired,
        is_material_issue: true,
        is_draft: false,
        status_id: statusId,
    };

    if (!requiresApproval) {
        submitData.l1_approved = null;
        submitData.l2_approved = null;
    }

    if (data.id) {
        await getOwnedDraftIndent(data.id, userId, null, true);

        const indent = await prisma.txn_indents.update({
            where: { id: Number(data.id) },
            data: {
                ...submitData,
                updated_at: new Date(),
                txn_indent_items: {
                    deleteMany: {},
                    create: mapIndentItems(items),
                },
            },
            include: indentInclude,
        });

        return formatIndent(indent);
    }

    const indent = await prisma.txn_indents.create({
        data: {
            indent_no: await generateIndentNo("MIR"),
            requested_by: userId,
            ...submitData,
            txn_indent_items: {
                create: mapIndentItems(items),
            },
        },
        include: indentInclude,
    });

    return formatIndent(indent);
}

async function createIndentDraft(userId, roleId, areaId, departmentId, data) {
    const { items, resolvedAreaId, resolvedDepartmentId } = await validateDraftInput(
        userId,
        areaId,
        departmentId,
        data
    );

    const mappedItems = mapDraftIndentItems(items);
    const totalValue = calculateTotalValue(mappedItems);

    const indent = await prisma.txn_indents.create({
        data: {
            indent_no: await generateIndentNo(),
            area_id: resolvedAreaId,
            department_id: resolvedDepartmentId,
            requested_by: userId,
            total_value: totalValue,
            l1_approval_required: false,
            l2_approval_required: false,
            status_id: null,
            is_draft: true,
            txn_indent_items: mappedItems.length > 0 ? { create: mappedItems } : undefined,
        },
        include: indentInclude,
    });

    return formatIndent(indent);
}

async function createMaterialIssueDraft(userId, areaId, departmentId, data) {
    const { items, resolvedAreaId, resolvedDepartmentId } = await validateDraftInput(
        userId,
        areaId,
        departmentId,
        data
    );

    const mappedItems = mapDraftIndentItems(items);
    const totalValue = calculateTotalValue(mappedItems);

    const indent = await prisma.txn_indents.create({
        data: {
            indent_no: await generateIndentNo("MIR"),
            area_id: resolvedAreaId,
            department_id: resolvedDepartmentId,
            requested_by: userId,
            total_value: totalValue,
            l1_approval_required: false,
            l2_approval_required: false,
            is_material_issue: true,
            is_draft: true,
            status_id: null,
            txn_indent_items: mappedItems.length > 0 ? { create: mappedItems } : undefined,
        },
        include: indentInclude,
    });

    return formatIndent(indent);
}

async function getOwnedIndent(id, userId, roleId) {
    const indent = await prisma.txn_indents.findUnique({
        where: { id: Number(id) },
    });

    if (!indent) {
        const error = new Error("Indent not found");
        error.statusCode = 404;
        throw error;
    }

    if (!isAdministrator(roleId) && indent.requested_by !== userId) {
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

async function updateIndent(id, userId, roleId, areaId, departmentId, data) {
    const indent = await getOwnedIndent(id, userId, roleId);
    ensureNotApproved(indent);

    const { items } = data;
    const resolvedAreaId = areaId ?? data.area_id ?? indent.area_id;
    const resolvedDepartmentId = departmentId ?? data.department_id ?? indent.department_id;

    if (!resolvedAreaId) {
        const error = new Error("area_id is required");
        error.statusCode = 400;
        throw error;
    }

    if (!resolvedDepartmentId) {
        const error = new Error("department_id is required");
        error.statusCode = 400;
        throw error;
    }

    validateItems(items);
    await validateArea(resolvedAreaId);
    await validateDepartment(resolvedDepartmentId);
    await validateMaterials(items);

    const updatedIndent = await prisma.txn_indents.update({
        where: { id: Number(id) },
        data: {
            area_id: Number(resolvedAreaId),
            department_id: Number(resolvedDepartmentId),
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

async function deleteIndent(id, userId, roleId) {
    if (!isAdministrator(roleId)) {
        await getOwnedIndent(id, userId, roleId);
    }

    const fullIndent = await prisma.txn_indents.findUnique({
        where: { id: Number(id) },
        include: indentInclude,
    });

    if (!fullIndent) {
        const error = new Error("Indent not found");
        error.statusCode = 404;
        throw error;
    }

    await prisma.$transaction(async (tx) => {
        await tx.txn_approved_indent_materials.deleteMany({
            where: { indent_id: Number(id) },
        });

        await tx.txn_indents.delete({
            where: { id: Number(id) },
        });
    });

    return formatIndent(fullIndent);
}

async function getIndentForApproval(id) {
    const indent = await prisma.txn_indents.findUnique({
        where: { id: Number(id) },
        include: {
            mst_indent_statuses: { select: { codeId: true } },
            txn_indent_items: true,
            mst_employees_txn_indents_requested_byTomst_employees: {
                select: { department_id: true, area_id: true },
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

function ensureSameDepartment(indent, approverAreaId, approverDepartmentId, roleId) {
    if (isAdministrator(roleId)) {
        return;
    }

    const requesterAreaId =
        indent.mst_employees_txn_indents_requested_byTomst_employees?.area_id;
    const requesterDepartmentId =
        indent.mst_employees_txn_indents_requested_byTomst_employees?.department_id;

    if (
        Number(requesterAreaId) !== Number(approverAreaId) ||
        Number(requesterDepartmentId) !== Number(approverDepartmentId)
    ) {
        const error = new Error(
            "You can only act on indents from your area and department"
        );
        error.statusCode = 403;
        throw error;
    }
}

function normalizeMaterialIdList(materialIds, fieldName) {
    if (materialIds == null) {
        return [];
    }

    if (!Array.isArray(materialIds)) {
        const error = new Error(`${fieldName} must be an array`);
        error.statusCode = 400;
        throw error;
    }

    return [...new Set(materialIds.map((id) => Number(id)))];
}

function buildRejectionReasonMap(rejectionReasons) {
    if (rejectionReasons == null) {
        return new Map();
    }

    if (!Array.isArray(rejectionReasons)) {
        const error = new Error("rejection_reasons must be an array");
        error.statusCode = 400;
        throw error;
    }

    const reasonMap = new Map();

    for (const entry of rejectionReasons) {
        if (!entry || entry.material_id == null) {
            const error = new Error(
                "Each rejection_reasons entry must include material_id"
            );
            error.statusCode = 400;
            throw error;
        }

        reasonMap.set(Number(entry.material_id), entry.rejection_reason ?? null);
    }

    return reasonMap;
}

function validateSubmitMaterialIds(
    approvedMaterialIds,
    rejectedMaterialIds,
    rejectionReasonMap,
    indentItems,
    approvalLevel
) {
    if (approvedMaterialIds.length === 0 && rejectedMaterialIds.length === 0) {
        const error = new Error(
            "At least one of approved_material_ids or rejected_material_ids is required"
        );
        error.statusCode = 400;
        throw error;
    }

    const indentMaterialIds = new Set(indentItems.map((item) => item.material_id));
    const approvedSet = new Set(approvedMaterialIds);
    const rejectedSet = new Set(rejectedMaterialIds);

    for (const materialId of approvedMaterialIds) {
        if (rejectedSet.has(materialId)) {
            const error = new Error(
                `Material ${materialId} cannot be both approved and rejected`
            );
            error.statusCode = 400;
            throw error;
        }

        if (!indentMaterialIds.has(materialId)) {
            const error = new Error(`Material ${materialId} not found in indent items`);
            error.statusCode = 400;
            throw error;
        }
    }

    for (const materialId of rejectedMaterialIds) {
        if (!indentMaterialIds.has(materialId)) {
            const error = new Error(`Material ${materialId} not found in indent items`);
            error.statusCode = 400;
            throw error;
        }
    }

    for (const materialId of rejectionReasonMap.keys()) {
        if (!rejectedSet.has(materialId)) {
            const error = new Error(
                `rejection_reasons material ${materialId} must be in rejected_material_ids`
            );
            error.statusCode = 400;
            throw error;
        }
    }

    if (approvalLevel === "l2") {
        const l2EligibleIds = new Set(
            indentItems
                .filter((item) => item.is_l1_approved && !item.is_rejected)
                .map((item) => item.material_id)
        );

        for (const materialId of [...approvedSet, ...rejectedSet]) {
            if (!l2EligibleIds.has(materialId)) {
                const error = new Error(
                    `Material ${materialId} is not eligible for L2 approval`
                );
                error.statusCode = 400;
                throw error;
            }
        }
    }

    return { approvedSet, rejectedSet };
}

async function updateIndentItemsForSubmit(
    tx,
    indentItems,
    approvedSet,
    rejectedSet,
    rejectionReasonMap,
    approvalLevel
) {
    for (const item of indentItems) {
        if (approvedSet.has(item.material_id)) {
            const data =
                approvalLevel === "l1"
                    ? { is_l1_approved: true, is_rejected: false, rejection_reason: null }
                    : { is_l2_approved: true, is_rejected: false, rejection_reason: null };

            await tx.txn_indent_items.update({
                where: { id: item.id },
                data,
            });
            continue;
        }

        if (rejectedSet.has(item.material_id)) {
            await tx.txn_indent_items.update({
                where: { id: item.id },
                data: {
                    is_rejected: true,
                    rejection_reason: rejectionReasonMap.get(item.material_id) ?? null,
                    ...(approvalLevel === "l1"
                        ? { is_l1_approved: false }
                        : { is_l2_approved: false }),
                },
            });
        }
    }
}

async function resolveFinalApprovalStatusId(indent, hasUndecidedItems) {
    const approvalRequired =
        Boolean(indent.l1_approval_required) || Boolean(indent.l2_approval_required);

    if (approvalRequired && hasUndecidedItems) {
        return getStatusIdByCodeId(
            STATUS_PARTIALLY_APPROVED_CODE_ID,
            "Partially approved status not found"
        );
    }

    const statusCodeId = indent.is_material_issue
        ? STATUS_MATERIAL_ISSUE_CODE_ID
        : STATUS_L1_L2_APPROVED_CODE_ID;

    return getStatusIdByCodeId(statusCodeId, "Approval status not found");
}

async function resolveApprovalStatusId(indent, approvalLevel, hasUndecidedItems = false) {
    if (approvalLevel === "l1") {
        if (indent.l2_approval_required) {
            return getStatusIdByCodeId(
                STATUS_L1_APPROVED_CODE_ID,
                "Approval status not found"
            );
        }

        return resolveFinalApprovalStatusId(indent, hasUndecidedItems);
    }

    return resolveFinalApprovalStatusId(indent, hasUndecidedItems);
}

function getItemsForApprovalLevel(indentItems, approvalLevel) {
    if (approvalLevel === "l2") {
        return indentItems.filter((item) => item.is_l1_approved && !item.is_rejected);
    }

    return indentItems;
}

function isPartiallyApproved(indentItems, approvedSet, rejectedSet, approvalLevel) {
    return getItemsForApprovalLevel(indentItems, approvalLevel).some(
        (item) => !approvedSet.has(item.material_id) && !rejectedSet.has(item.material_id)
    );
}

function areAllMaterialsApproved(indentItems, approvedSet, approvalLevel) {
    const items = getItemsForApprovalLevel(indentItems, approvalLevel);
    return items.length > 0 && items.every((item) => approvedSet.has(item.material_id));
}

function hasUndecidedIndentItems(indentItems, approvedSet, rejectedSet) {
    return indentItems.some((item) => {
        if (approvedSet.has(item.material_id) || rejectedSet.has(item.material_id)) {
            return false;
        }

        return !item.is_l1_approved && !item.is_l2_approved && !item.is_rejected;
    });
}

async function syncApprovedIndentMaterials(tx, indentId, indent, approvalLevel) {
    if (indent.is_material_issue) {
        return;
    }

    const l1Required = Boolean(indent.l1_approval_required);
    const l2Required = Boolean(indent.l2_approval_required);

    const shouldSyncBothLevels =
        l1Required &&
        l2Required &&
        Boolean(indent.l1_approved) &&
        approvalLevel === "l2";

    const shouldSyncL1Only = l1Required && !l2Required && approvalLevel === "l1";

    if (!shouldSyncBothLevels && !shouldSyncL1Only) {
        return;
    }

    const items = await tx.txn_indent_items.findMany({
        where: {
            indent_id: Number(indentId),
            is_rejected: false,
            ...(shouldSyncBothLevels
                ? { is_l1_approved: true, is_l2_approved: true }
                : { is_l1_approved: true }),
        },
    });

    if (items.length === 0) {
        return;
    }

    const existing = await tx.txn_approved_indent_materials.findMany({
        where: {
            indent_id: Number(indentId),
            material_id: { in: items.map((item) => item.material_id) },
        },
        select: { material_id: true },
    });

    const existingMaterialIds = new Set(existing.map((row) => row.material_id));
    const toCreate = items
        .filter((item) => !existingMaterialIds.has(item.material_id))
        .map((item) => ({
            indent_id: Number(indentId),
            material_id: item.material_id,
            quantity: item.quantity,
            price: item.unit_price,
            approved_date: new Date(),
        }));

    if (toCreate.length > 0) {
        await tx.txn_approved_indent_materials.createMany({ data: toCreate });
    }
}

async function applyIndentSubmit(id, userId, indent, payload, approvalLevel) {
    const approvedMaterialIds = normalizeMaterialIdList(
        payload.approved_material_ids,
        "approved_material_ids"
    );
    const rejectedMaterialIds = normalizeMaterialIdList(
        payload.rejected_material_ids,
        "rejected_material_ids"
    );
    const rejectionReasonMap = buildRejectionReasonMap(payload.rejection_reasons);

    const { approvedSet, rejectedSet } = validateSubmitMaterialIds(
        approvedMaterialIds,
        rejectedMaterialIds,
        rejectionReasonMap,
        indent.txn_indent_items,
        approvalLevel
    );

    const now = new Date();
    const allApproved = areAllMaterialsApproved(
        indent.txn_indent_items,
        approvedSet,
        approvalLevel
    );
    const partiallyApproved = allApproved
        ? false
        : isPartiallyApproved(
              indent.txn_indent_items,
              approvedSet,
              rejectedSet,
              approvalLevel
          );
    const undecidedItems = hasUndecidedIndentItems(
        indent.txn_indent_items,
        approvedSet,
        rejectedSet
    );
    const statusId = await resolveApprovalStatusId(
        indent,
        approvalLevel,
        undecidedItems
    );

    const updateData = {
        updated_at: now,
        status_id: statusId,
    };

    if (approvalLevel === "l1") {
        updateData.l1_approved = true;
        updateData.l1_approved_by = userId;
        updateData.l1_approved_at = now;
        updateData.is_l1_partially_approved = partiallyApproved;
    } else {
        updateData.l2_approved = true;
        updateData.l2_approved_by = userId;
        updateData.l2_approved_at = now;
        updateData.is_l2_partially_approved = partiallyApproved;
    }

    await prisma.$transaction(async (tx) => {
        await updateIndentItemsForSubmit(
            tx,
            indent.txn_indent_items,
            approvedSet,
            rejectedSet,
            rejectionReasonMap,
            approvalLevel
        );

        await tx.txn_indents.update({
            where: { id: Number(id) },
            data: updateData,
        });

        await syncApprovedIndentMaterials(tx, id, indent, approvalLevel);
    });

    const updatedIndent = await prisma.txn_indents.findUnique({
        where: { id: Number(id) },
        include: indentInclude,
    });

    return formatIndent(updatedIndent);
}

function resolveApprovalLevelForAdmin(indent) {
    if (indent.l1_approval_required && !indent.l1_approved) {
        return "l1";
    }

    if (indent.l2_approval_required && !indent.l2_approved) {
        return "l2";
    }

    const error = new Error("No approval is pending for this indent");
    error.statusCode = 409;
    throw error;
}

function resolveApprovalLevelForRole(indent, roleId) {
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

        return "l1";
    }

    if (roleId === ROLE_L2_APPROVER) {
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

        return "l2";
    }

    const error = new Error("Only approvers can perform this action");
    error.statusCode = 403;
    throw error;
}

async function submitIndentApproval(id, userId, roleId, areaId, departmentId, payload = {}) {
    ensureApproverRole(roleId);

    if (!isAdministrator(roleId)) {
        if (!areaId) {
            const error = new Error("area_id is required");
            error.statusCode = 400;
            throw error;
        }

        if (!departmentId) {
            const error = new Error("department_id is required");
            error.statusCode = 400;
            throw error;
        }
    }

    const indent = await getIndentForApproval(id);
    ensureSameDepartment(indent, areaId, departmentId, roleId);

    if (indent.mst_indent_statuses?.codeId === STATUS_REJECTED_CODE_ID) {
        const error = new Error("Cannot approve a rejected indent");
        error.statusCode = 409;
        throw error;
    }

    if (indent.is_draft) {
        const error = new Error("Cannot approve a draft indent");
        error.statusCode = 409;
        throw error;
    }

    const approvalLevel = isAdministrator(roleId)
        ? resolveApprovalLevelForAdmin(indent)
        : resolveApprovalLevelForRole(indent, roleId);

    return applyIndentSubmit(id, userId, indent, payload, approvalLevel);
}

async function rejectIndent(id, userId, roleId, areaId, departmentId, rejectionReason) {
    ensureApproverRole(roleId);

    if (!isAdministrator(roleId)) {
        if (!areaId) {
            const error = new Error("area_id is required");
            error.statusCode = 400;
            throw error;
        }

        if (!departmentId) {
            const error = new Error("department_id is required");
            error.statusCode = 400;
            throw error;
        }
    }

    if (!rejectionReason) {
        const error = new Error("rejection_reason is required");
        error.statusCode = 400;
        throw error;
    }

    const indent = await getIndentForApproval(id);
    ensureSameDepartment(indent, areaId, departmentId, roleId);

    if (indent.mst_indent_statuses?.codeId === STATUS_REJECTED_CODE_ID) {
        const error = new Error("Indent is already rejected");
        error.statusCode = 409;
        throw error;
    }

    if (indent.is_draft) {
        const error = new Error("Cannot reject a draft indent");
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

    await prisma.$transaction(async (tx) => {
        await tx.txn_indent_items.updateMany({
            where: { indent_id: Number(id) },
            data: {
                is_rejected: true,
                is_l1_approved: false,
                is_l2_approved: false,
            },
        });

        await tx.txn_indents.update({
            where: { id: Number(id) },
            data: {
                status_id: rejectedStatusId,
                rejection_reason: rejectionReason,
                updated_at: new Date(),
            },
        });
    });

    const updatedIndent = await prisma.txn_indents.findUnique({
        where: { id: Number(id) },
        include: indentInclude,
    });

    return formatIndent(updatedIndent);
}

async function getMaterialIssueItemQuantities() {
    const grouped = await prisma.txn_indent_items.groupBy({
        by: ["material_id"],
        where: {
            is_rejected: false,
            txn_indents: {
                is_draft: false,
                is_material_issue: true,
                NOT: {
                    mst_indent_statuses: {
                        codeId: STATUS_COMPLETED_CODE_ID,
                    },
                },
            },
        },
        _sum: {
            quantity: true,
        },
    });

    if (grouped.length === 0) {
        return [];
    }

    const materialIds = grouped.map((group) => group.material_id);
    const itemDetails = await prisma.txn_indent_items.findMany({
        where: { material_id: { in: materialIds }},
        distinct: ["material_id"],
        select: {
            material_id: true,
            material_code: true,
            description: true,
            uom: true,
        },
    });

    const detailsByMaterialId = Object.fromEntries(
        itemDetails.map((item) => [item.material_id, item])
    );

    return grouped
        .map((group) => {
            const details = detailsByMaterialId[group.material_id];

            return {
                material_id: group.material_id,
                material_code: details?.material_code ?? null,
                description: details?.description ?? null,
                uom: details?.uom ?? null,
                total_quantity: Number(group._sum.quantity ?? 0),
            };
        })
        .sort((a, b) => String(a.material_code).localeCompare(String(b.material_code)));
}

module.exports = {
    getIndents,
    getMaterialIssueItemQuantities,
    createIndent,
    createIndentDraft,
    createMaterialIssueRequest,
    createMaterialIssueDraft,
    updateIndent,
    deleteIndent,
    submitIndentApproval,
    rejectIndent,
};
