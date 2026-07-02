const XLSX = require("xlsx");
const { prisma } = require("../config/db");
const { resolveMaster, getOptionsConfig, getImportExportColumns } = require("../config/master.config");
const {
    getMasterPage,
    createMasterRecord,
    updateMasterRecord,
} = require("./master.service");

function normalizeHeader(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

function buildHeaderMap(columns) {
    const map = new Map();

    for (const column of columns) {
        map.set(normalizeHeader(column.label), column.field);
        map.set(normalizeHeader(column.field), column.field);
    }

    return map;
}

function getCellValue(row, column) {
    if (column.type === "dropdown" && column.displayField) {
        return row[column.displayField] ?? row[column.field] ?? "";
    }
    return row[column.field] ?? "";
}

function rowsToSheetData(columns, rows) {
    const headers = columns.map((column) => column.label);
    const data = rows.map((row) => columns.map((column) => getCellValue(row, column)));
    return [headers, ...data];
}

function buildWorkbook(columns, rows, sheetName) {
    const sheetData = rowsToSheetData(columns, rows);
    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
    return workbook;
}

function workbookToBuffer(workbook, format) {
    if (format === "csv") {
        const sheetName = workbook.SheetNames[0];
        const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
        return Buffer.from(csv, "utf-8");
    }

    return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function parseUploadedFile(buffer, format) {
    if (format === "csv") {
        const workbook = XLSX.read(buffer.toString("utf-8"), { type: "string" });
        const sheetName = workbook.SheetNames[0];
        return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
    }

    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
}

async function loadOptionsMaps(config) {
    const sources = [
        ...new Set(
            (config.formFields || [])
                .filter((field) => field.optionsSource)
                .map((field) => field.optionsSource)
        ),
    ];

    const maps = {};

    for (const sourceKey of sources) {
        const optionConfig = config.optionsConfig?.[sourceKey] || getOptionsConfig(sourceKey);
        const rows = await prisma[sourceKey].findMany({ orderBy: { id: "asc" } });

        maps[sourceKey] = rows.map((row) => ({
            label: String(optionConfig.labelFn(row)).trim(),
            value: row.id,
        }));
    }

    return maps;
}

function resolveDropdownValue(value, optionsSource, optionsMaps) {
    if (value === "" || value === null || value === undefined) {
        return null;
    }

    const options = optionsMaps[optionsSource] || [];
    const normalized = String(value).trim();

    if (/^\d+$/.test(normalized)) {
        const id = Number(normalized);
        if (options.some((option) => option.value === id)) {
            return id;
        }
    }

    const match = options.find(
        (option) => option.label.toLowerCase() === normalized.toLowerCase()
    );

    if (!match) {
        throw new Error(`Invalid option "${value}" for ${optionsSource}`);
    }

    return match.value;
}

function mapRowToPayload(rawRow, columns, headerMap, optionsMaps) {
    const payload = {};

    for (const [header, rawValue] of Object.entries(rawRow)) {
        const field = headerMap.get(normalizeHeader(header));
        if (!field) continue;

        const column = columns.find((item) => item.field === field);
        if (!column) continue;

        const value = rawValue === null || rawValue === undefined ? "" : rawValue;
        if (value === "") continue;

        if (column.type === "dropdown" && column.optionsSource) {
            payload[field] = resolveDropdownValue(value, column.optionsSource, optionsMaps);
            continue;
        }

        if (column.type === "number") {
            payload[field] = Number(value);
            continue;
        }

        if (column.type === "boolean") {
            payload[field] =
                value === true ||
                value === "true" ||
                value === "TRUE" ||
                value === 1 ||
                value === "1" ||
                value === "yes" ||
                value === "YES";
            continue;
        }

        payload[field] = String(value).trim();
    }

    return payload;
}

function isEmptyRow(rawRow) {
    return Object.values(rawRow).every(
        (value) => value === "" || value === null || value === undefined
    );
}

async function exportMasterData(groupKey, masterKey, format = "xlsx") {
    const { config } = resolveMaster(groupKey, masterKey);
    const page = await getMasterPage(groupKey, masterKey);
    const columns = getImportExportColumns(config);
    const workbook = buildWorkbook(columns, page.data, config.title);
    const buffer = workbookToBuffer(workbook, format);
    const extension = format === "csv" ? "csv" : "xlsx";
    const contentType =
        format === "csv"
            ? "text/csv"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    return {
        buffer,
        filename: `${masterKey}.${extension}`,
        contentType,
    };
}

async function importMasterData(groupKey, masterKey, fileBuffer, format = "xlsx") {
    const { config } = resolveMaster(groupKey, masterKey);
    const columns = getImportExportColumns(config);
    const headerMap = buildHeaderMap(columns);
    const optionsMaps = await loadOptionsMaps(config);
    const rows = parseUploadedFile(fileBuffer, format);

    const result = {
        created: 0,
        updated: 0,
        failed: [],
    };

    for (let index = 0; index < rows.length; index += 1) {
        const rawRow = rows[index];
        const rowNumber = index + 2;

        if (isEmptyRow(rawRow)) {
            continue;
        }

        try {
            const payload = mapRowToPayload(rawRow, columns, headerMap, optionsMaps);
            const recordId = payload.id ? Number(payload.id) : null;
            delete payload.id;

            if (recordId) {
                const existing = await prisma[masterKey].findUnique({
                    where: { id: recordId },
                });

                if (existing) {
                    await updateMasterRecord(groupKey, masterKey, recordId, payload);
                    result.updated += 1;
                    continue;
                }
            }

            await createMasterRecord(groupKey, masterKey, payload);
            result.created += 1;
        } catch (error) {
            result.failed.push({
                row: rowNumber,
                message: error.message || "Import failed",
            });
        }
    }

    return result;
}

module.exports = {
    exportMasterData,
    importMasterData,
};
