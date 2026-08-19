const { prisma } = require("../config/db");
const {
    STATUS_MATERIAL_ISSUE_CODE_ID,
    STATUS_PARTIALLY_APPROVED_CODE_ID,
    STATUS_COMPLETED_CODE_ID,
    STATUS_ISSUED_PARTIALLY_CODE_ID,
} = require("../config/status.config");

const materialIssueInclude = {
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

function toNumber(value) {
    if (value === null || value === undefined) {
        return value;
    }
    if (typeof value?.toNumber === "function") {
        return value.toNumber();
    }
    return Number(value);
}

function isItemApprovedForIssue(item, indent) {
    if (item.is_rejected) {
        return false;
    }

    if (indent.l2_approval_required) {
        return Boolean(item.is_l2_approved);
    }

    if (indent.l1_approval_required) {
        return Boolean(item.is_l1_approved);
    }

    return true;
}

function formatMaterialIssueItem(item) {
    return {
        ...item,
        quantity: toNumber(item.quantity),
        unit_price: toNumber(item.unit_price),
        gst_rate: toNumber(item.gst_rate),
        issued_quantity: toNumber(item.issued_quantity ?? 0),
        is_issue_rejected: Boolean(item.is_issue_rejected),
    };
}

function formatMaterialIssueIndent(indent) {
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
        items: (txn_indent_items || []).map(formatMaterialIssueItem),
        requested_by_employee: mst_employees_txn_indents_requested_byTomst_employees,
        l1_approved_by_employee: mst_employees_txn_indents_l1_approved_byTomst_employees,
        l2_approved_by_employee: mst_employees_txn_indents_l2_approved_byTomst_employees,
    };
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

async function getMaterialIssueIndents() {
    const indents = await prisma.txn_indents.findMany({
        where: {
            is_material_issue: true,
            mst_indent_statuses: {
                codeId: {
                    in: [
                        STATUS_MATERIAL_ISSUE_CODE_ID,
                        STATUS_PARTIALLY_APPROVED_CODE_ID,
                        STATUS_ISSUED_PARTIALLY_CODE_ID,
                        STATUS_COMPLETED_CODE_ID,
                    ],
                },
            },
        },
        include: materialIssueInclude,
        orderBy: { created_at: "desc" },
    });

    return indents.map(formatMaterialIssueIndent);
}

function validateIssuePayload(payload) {
    if (!Array.isArray(payload?.items) || payload.items.length === 0) {
        const error = new Error("At least one item is required");
        error.statusCode = 400;
        throw error;
    }

    const materialIds = new Set();

    for (const [index, item] of payload.items.entries()) {
        if (item.material_id === undefined || item.material_id === null || item.material_id === "") {
            const error = new Error(`items[${index}].material_id is required`);
            error.statusCode = 400;
            throw error;
        }

        const materialId = Number(item.material_id);
        if (materialIds.has(materialId)) {
            const error = new Error(`items[${index}].material_id is duplicated`);
            error.statusCode = 400;
            throw error;
        }
        materialIds.add(materialId);

        const isRejected = Boolean(item.rejected);

        if (!isRejected) {
            if (item.quantity === undefined || item.quantity === null || item.quantity === "") {
                const error = new Error(`items[${index}].quantity is required`);
                error.statusCode = 400;
                throw error;
            }

            if (Number(item.quantity) < 0) {
                const error = new Error(`items[${index}].quantity cannot be negative`);
                error.statusCode = 400;
                throw error;
            }
        }
    }
}

function hasPartialIssue(items) {
    return items.some((item) => {
        const issuedQuantity = Number(item.issued_quantity ?? 0);
        const orderedQuantity = Number(item.quantity ?? 0);
        return issuedQuantity !== orderedQuantity;
    });
}

async function issueMaterial(indentId, payload = {}) {
    validateIssuePayload(payload);

    const indent = await prisma.txn_indents.findUnique({
        where: { id: Number(indentId) },
        include: {
            mst_indent_statuses: { select: { codeId: true } },
            txn_indent_items: true,
        },
    });

    if (!indent || !indent.is_material_issue) {
        const error = new Error("Material issue indent not found");
        error.statusCode = 404;
        throw error;
    }

    const statusCodeId = indent.mst_indent_statuses?.codeId;
    const canIssue =
        statusCodeId === STATUS_MATERIAL_ISSUE_CODE_ID ||
        statusCodeId === STATUS_PARTIALLY_APPROVED_CODE_ID ||
        statusCodeId === STATUS_ISSUED_PARTIALLY_CODE_ID;

    if (!canIssue) {
        const error = new Error(
            "Only approved, partially approved, or partially issued material issue requests can be issued"
        );
        error.statusCode = 409;
        throw error;
    }

    const itemsByMaterialId = new Map(
        indent.txn_indent_items.map((item) => [Number(item.material_id), item])
    );

    const issueUpdates = [];

    for (const [index, payloadItem] of payload.items.entries()) {
        const materialId = Number(payloadItem.material_id);
        const indentItem = itemsByMaterialId.get(materialId);

        if (!indentItem) {
            const error = new Error(
                `items[${index}].material_id ${materialId} not found on this indent`
            );
            error.statusCode = 400;
            throw error;
        }

        if (!isItemApprovedForIssue(indentItem, indent)) {
            const error = new Error(
                `items[${index}] is not approved for issue`
            );
            error.statusCode = 409;
            throw error;
        }

        const isRejected = Boolean(payloadItem.rejected);
        const currentIssued = Number(indentItem.issued_quantity ?? 0);
        const orderedQuantity = Number(indentItem.quantity);
        const issueQty = isRejected ? 0 : Number(payloadItem.quantity);
        const newIssuedQuantity = currentIssued + issueQty;

        if (!isRejected && newIssuedQuantity > orderedQuantity) {
            const error = new Error(
                `items[${index}].quantity exceeds remaining quantity`
            );
            error.statusCode = 400;
            throw error;
        }

        issueUpdates.push({
            indentItem,
            isRejected,
            issueQty,
            newIssuedQuantity,
        });
    }

    const [completedStatusId, partialStatusId] = await Promise.all([
        getStatusIdByCodeId(STATUS_COMPLETED_CODE_ID, "Completed indent status not found"),
        getStatusIdByCodeId(
            STATUS_ISSUED_PARTIALLY_CODE_ID,
            "Issued partially indent status not found"
        ),
    ]);

    await prisma.$transaction(async (tx) => {
        for (const update of issueUpdates) {
            if (update.issueQty > 0) {
                const stock = await tx.txn_stock_summary.findFirst({
                    where: { material_id: update.indentItem.material_id },
                });

                if (!stock) {
                    const error = new Error(
                        `Stock not found for material: ${update.indentItem.material_code}`
                    );
                    error.statusCode = 404;
                    throw error;
                }

                const currentQty = stock.stock_qty ?? 0;
                if (currentQty < update.issueQty) {
                    const error = new Error(
                        `Insufficient stock for material: ${update.indentItem.material_code}`
                    );
                    error.statusCode = 409;
                    throw error;
                }

                await tx.txn_stock_summary.update({
                    where: { id: stock.id },
                    data: {
                        stock_qty: currentQty - update.issueQty,
                        updated_at: new Date(),
                    },
                });
            }

            await tx.txn_indent_items.update({
                where: { id: update.indentItem.id },
                data: {
                    issued_quantity: update.newIssuedQuantity,
                    is_issue_rejected: update.isRejected || Boolean(update.indentItem.is_issue_rejected),
                },
            });
        }

        const updatedItems = await tx.txn_indent_items.findMany({
            where: { indent_id: Number(indentId) },
            select: { quantity: true, issued_quantity: true },
        });

        await tx.txn_indents.update({
            where: { id: Number(indentId) },
            data: {
                status_id: hasPartialIssue(updatedItems) ? partialStatusId : completedStatusId,
                updated_at: new Date(),
            },
        });
    });

    const updatedIndent = await prisma.txn_indents.findUnique({
        where: { id: Number(indentId) },
        include: materialIssueInclude,
    });

    return formatMaterialIssueIndent(updatedIndent);
}

module.exports = {
    getMaterialIssueIndents,
    issueMaterial,
};
