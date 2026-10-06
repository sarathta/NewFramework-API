const fs = require("fs");
const path = require("path");
const { ZenEngine } = require("@gorules/zen-engine");
const {
    ROLE_L1_APPROVER,
    ROLE_L2_APPROVER,
} = require("../config/roles.config");
const { APPROVAL_MODULES } = require("../config/approval-modules.config");

const CREATED_BY_ROLE_USER = "USER";
const CREATED_BY_ROLE_L1 = "L1";
const CREATED_BY_ROLE_L2 = "L2";

const PO_MODULE_RULES_PATH = path.join(
    __dirname,
    "..",
    "..",
    "rules",
    "po_module_rules.json"
);

let cachedDecision;

function resolveCreatedByRole(roleId) {
    const numericRoleId = Number(roleId);

    if (numericRoleId === ROLE_L1_APPROVER) {
        return CREATED_BY_ROLE_L1;
    }

    if (numericRoleId === ROLE_L2_APPROVER) {
        return CREATED_BY_ROLE_L2;
    }

    return CREATED_BY_ROLE_USER;
}

function calculateTotalQuantity(items = []) {
    return items.reduce((sum, item) => sum + Number(item.quantity ?? item.qty ?? 0), 0);
}

function calculateTotalPrice(items = []) {
    return items.reduce((sum, item) => {
        const quantity = Number(item.quantity ?? item.qty ?? 0);
        const unitPrice = Number(item.unit_price ?? 0);
        return sum + quantity * unitPrice;
    }, 0);
}

function resolveZenModuleName(module) {
    const moduleConfig = APPROVAL_MODULES[module];
    if (moduleConfig?.zenModuleName) {
        return moduleConfig.zenModuleName;
    }

    return String(module ?? "").trim();
}

function resolveModuleTotalValue(module, items, totalAmount) {
    const moduleConfig = APPROVAL_MODULES[module];
    const valueMode = moduleConfig?.valueMode;

    if (valueMode === "totalQuantity") {
        return calculateTotalQuantity(items);
    }

    if (valueMode === "totalPrice") {
        return calculateTotalPrice(items);
    }

    return Number(totalAmount ?? calculateTotalPrice(items) ?? 0);
}

function buildEvaluationContext({ module, roleId, departmentId, items, totalAmount }) {
    const totalQuantity = calculateTotalQuantity(items);
    const totalPrice = calculateTotalPrice(items);
    const resolvedTotalAmount = Number(totalAmount ?? totalPrice);
    const totalValue = resolveModuleTotalValue(module, items, resolvedTotalAmount);
    const createdByRole = resolveCreatedByRole(roleId);
    const zenModuleName = resolveZenModuleName(module);

    return {
        module: zenModuleName,
        createdby: createdByRole,
        createdByRole,
        departmentId:
            departmentId !== undefined && departmentId !== null && departmentId !== ""
                ? Number(departmentId)
                : null,
        totalvalue: totalValue,
        totalValue,
        totalQuantity,
        totalPrice,
        totalAmount: resolvedTotalAmount,
    };
}

function getZenDecision() {
    if (cachedDecision) {
        return cachedDecision;
    }

    const content = fs.readFileSync(PO_MODULE_RULES_PATH);
    const engine = new ZenEngine();
    cachedDecision = engine.createDecision(content);
    return cachedDecision;
}

function invalidateZenDecisionCache() {
    cachedDecision = null;
}

function normalizeApprovalLevels(approval) {
    if (approval == null || approval === "") {
        return [];
    }

    const values = Array.isArray(approval) ? approval : [approval];

    return values
        .map((level) => String(level ?? "").trim().toUpperCase())
        .filter(Boolean);
}

function mapApprovalLevelsToRequirements(approval) {
    const roles = new Set(normalizeApprovalLevels(approval));
    const approvalLevels = [...roles].map((role) => ({ role }));

    return {
        l1ApprovalRequired: roles.has("L1"),
        l2ApprovalRequired: roles.has("L2"),
        matchedRule: true,
        approval,
        approvalLevels,
    };
}

function getDefaultApprovalRequirements() {
    return {
        l1ApprovalRequired: false,
        l2ApprovalRequired: false,
        matchedRule: false,
        hasEnabledRules: false,
        approval: null,
        approvalLevels: [],
    };
}

async function evaluateApprovalRequirements({
    module,
    roleId,
    departmentId,
    items = [],
    totalAmount = 0,
}) {
    const context = buildEvaluationContext({
        module,
        roleId,
        departmentId,
        items,
        totalAmount,
    });

    const decision = getZenDecision();
    const response = await decision.evaluate({
        module: context.module,
        createdby: context.createdby,
        totalvalue: context.totalvalue,
    });
    const result = response?.result;

    if (!result || result.enabled !== true) {
        return {
            ...getDefaultApprovalRequirements(),
            context,
            zenResult: result ?? null,
        };
    }

    return {
        ...mapApprovalLevelsToRequirements(result.approval),
        hasEnabledRules: true,
        matchedRuleName: "po_module_rules",
        context,
        zenResult: result,
    };
}

module.exports = {
    PO_MODULE_RULES_PATH,
    resolveCreatedByRole,
    calculateTotalQuantity,
    calculateTotalPrice,
    buildEvaluationContext,
    evaluateApprovalRequirements,
    invalidateZenDecisionCache,
    CREATED_BY_ROLE_USER,
    CREATED_BY_ROLE_L1,
    CREATED_BY_ROLE_L2,
};
