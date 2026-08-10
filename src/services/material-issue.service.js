const { prisma } = require("../config/db");
const {
    STATUS_MATERIAL_ISSUE_CODE_ID,
    STATUS_PARTIALLY_APPROVED_CODE_ID,
    STATUS_COMPLETED_CODE_ID,
} = require("../config/status.config");

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

function formatMaterialIssueIndent(indent) {
    const statusCodeId = indent.mst_indent_statuses?.codeId;
    const isPartiallyApproved = statusCodeId === STATUS_PARTIALLY_APPROVED_CODE_ID;

    const items = (indent.txn_indent_items || []).filter((item) =>
        isPartiallyApproved ? isItemApprovedForIssue(item, indent) : !item.is_rejected
    );

    return {
        id: indent.id,
        indent_no: indent.indent_no,
        area: indent.mst_area,
        department: indent.mst_departments,
        requested_by: indent.mst_employees_txn_indents_requested_byTomst_employees,
        created_at: indent.created_at,
        status: indent.mst_indent_statuses
            ? {
                  id: indent.mst_indent_statuses.id,
                  code: indent.mst_indent_statuses.code,
                  code_id: indent.mst_indent_statuses.codeId,
                  description: indent.mst_indent_statuses.description,
              }
            : null,
        items,
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
                    in: [STATUS_MATERIAL_ISSUE_CODE_ID, STATUS_PARTIALLY_APPROVED_CODE_ID],
                },
            },
        },
        select: {
            id: true,
            indent_no: true,
            created_at: true,
            l1_approval_required: true,
            l2_approval_required: true,
            mst_area: { select: { id: true, name: true } },
            mst_departments: { select: { id: true, name: true } },
            mst_indent_statuses: {
                select: { id: true, code: true, codeId: true, description: true },
            },
            mst_employees_txn_indents_requested_byTomst_employees: {
                select: { id: true, employee_name: true, email: true },
            },
            txn_indent_items: true,
        },
        orderBy: { created_at: "desc" },
    });

    return indents
        .map(formatMaterialIssueIndent)
        .filter((indent) => indent.items.length > 0);
}

async function issueMaterial(indentId) {
    const indent = await prisma.txn_indents.findUnique({
        where: { id: Number(indentId) },
        include: {
            mst_indent_statuses: { select: { codeId: true } },
            txn_indent_items: true,
        },
    });

    if (!indent) {
        const error = new Error("Material issue indent not found");
        error.statusCode = 404;
        throw error;
    }

    const statusCodeId = indent.mst_indent_statuses?.codeId;
    const isFullyApproved = statusCodeId === STATUS_MATERIAL_ISSUE_CODE_ID;
    const isPartiallyApproved = statusCodeId === STATUS_PARTIALLY_APPROVED_CODE_ID;

    if (!isFullyApproved && !isPartiallyApproved) {
        const error = new Error(
            "Only approved or partially approved material issue requests can be issued"
        );
        error.statusCode = 409;
        throw error;
    }

    const itemsToIssue = indent.txn_indent_items.filter((item) =>
        isPartiallyApproved ? isItemApprovedForIssue(item, indent) : !item.is_rejected
    );

    if (itemsToIssue.length === 0) {
        const error = new Error("No approved items available to issue");
        error.statusCode = 409;
        throw error;
    }

    const issuedStatusId = await getStatusIdByCodeId(
        STATUS_COMPLETED_CODE_ID,
        "Material issued status not found"
    );

    await prisma.$transaction(async (tx) => {
        for (const item of itemsToIssue) {
            const stock = await tx.txn_stock_summary.findFirst({
                where: { material_id: item.material_id },
            });

            if (!stock) {
                const error = new Error(
                    `Stock not found for material: ${item.material_code}`
                );
                error.statusCode = 404;
                throw error;
            }

            const currentQty = stock.stock_qty ?? 0;
            const issueQty = Number(item.quantity);

            if (currentQty < issueQty) {
                const error = new Error(
                    `Insufficient stock for material: ${item.material_code}`
                );
                error.statusCode = 409;
                throw error;
            }

            await tx.txn_stock_summary.update({
                where: { id: stock.id },
                data: {
                    stock_qty: currentQty - issueQty,
                    updated_at: new Date(),
                },
            });
        }

        await tx.txn_indents.update({
            where: { id: Number(indentId) },
            data: {
                status_id: issuedStatusId,
                updated_at: new Date(),
            },
        });
    });

    const updatedIndent = await prisma.txn_indents.findUnique({
        where: { id: Number(indentId) },
        select: {
            id: true,
            indent_no: true,
            created_at: true,
            l1_approval_required: true,
            l2_approval_required: true,
            mst_area: { select: { id: true, name: true } },
            mst_departments: { select: { id: true, name: true } },
            mst_employees_txn_indents_requested_byTomst_employees: {
                select: { id: true, employee_name: true, email: true },
            },
            mst_indent_statuses: {
                select: { id: true, code: true, codeId: true, description: true },
            },
            txn_indent_items: true,
        },
    });

    return formatMaterialIssueIndent(updatedIndent);
}

module.exports = {
    getMaterialIssueIndents,
    issueMaterial,
};
