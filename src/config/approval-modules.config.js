const APPROVAL_MODULE_INDENT = "INDENT";
const APPROVAL_MODULE_MATERIAL_ISSUE = "MATERIAL_ISSUE";
const APPROVAL_MODULE_PURCHASE_ORDER = "PURCHASE_ORDER";

// totalValue in rules maps to:
// - INDENT: sum(quantity * unit_price)
// - MATERIAL_ISSUE: sum(quantity)
// - PURCHASE_ORDER: total_amount
const APPROVAL_MODULES = {
    [APPROVAL_MODULE_INDENT]: {
        valueMode: "totalPrice",
    },
    [APPROVAL_MODULE_MATERIAL_ISSUE]: {
        valueMode: "totalQuantity",
    },
    [APPROVAL_MODULE_PURCHASE_ORDER]: {
        valueMode: "totalAmount",
    },
};

module.exports = {
    APPROVAL_MODULE_INDENT,
    APPROVAL_MODULE_MATERIAL_ISSUE,
    APPROVAL_MODULE_PURCHASE_ORDER,
    APPROVAL_MODULES,
};
