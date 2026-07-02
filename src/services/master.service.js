const { prisma } = require("../config/db");
const {
    getGroups,
    getGroupTables,
    resolveMaster,
    getOptionsConfig,
} = require("../config/master.config");

function serializeValue(value) {
    if (value === null || value === undefined) return value;
    if (typeof value === "object" && typeof value.toNumber === "function") {
        return value.toNumber();
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    return value;
}

function serializeRecord(record) {
    return Object.fromEntries(
        Object.entries(record).map(([key, value]) => [key, serializeValue(value)])
    );
}

function buildInclude(config) {
    if (!config.relations) return undefined;

    const include = {};
    for (const relation of Object.values(config.relations)) {
        include[relation.include] = true;
    }
    return Object.keys(include).length > 0 ? include : undefined;
}

function transformRecord(record, config) {
    const flat = serializeRecord(record);

    if (config.relations) {
        for (const [fkField, relation] of Object.entries(config.relations)) {
            const related = record[relation.include];
            flat[relation.labelKey] = related ? relation.labelFn(related) : null;
            flat[fkField] = flat[fkField] ?? null;
        }
    }

    return flat;
}

async function loadOptions(config) {
    const sources = [
        ...new Set(
            (config.formFields || [])
                .filter((field) => field.optionsSource)
                .map((field) => field.optionsSource)
        ),
    ];

    const options = {};

    for (const sourceKey of sources) {
        const optionConfig = config.optionsConfig?.[sourceKey] || getOptionsConfig(sourceKey);
        const rows = await prisma[sourceKey].findMany({ orderBy: { id: "asc" } });

        options[sourceKey] = rows.map((row) => ({
            label: optionConfig.labelFn(row),
            value: row.id,
        }));
    }

    return options;
}

function getWritableFields(config, isCreate) {
    return (config.formFields || [])
        .filter((field) => {
            if (field.field === "id" && !isCreate) return false;
            if (field.field === "id" && isCreate && config.idAutoIncrement) return false;
            return true;
        })
        .map((field) => field.field);
}

function coerceFieldValue(fieldDef, value) {
    if (value === "" || value === undefined) {
        return fieldDef.type === "boolean" ? false : null;
    }

    switch (fieldDef.type) {
        case "number":
            return Number(value);
        case "boolean":
            return value === true || value === "true" || value === 1 || value === "1";
        default:
            return value;
    }
}

function buildPayload(body, config, isCreate) {
    const fieldMap = Object.fromEntries((config.formFields || []).map((field) => [field.field, field]));
    const writableFields = getWritableFields(config, isCreate);
    const data = {};

    for (const fieldName of writableFields) {
        if (!(fieldName in body)) continue;

        const fieldDef = fieldMap[fieldName];
        data[fieldName] = fieldDef ? coerceFieldValue(fieldDef, body[fieldName]) : body[fieldName];
    }

    if (!isCreate && config.hasUpdatedAt) {
        data.updated_at = new Date();
    }

    return data;
}

function validatePayload(body, config, isCreate) {
    const missing = (config.formFields || [])
        .filter((field) => field.required)
        .filter((field) => {
            if (!isCreate && field.field === "id") return false;
            if (!isCreate && !(field.field in body)) return false;
            const value = body[field.field];
            return value === undefined || value === null || value === "";
        })
        .map((field) => field.field);

    if (missing.length > 0) {
        const error = new Error(`Missing required fields: ${missing.join(", ")}`);
        error.statusCode = 400;
        throw error;
    }
}

async function getMasterPage(groupKey, masterKey) {
    const { config } = resolveMaster(groupKey, masterKey);
    const include = buildInclude(config);

    const records = await prisma[masterKey].findMany({
        include,
        orderBy: { id: "asc" },
    });

    const data = records.map((record) => transformRecord(record, config));
    const options = await loadOptions(config);

    return {
        title: config.title,
        dataKey: config.dataKey,
        columns: config.columns,
        formFields: config.formFields,
        data,
        options,
    };
}

async function createMasterRecord(groupKey, masterKey, body) {
    const { config } = resolveMaster(groupKey, masterKey);

    validatePayload(body, config, true);
    const data = buildPayload(body, config, true);

    const created = await prisma[masterKey].create({
        data,
        include: buildInclude(config),
    });

    return transformRecord(created, config);
}

async function updateMasterRecord(groupKey, masterKey, id, body) {
    const { config } = resolveMaster(groupKey, masterKey);

    validatePayload(body, config, false);
    const data = buildPayload(body, config, false);

    const updated = await prisma[masterKey].update({
        where: { id: Number(id) },
        data,
        include: buildInclude(config),
    });

    return transformRecord(updated, config);
}

async function deleteMasterRecord(groupKey, masterKey, id) {
    resolveMaster(groupKey, masterKey);

    const deleted = await prisma[masterKey].delete({
        where: { id: Number(id) },
    });

    return serializeRecord(deleted);
}


module.exports = {
    getGroups,
    getGroupTables,
    getMasterPage,
    createMasterRecord,
    updateMasterRecord,
    deleteMasterRecord
};
