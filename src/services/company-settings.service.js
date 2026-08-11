const path = require("path");
const fs = require("fs");
const { prisma } = require("../config/db");
const { companyLogoDir } = require("../middlewares/companyLogoUpload");

const companySettingsSelect = {
    id: true,
    company_name: true,
    address: true,
    phone: true,
    email: true,
    gst_number: true,
    logo_path: true,
    created_at: true,
    updated_at: true,
};

function toPublicLogoPath(logoPath) {
    if (!logoPath) {
        return null;
    }

    if (logoPath.startsWith("data:") || logoPath.startsWith("http")) {
        return logoPath;
    }

    const fileName = path.basename(logoPath);
    return `/uploads/company-logos/${fileName}`;
}

function formatCompanySettings(settings, terms = []) {
    if (!settings) {
        return null;
    }

    const { logo_path, ...rest } = settings;

    return {
        ...rest,
        logo_path: toPublicLogoPath(logo_path),
        terms: terms.map((term) => ({
            id: term.id,
            title: term.title,
            content: term.content,
            display_order: term.display_order,
            enabled: term.enabled,
        })),
    };
}

function parseTerms(terms) {
    if (terms === undefined || terms === null || terms === "") {
        return undefined;
    }

    if (Array.isArray(terms)) {
        return terms;
    }

    if (typeof terms === "string") {
        try {
            const parsed = JSON.parse(terms);
            if (!Array.isArray(parsed)) {
                const error = new Error("terms must be a JSON array");
                error.statusCode = 400;
                throw error;
            }
            return parsed;
        } catch (error) {
            if (error.statusCode) {
                throw error;
            }
            const parseError = new Error("terms must be valid JSON");
            parseError.statusCode = 400;
            throw parseError;
        }
    }

    const error = new Error("terms must be an array");
    error.statusCode = 400;
    throw error;
}

function normalizePayload(body = {}, file) {
    const payload = {
        company_name: body.company_name,
        address: body.address,
        phone: body.phone,
        email: body.email,
        gst_number: body.gst_number,
        logo_base64: body.logo_base64,
        terms: parseTerms(body.terms),
    };

    if (file) {
        payload.logo_path = path.join("uploads", "company-logos", file.filename);
    }

    return payload;
}

function validatePayload(payload, { partial = false } = {}) {
    if (!payload || typeof payload !== "object") {
        const error = new Error("Request body is required");
        error.statusCode = 400;
        throw error;
    }

    if (!partial) {
        if (!payload.company_name) {
            const error = new Error("company_name is required");
            error.statusCode = 400;
            throw error;
        }
    }

    if (payload.terms !== undefined) {
        if (!Array.isArray(payload.terms)) {
            const error = new Error("terms must be an array");
            error.statusCode = 400;
            throw error;
        }

        for (const [index, term] of payload.terms.entries()) {
            if (!term?.title) {
                const error = new Error(`terms[${index}].title is required`);
                error.statusCode = 400;
                throw error;
            }
            if (term.content === undefined || term.content === null) {
                const error = new Error(`terms[${index}].content is required`);
                error.statusCode = 400;
                throw error;
            }
        }
    }
}

function mapSettingsData(payload) {
    const data = {};

    if (payload.company_name !== undefined) data.company_name = payload.company_name;
    if (payload.address !== undefined) data.address = payload.address || null;
    if (payload.phone !== undefined) data.phone = payload.phone || null;
    if (payload.email !== undefined) data.email = payload.email || null;
    if (payload.gst_number !== undefined) data.gst_number = payload.gst_number || null;
    if (payload.logo_path !== undefined) data.logo_path = payload.logo_path || null;
    else if (payload.logo_base64 !== undefined) data.logo_path = payload.logo_base64 || null;

    return data;
}

function mapTermsCreate(terms = []) {
    return terms.map((term, index) => ({
        title: term.title,
        content: term.content,
        display_order:
            term.display_order !== undefined && term.display_order !== null
                ? Number(term.display_order)
                : index + 1,
        enabled: term.enabled !== undefined ? Boolean(term.enabled) : true,
    }));
}

function mapTermData(term, index) {
    return {
        title: term.title,
        content: term.content,
        display_order:
            term.display_order !== undefined && term.display_order !== null
                ? Number(term.display_order)
                : index + 1,
        enabled: term.enabled !== undefined ? Boolean(term.enabled) : true,
        updated_at: new Date(),
    };
}

