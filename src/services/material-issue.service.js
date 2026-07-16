const { prisma } = require("../config/db");

const STATUS_MATERIAL_ISSUE_CODE_ID = 1;
const STATUS_MATERIAL_ISSUED_CODE_ID = 5;

function formatMaterialIssueIndent(indent) {
    return {
        id: indent.id,
        indent_no: indent.indent_no,
        area: indent.mst_area,
        department: indent.mst_departments,
        requested_by: indent.mst_employees_txn_indents_requested_byTomst_employees,
        created_at: indent.created_at,
        items: indent.txn_indent_items,
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
            mst_indent_statuses: {
                codeId: STATUS_MATERIAL_ISSUE_CODE_ID,
            },
        },
        select: {
            id: true,
            indent_no: true,
            created_at: true,
            mst_area: { select: { id: true, name: true } },
            mst_departments: { select: { id: true, name: true } },
            mst_employees_txn_indents_requested_byTomst_employees: {
                select: { id: true, employee_name: true, email: true },
            },
            txn_indent_items: true,
        },
        orderBy: { created_at: "desc" },
    });

    return indents.map(formatMaterialIssueIndent);
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

    if (indent.mst_indent_statuses?.codeId !== STATUS_MATERIAL_ISSUE_CODE_ID) {
        const error = new Error("Only pending material issue requests can be issued");
        error.statusCode = 409;
        throw error;
    }

    const issuedStatusId = await getStatusIdByCodeId(
        STATUS_MATERIAL_ISSUED_CODE_ID,
        "Material issued status not found"
    );

    await prisma.$transaction(async (tx) => {
        for (const item of indent.txn_indent_items) {
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

    return {
        ...formatMaterialIssueIndent(updatedIndent),
        status: updatedIndent.mst_indent_statuses
            ? {
                  id: updatedIndent.mst_indent_statuses.id,
                  code: updatedIndent.mst_indent_statuses.code,
                  code_id: updatedIndent.mst_indent_statuses.codeId,
                  description: updatedIndent.mst_indent_statuses.description,
              }
            : null,
    };
}

module.exports = {
    getMaterialIssueIndents,
    issueMaterial,
};
