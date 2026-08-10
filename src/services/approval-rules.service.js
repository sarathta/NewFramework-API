const { prisma } = require("../config/db");

function formatApprovalRule(rule) {
    return {
        id: Number(rule.id),
        module: rule.module,
        name: rule.rule_name,
        priority: rule.priority,
        enabled: rule.enabled,
        conditions: rule.conditions,
        actions: rule.actions,
        created_at: rule.created_at,
        updated_at: rule.updated_at,
    };
}

function validatePayload(payload) {
    const requiredFields = ["module", "name", "conditions", "actions"];

    for (const field of requiredFields) {
        if (payload[field] === undefined || payload[field] === null || payload[field] === "") {
            const error = new Error(`${field} is required`);
            error.statusCode = 400;
            throw error;
        }
    }

    if (!Array.isArray(payload.conditions)) {
        const error = new Error("conditions must be an array");
        error.statusCode = 400;
        throw error;
    }

    if (
        typeof payload.actions !== "object" ||
        payload.actions === null ||
        Array.isArray(payload.actions)
    ) {
        const error = new Error("actions must be an object");
        error.statusCode = 400;
        throw error;
    }
}

function mapPayloadToData(payload) {
    const data = {};

    if (payload.module !== undefined) data.module = payload.module;
    if (payload.name !== undefined) data.rule_name = payload.name;
    if (payload.priority !== undefined) data.priority = Number(payload.priority);
    if (payload.enabled !== undefined) data.enabled = Boolean(payload.enabled);
    if (payload.conditions !== undefined) data.conditions = payload.conditions;
    if (payload.actions !== undefined) data.actions = payload.actions;

    return data;
}

async function getApprovalRules(module) {
    const where = module ? { module } : {};

    const rules = await prisma.txn_approval_rules.findMany({
        where,
        orderBy: [{ priority: "asc" }, { id: "asc" }],
    });

    return rules.map(formatApprovalRule);
}

async function getApprovalRuleById(id) {
    const rule = await prisma.txn_approval_rules.findUnique({
        where: { id: BigInt(id) },
    });

    return rule ? formatApprovalRule(rule) : null;
}

async function createApprovalRule(payload) {
    validatePayload(payload);

    const rule = await prisma.txn_approval_rules.create({
        data: {
            module: payload.module,
            rule_name: payload.name,
            priority: payload.priority !== undefined ? Number(payload.priority) : 1,
            enabled: payload.enabled !== undefined ? Boolean(payload.enabled) : true,
            conditions: payload.conditions,
            actions: payload.actions,
        },
    });

    return formatApprovalRule(rule);
}

async function updateApprovalRule(id, payload) {
    const existing = await prisma.txn_approval_rules.findUnique({
        where: { id: BigInt(id) },
        select: { id: true },
    });

    if (!existing) {
        const error = new Error("Approval rule not found");
        error.statusCode = 404;
        throw error;
    }

    if (payload.conditions !== undefined && !Array.isArray(payload.conditions)) {
        const error = new Error("conditions must be an array");
        error.statusCode = 400;
        throw error;
    }

    if (
        payload.actions !== undefined &&
        (typeof payload.actions !== "object" ||
            payload.actions === null ||
            Array.isArray(payload.actions))
    ) {
        const error = new Error("actions must be an object");
        error.statusCode = 400;
        throw error;
    }

    const data = mapPayloadToData(payload);
    data.updated_at = new Date();

    const rule = await prisma.txn_approval_rules.update({
        where: { id: BigInt(id) },
        data,
    });

    return formatApprovalRule(rule);
}

async function deleteApprovalRule(id) {
    const existing = await prisma.txn_approval_rules.findUnique({
        where: { id: BigInt(id) },
    });

    if (!existing) {
        const error = new Error("Approval rule not found");
        error.statusCode = 404;
        throw error;
    }

    const rule = await prisma.txn_approval_rules.delete({
        where: { id: BigInt(id) },
    });

    return formatApprovalRule(rule);
}

module.exports = {
    getApprovalRules,
    getApprovalRuleById,
    createApprovalRule,
    updateApprovalRule,
    deleteApprovalRule,
};
