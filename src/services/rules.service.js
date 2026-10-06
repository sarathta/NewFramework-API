const fs = require("fs/promises");
const path = require("path");
const { ZenEngine } = require("@gorules/zen-engine");
const {
    PO_MODULE_RULES_PATH,
    invalidateZenDecisionCache,
} = require("./approval-rule-evaluator.service");

function createHttpError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function validateRulesPayload(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createHttpError(400, "Rules payload must be a JSON object");
    }

    try {
        const engine = new ZenEngine();
        engine.createDecision(Buffer.from(JSON.stringify(payload)));
    } catch (error) {
        throw createHttpError(
            400,
            error.message || "Invalid GoRules decision JSON"
        );
    }
}

async function getRules() {
    const content = await fs.readFile(PO_MODULE_RULES_PATH, "utf8");
    return JSON.parse(content);
}

async function updateRules(payload) {
    validateRulesPayload(payload);

    await fs.mkdir(path.dirname(PO_MODULE_RULES_PATH), { recursive: true });

    const serialized = `${JSON.stringify(payload, null, 2)}\n`;

    try {
        await fs.access(PO_MODULE_RULES_PATH);
        await fs.writeFile(PO_MODULE_RULES_PATH, serialized, "utf8");
    } catch (error) {
        if (error.code !== "ENOENT") {
            throw error;
        }
        await fs.writeFile(PO_MODULE_RULES_PATH, serialized, { encoding: "utf8", flag: "wx" });
    }

    invalidateZenDecisionCache();
    return JSON.parse(serialized);
}

module.exports = {
    getRules,
    updateRules,
};
