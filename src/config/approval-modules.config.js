const APPROVAL_MODULE_INDENT = "INDENT";
const APPROVAL_MODULE_MATERIAL_ISSUE = "MATERIAL_ISSUE";
const APPROVAL_MODULE_PURCHASE_ORDER = "PURCHASE_ORDER";
const APPROVAL_MODULE_GRN = "GRN";

// totalValue in rules maps to:
// - INDENT: sum(quantity * unit_price)
// - MATERIAL_ISSUE: sum(quantity)
// - PURCHASE_ORDER: total_amount
// - GRN: sum(gate_qty / quantity)
const APPROVAL_MODULES = {
    [APPROVAL_MODULE_INDENT]: {
        valueMode: "totalPrice",
        zenModuleName: "Indent",
    },
    [APPROVAL_MODULE_MATERIAL_ISSUE]: {
        valueMode: "totalQuantity",
        zenModuleName: "Material Issue",
    },
    [APPROVAL_MODULE_PURCHASE_ORDER]: {
        valueMode: "totalAmount",
        zenModuleName: "Purchase Order",
    },
    [APPROVAL_MODULE_GRN]: {
        valueMode: "totalQuantity",
        zenModuleName: "GRN",
    },
};

module.exports = {
    APPROVAL_MODULE_INDENT,
    APPROVAL_MODULE_MATERIAL_ISSUE,
    APPROVAL_MODULE_PURCHASE_ORDER,
    APPROVAL_MODULE_GRN,
    APPROVAL_MODULES,
};
