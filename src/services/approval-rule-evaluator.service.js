const { prisma } = require("../config/db");
const {
    ROLE_L1_APPROVER,
    ROLE_L2_APPROVER,
} = require("../config/roles.config");
const { APPROVAL_MODULES } = require("../config/approval-modules.config");

const CREATED_BY_ROLE_USER = "USER";
const CREATED_BY_ROLE_L1 = "L1";
const CREATED_BY_ROLE_L2 = "L2";

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

    return {
        createdByRole: resolveCreatedByRole(roleId),
        departmentId:
            departmentId !== undefined && departmentId !== null && departmentId !== ""
                ? Number(departmentId)
                : null,
        totalValue,
        totalQuantity,
        totalPrice,
        totalAmount: resolvedTotalAmount,
    };
}

function normalizeOperator(operator) {
    return String(operator ?? "=").trim();
}

function compareValues(actual, expected, operator) {
    const op = normalizeOperator(operator);

    if (op === "=" || op === "==") {
        return String(actual) === String(expected);
    }

    if (op === "!=" || op === "<>") {
        return String(actual) !== String(expected);
    }

    const actualNumber = Number(actual);
    const expectedNumber = Number(expected);

    if (Number.isNaN(actualNumber) || Number.isNaN(expectedNumber)) {
        return false;
    }

    switch (op) {
        case ">":
            return actualNumber > expectedNumber;
        case ">=":
            return actualNumber >= expectedNumber;
        case "<":
            return actualNumber < expectedNumber;
        case "<=":
            return actualNumber <= expectedNumber;
        default:
            return false;
    }
}

function getContextFieldValue(field, context) {
    switch (field) {
        case "createdByRole":
            return context.createdByRole;
        case "departmentId":
            return context.departmentId;
        case "totalValue":
            return context.totalValue;
        case "totalQuantity":
            return context.totalQuantity;
        case "totalPrice":
            return context.totalPrice;
        case "totalAmount":
            return context.totalAmount;
        default:
            return context[field];
    }
}

function evaluateCondition(condition, context) {
    if (!condition || typeof condition !== "object") {
        return false;
    }

    const actualValue = getContextFieldValue(condition.field, context);
    return compareValues(actualValue, condition.value, condition.operator);
}

function evaluateRuleConditions(conditions, context) {
    if (!Array.isArray(conditions) || conditions.length === 0) {
        return true;
    }

    return conditions.every((condition) => evaluateCondition(condition, context));
}

function mapApprovalLevelsToRequirements(approvalLevels = []) {
    const levels = Array.isArray(approvalLevels) ? approvalLevels : [];
    const roles = new Set(levels.map((level) => String(level.role ?? "").toUpperCase()));

    return {
        l1ApprovalRequired: roles.has("L1"),
        l2ApprovalRequired: roles.has("L2"),
        matchedRule: true,
        approvalLevels: levels,
    };
}

function getDefaultApprovalRequirements() {
    return {
        l1ApprovalRequired: false,
        l2ApprovalRequired: false,
        matchedRule: false,
        approvalLevels: [],
    };
}

async function getEnabledRulesForModule(module) {
    return prisma.txn_approval_rules.findMany({
        where: {
            module,
            enabled: true,
        },
        orderBy: [{ priority: "asc" }, { id: "asc" }],
    });
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

    const rules = await getEnabledRulesForModule(module);

    for (const rule of rules) {
        const conditions = Array.isArray(rule.conditions) ? rule.conditions : [];

        if (!evaluateRuleConditions(conditions, context)) {
            continue;
        }

        const actions =
            typeof rule.actions === "object" && rule.actions !== null ? rule.actions : {};

        return {
            ...mapApprovalLevelsToRequirements(actions.approvalLevels),
            matchedRuleId: Number(rule.id),
            matchedRuleName: rule.rule_name,
            context,
        };
    }

    return {
        ...getDefaultApprovalRequirements(),
        context,
    };
}

module.exports = {
    resolveCreatedByRole,
    calculateTotalQuantity,
    calculateTotalPrice,
    buildEvaluationContext,
    evaluateCondition,
    evaluateRuleConditions,
    evaluateApprovalRequirements,
    CREATED_BY_ROLE_USER,
    CREATED_BY_ROLE_L1,
    CREATED_BY_ROLE_L2,
};