async function syncPoTerms(tx, terms = []) {
    const existingTerms = await tx.mst_po_terms.findMany({
        select: { id: true },
    });
    const existingIds = new Set(existingTerms.map((term) => term.id));

    const payloadIds = new Set();
    const toCreate = [];

    for (const [index, term] of terms.entries()) {
        const termId =
            term.id !== undefined && term.id !== null && term.id !== ""
                ? Number(term.id)
                : null;

        if (termId) {
            if (!existingIds.has(termId)) {
                const error = new Error(`terms[${index}].id ${termId} not found`);
                error.statusCode = 404;
                throw error;
            }

            payloadIds.add(termId);
            await tx.mst_po_terms.update({
                where: { id: termId },
                data: mapTermData(term, index),
            });
            continue;
        }

        toCreate.push(mapTermData(term, index));
    }

    const idsToDelete = [...existingIds].filter((id) => !payloadIds.has(id));

    if (idsToDelete.length > 0) {
        await tx.txn_purchase_order_terms.updateMany({
            where: { term_id: { in: idsToDelete } },
            data: { term_id: null },
        });

        await tx.mst_po_terms.deleteMany({
            where: { id: { in: idsToDelete } },
        });
    }

    if (toCreate.length > 0) {
        await tx.mst_po_terms.createMany({
            data: toCreate,
        });
    }
}

function deleteLogoFile(logoPath) {
    if (!logoPath || logoPath.startsWith("data:") || logoPath.startsWith("http")) {
        return;
    }

    const absolutePath = path.isAbsolute(logoPath)
        ? logoPath
        : path.join(process.cwd(), logoPath);

    if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
    }
}

async function getAllPoTerms() {
    return prisma.mst_po_terms.findMany({
        orderBy: [{ display_order: "asc" }, { id: "asc" }],
    });
}

async function getCompanySettings() {
    const settings = await prisma.mst_company_settings.findFirst({
        orderBy: { id: "asc" },
        select: companySettingsSelect,
    });

    if (!settings) {
        return null;
    }

    const terms = await getAllPoTerms();
    return formatCompanySettings(settings, terms);
}

async function createCompanySettings(body, file) {
    const payload = normalizePayload(body, file);
    validatePayload(payload);

    const existing = await prisma.mst_company_settings.findFirst({
        select: { id: true },
    });

    if (existing) {
        if (file) {
            deleteLogoFile(path.join(companyLogoDir, file.filename));
        }
        const error = new Error("Company settings already exist. Use update instead.");
        error.statusCode = 409;
        throw error;
    }

    const settingsData = mapSettingsData(payload);
    const terms = Array.isArray(payload.terms) ? payload.terms : [];

    const settings = await prisma.$transaction(async (tx) => {
        const created = await tx.mst_company_settings.create({
            data: settingsData,
            select: companySettingsSelect,
        });

        if (terms.length > 0) {
            await tx.mst_po_terms.createMany({
                data: mapTermsCreate(terms),
            });
        }

        return created;
    });

    const savedTerms = await getAllPoTerms();
    return formatCompanySettings(settings, savedTerms);
}

async function updateCompanySettings(id, body, file) {
    const payload = normalizePayload(body, file);
    validatePayload(payload, { partial: true });

    const existing = await prisma.mst_company_settings.findUnique({
        where: { id: Number(id) },
        select: { id: true, logo_path: true },
    });

    if (!existing) {
        if (file) {
            deleteLogoFile(path.join(companyLogoDir, file.filename));
        }
        const error = new Error("Company settings not found");
        error.statusCode = 404;
        throw error;
    }

    const settingsData = mapSettingsData(payload);
    settingsData.updated_at = new Date();

    const settings = await prisma.$transaction(async (tx) => {
        const updated = await tx.mst_company_settings.update({
            where: { id: Number(id) },
            data: settingsData,
            select: companySettingsSelect,
        });

        if (Array.isArray(payload.terms)) {
            await syncPoTerms(tx, payload.terms);
        }

        return updated;
    });

    if (file && existing.logo_path && existing.logo_path !== settings.logo_path) {
        deleteLogoFile(existing.logo_path);
    }

    const savedTerms = await getAllPoTerms();
    return formatCompanySettings(settings, savedTerms);
}

module.exports = {
    getCompanySettings,
    createCompanySettings,
    updateCompanySettings,
};
