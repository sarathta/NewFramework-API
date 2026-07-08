const { prisma } = require("../config/db");

const STATUS_L1_L2_APPROVED_CODE_ID = 7;

const approvedIndentInclude = {
    mst_departments: { select: { id: true, name: true } },
    mst_indent_statuses: {
        select: { id: true, code: true, codeId: true, description: true },
    },
    txn_indent_items: true,
    mst_employees_txn_indents_requested_byTomst_employees: {
        select: { id: true, employee_name: true, email: true },
    },
    mst_employees_txn_indents_l1_approved_byTomst_employees: {
        select: { id: true, employee_name: true },
    },
    mst_employees_txn_indents_l2_approved_byTomst_employees: {
        select: { id: true, employee_name: true },
    },
};

function formatApprovedIndent(indent) {
    const {
        mst_indent_statuses,
        mst_departments,
        txn_indent_items,
        mst_employees_txn_indents_requested_byTomst_employees,
        mst_employees_txn_indents_l1_approved_byTomst_employees,
        mst_employees_txn_indents_l2_approved_byTomst_employees,
        ...indentData
    } = indent;

    return {
        ...indentData,
        department: mst_departments,
        status: mst_indent_statuses
            ? {
                  id: mst_indent_statuses.id,
                  code: mst_indent_statuses.code,
                  code_id: mst_indent_statuses.codeId,
                  description: mst_indent_statuses.description,
              }
            : null,
        items: txn_indent_items,
        requested_by: mst_employees_txn_indents_requested_byTomst_employees,
        l1_approved_by: mst_employees_txn_indents_l1_approved_byTomst_employees,
        l2_approved_by: mst_employees_txn_indents_l2_approved_byTomst_employees,
    };
}

async function getApprovedIndents() {
    const indents = await prisma.txn_indents.findMany({
        where: {
            l1_approved: true,
            l2_approved: true,
            mst_indent_statuses: {
                codeId: STATUS_L1_L2_APPROVED_CODE_ID,
            },
        },
        include: approvedIndentInclude,
        orderBy: { created_at: "desc" },
    });

    return indents.map(formatApprovedIndent);
}

module.exports = {
    getApprovedIndents,
};
