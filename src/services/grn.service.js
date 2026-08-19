const fs = require("fs");
const path = require("path");
const { prisma } = require("../config/db");
const {
    GRN_TYPE_GENERATED,
    GRN_TYPE_DRAFT,
    GRN_STATUS_PHASE_ONE_CODE_ID,
    GRN_STATUS_COMPLETED_CODE_ID,
    GRN_STATUS_DRAFT_CODE_ID,
    PO_STATUS_COMPLETED_CODE_ID,
} = require("../config/status.config");
const { APPROVAL_MODULE_GRN } = require("../config/approval-modules.config");
const { evaluateApprovalRequirements } = require("./approval-rule-evaluator.service");

const GRN_UPLOAD_ROOT = path.join(process.cwd(), "uploads", "grn");

const grnInclude = {
    txn_grn_items: {
        orderBy: { id: "asc" },
        include: {
            txn_purchase_order_items: {
                select: {
                    id: true,
                    material_id: true,
                    material_code: true,
                    description: true,
                    qty: true,
                    unit_price: true,
                    uom: true,
                    gst_rate: true,
                },
            },
        },
    },
    txn_grn_attachments: {
        orderBy: { id: "asc" },
    },
    mst_grns_status: {
        select: { id: true, code_id: true, code: true, description: true },
    },
};

function toNumber(value) {
    if (value === null || value === undefined) {
        return value;
    }
    if (typeof value === "bigint") {
        return Number(value);
    }
    if (typeof value?.toNumber === "function") {
        return value.toNumber();
    }
    return value;
}

function formatGrnItem(item) {
    const { txn_purchase_order_items, ...itemData } = item;

    return {
        ...itemData,
        id: toNumber(item.id),
        grn_id: toNumber(item.grn_id),
        po_item_id: toNumber(item.po_item_id),
        po_quantity: toNumber(item.po_quantity),
        previously_received_quantity: toNumber(item.previously_received_quantity),
        gate_received_quantity: toNumber(item.gate_received_quantity),
        confirmed_quantity: toNumber(item.confirmed_quantity),
        accepted_quantity: toNumber(item.accepted_quantity),
        rejected_quantity: toNumber(item.rejected_quantity),
        storage_location_id: toNumber(item.storage_location_id),
        po_item: txn_purchase_order_items
            ? {
                  ...txn_purchase_order_items,
                  qty: toNumber(txn_purchase_order_items.qty),
                  quantity: toNumber(txn_purchase_order_items.qty),
                  unit_price: toNumber(txn_purchase_order_items.unit_price),
                  gst_rate: toNumber(txn_purchase_order_items.gst_rate),
              }
            : null,
    };
}

function formatGrnAttachment(attachment) {
    return {
        ...attachment,
        id: toNumber(attachment.id),
        grn_id: toNumber(attachment.grn_id),
        file_size: toNumber(attachment.file_size),
        uploaded_by: toNumber(attachment.uploaded_by),
    };
}

function formatGrn(grn) {
    const { txn_grn_items, txn_grn_attachments, mst_grns_status, ...grnData } = grn;

    return {
        ...grnData,
        id: toNumber(grn.id),
        po_id: toNumber(grn.po_id),
        vendor_id: toNumber(grn.vendor_id),
        gate_received_by: toNumber(grn.gate_received_by),
        invoice_amount: toNumber(grn.invoice_amount),
        taxable_amount: toNumber(grn.taxable_amount),
        gst_amount: toNumber(grn.gst_amount),
        invoice_confirmed_by: toNumber(grn.invoice_confirmed_by),
        created_by: toNumber(grn.created_by),
        updated_by: toNumber(grn.updated_by),
        is_phase_two_required: Boolean(grn.is_phase_two_required),
        status: mst_grns_status
            ? {
                  id: mst_grns_status.id,
                  code_id: mst_grns_status.code_id,
                  code: mst_grns_status.code,
                  description: mst_grns_status.description,
              }
            : null,
        items: (txn_grn_items || []).map(formatGrnItem),
        attachments: (txn_grn_attachments || []).map(formatGrnAttachment),
    };
}

function formatPhaseOneGrn(grn, vendorById = new Map(), poById = new Map()) {
    const { txn_grn_items, mst_grns_status } = grn;
    const vendorId = toNumber(grn.vendor_id);
    const poId = toNumber(grn.po_id);
    const vendor = vendorById.get(vendorId) ?? null;
    const purchaseOrder = poById.get(poId) ?? null;

    return {
        id: toNumber(grn.id),
        grn_number: grn.grn_number,
        po_id: poId,
        po_no: purchaseOrder?.po_no ?? null,
        vendor_id: vendorId,
        vendor_name: vendor?.company_name ?? null,
        gate_entry_date: grn.gate_entry_date,
        vehicle_no: grn.vehicle_no,
        driver_name: grn.driver_name,
        gate_received_by: toNumber(grn.gate_received_by),
        invoice_no: grn.invoice_no,
        invoice_date: grn.invoice_date,
        invoice_amount: grn.invoice_amount ?? null,
        remarks: grn.remarks,
        type: grn.type,
        status_id: grn.status_id,
        is_phase_two_required: Boolean(grn.is_phase_two_required),
        created_by: toNumber(grn.created_by),
        created_at: grn.created_at,
        updated_by: toNumber(grn.updated_by),
        updated_at: grn.updated_at,
        status: mst_grns_status
            ? {
                  id: mst_grns_status.id,
                  code_id: mst_grns_status.code_id,
                  code: mst_grns_status.code,
                  description: mst_grns_status.description,
              }
            : null,
        items: (txn_grn_items || []).map(formatGrnItem),
    };
}

function formatPhaseTwoGrn(grn, vendorById = new Map(), poById = new Map()) {
    const { txn_grn_items, txn_grn_attachments, mst_grns_status } = grn;
    const vendorId = toNumber(grn.vendor_id);
    const poId = toNumber(grn.po_id);
    const vendor = vendorById.get(vendorId) ?? null;
    const purchaseOrder = poById.get(poId) ?? null;

    return {
        id: toNumber(grn.id),
        grn_number: grn.grn_number,
        po_id: poId,
        po_no: purchaseOrder?.po_no ?? null,
        vendor_id: vendorId,
        vendor_name: vendor?.company_name ?? null,
        gate_entry_date: grn.gate_entry_date,
        vehicle_no: grn.vehicle_no,
        driver_name: grn.driver_name,
        gate_received_by: toNumber(grn.gate_received_by),
        invoice_no: grn.invoice_no,
        invoice_date: grn.invoice_date,
        invoice_amount: toNumber(grn.invoice_amount),
        taxable_amount: toNumber(grn.taxable_amount),
        gst_amount: toNumber(grn.gst_amount),
        eway_bill_no: grn.eway_bill_no,
        invoice_confirmed_by: toNumber(grn.invoice_confirmed_by),
        invoice_confirmed_at: grn.invoice_confirmed_at,
        remarks: grn.remarks,
        type: grn.type,
        status_id: grn.status_id,
        is_phase_two_required: Boolean(grn.is_phase_two_required),
        created_by: toNumber(grn.created_by),
        created_at: grn.created_at,
        updated_by: toNumber(grn.updated_by),
        updated_at: grn.updated_at,
        status: mst_grns_status
            ? {
                  id: mst_grns_status.id,
                  code_id: mst_grns_status.code_id,
                  code: mst_grns_status.code,
                  description: mst_grns_status.description,
              }
            : null,
        items: (txn_grn_items || []).map(formatGrnItem),
        attachments: (txn_grn_attachments || []).map(formatGrnAttachment),
    };
}

async function getVendorAndPoMaps(grns) {
    if (!grns || grns.length === 0) {
        return { vendorById: new Map(), poById: new Map() };
    }

    const vendorIds = [
        ...new Set(grns.map((grn) => Number(grn.vendor_id)).filter(Boolean)),
    ];
    const poIds = [...new Set(grns.map((grn) => Number(grn.po_id)).filter(Boolean))];

    const [vendors, purchaseOrders] = await Promise.all([
        vendorIds.length > 0
            ? prisma.mst_vendors.findMany({
                  where: { id: { in: vendorIds } },
                  select: { id: true, company_name: true },
              })
            : [],
        poIds.length > 0
            ? prisma.txn_purchase_orders.findMany({
                  where: { id: { in: poIds } },
                  select: { id: true, po_no: true },
              })
            : [],
    ]);

    return {
        vendorById: new Map(vendors.map((vendor) => [vendor.id, vendor])),
        poById: new Map(purchaseOrders.map((po) => [po.id, po])),
    };
}

async function getGrnStatusIdByCodeId(codeId, notFoundMessage) {
    const status = await prisma.mst_grns_status.findFirst({
        where: { code_id: Number(codeId) },
        select: { id: true },
    });

    if (!status) {
        const error = new Error(notFoundMessage || "GRN status not found");
        error.statusCode = 404;
        throw error;
    }

    return status.id;
}

function toQty(value) {
    return Number(Number(value ?? 0).toFixed(3));
}

function hasReachedQuantity(actual, expected) {
    return toQty(actual) >= toQty(expected) && toQty(expected) > 0;
}

async function addConfirmedQuantityToApprovedMaterials(tx, materialId, confirmedQuantity, poId) {
    const quantityToAdd = toQty(confirmedQuantity);
    if (!materialId || quantityToAdd <= 0) {
        return;
    }

    const approvedMaterials = await tx.txn_approved_indent_materials.findMany({
        where: {
            material_id: Number(materialId),
            is_received: false,
        },
        orderBy: { approved_date: "asc" },
    });

    if (approvedMaterials.length === 0) {
        return;
    }

    const poLinked = approvedMaterials.filter(
        (row) => row.po_id !== null && Number(row.po_id) === Number(poId)
    );
    const targetRows = poLinked.length > 0 ? poLinked : approvedMaterials;

    let remaining = quantityToAdd;

    for (const row of targetRows) {
        if (remaining <= 0) {
            break;
        }

        const orderedQuantity = toQty(row.quantity);
        const currentReceived = toQty(row.received_quantity);
        const pendingQuantity = Math.max(orderedQuantity - currentReceived, 0);

        if (pendingQuantity <= 0) {
            continue;
        }

        const addedQuantity = Math.min(pendingQuantity, remaining);
        const newReceivedQuantity = toQty(currentReceived + addedQuantity);
        const isFullyReceived = hasReachedQuantity(newReceivedQuantity, orderedQuantity);

        await tx.txn_approved_indent_materials.update({
            where: { id: row.id },
            data: {
                received_quantity: newReceivedQuantity,
                is_received: isFullyReceived,
                is_partially_received: !isFullyReceived,
            },
        });

        remaining = toQty(remaining - addedQuantity);
    }
}

async function markPurchaseOrderItemsCompleted(tx, poId, poItemIds) {
    const uniquePoItemIds = [...new Set(poItemIds.map(Number).filter(Boolean))];

    for (const poItemId of uniquePoItemIds) {
        const [aggregate, poItem, grnItem] = await Promise.all([
            tx.txn_grn_items.aggregate({
                where: { po_item_id: poItemId },
                _sum: { confirmed_quantity: true },
            }),
            tx.txn_purchase_order_items.findUnique({
                where: { id: poItemId },
                select: { id: true, qty: true },
            }),
            tx.txn_grn_items.findFirst({
                where: { po_item_id: poItemId },
                select: { po_quantity: true },
                orderBy: { id: "asc" },
            }),
        ]);

        if (!poItem) {
            continue;
        }

        const totalConfirmed = toQty(aggregate._sum.confirmed_quantity);
        const poQuantity = toQty(grnItem?.po_quantity ?? poItem.qty);

        if (hasReachedQuantity(totalConfirmed, poQuantity)) {
            await tx.txn_purchase_order_items.update({
                where: { id: poItemId },
                data: { is_completed: true },
            });
        }
    }

    const poItems = await tx.txn_purchase_order_items.findMany({
        where: { po_id: Number(poId) },
        select: { is_completed: true },
    });

    if (poItems.length === 0 || poItems.some((item) => !item.is_completed)) {
        return;
    }

    const completedStatus = await tx.mst_purchase_order_status.findFirst({
        where: { code_id: PO_STATUS_COMPLETED_CODE_ID },
        select: { id: true },
    });

    if (!completedStatus) {
        const error = new Error("Completed purchase order status not found");
        error.statusCode = 404;
        throw error;
    }

    await tx.txn_purchase_orders.update({
        where: { id: Number(poId) },
        data: {
            status_id: completedStatus.id,
            updated_at: new Date(),
        },
    });
}

async function applyConfirmedQuantityFulfillment(tx, poId, confirmedItems = []) {
    const items = (confirmedItems || []).filter(
        (item) => Number(item.confirmed_quantity) > 0
    );

    if (items.length === 0) {
        return;
    }

    for (const item of items) {
        await addConfirmedQuantityToApprovedMaterials(
            tx,
            item.material_id,
            item.confirmed_quantity,
            poId
        );
    }

    await markPurchaseOrderItemsCompleted(
        tx,
        poId,
        items.map((item) => item.po_item_id)
    );
}

async function generateGrnNumber() {
    const year = new Date().getFullYear();
    const prefix = `GRN-${year}-`;

    const latest = await prisma.txn_grns.findFirst({
        where: {
            grn_number: {
                startsWith: prefix,
            },
        },
        orderBy: {
            grn_number: "desc",
        },
        select: {
            grn_number: true,
        },
    });

    let nextSequence = 1;

    if (latest) {
        const sequencePart = latest.grn_number.slice(prefix.length);
        const currentSequence = Number.parseInt(sequencePart, 10);
        if (!Number.isNaN(currentSequence)) {
            nextSequence = currentSequence + 1;
        }
    }

    return `${prefix}${String(nextSequence).padStart(5, "0")}`;
}

function validatePhaseOnePayload(payload) {
    if (!payload?.po_id) {
        const error = new Error("po_id is required");
        error.statusCode = 400;
        throw error;
    }

    if (!payload?.vendor_id) {
        const error = new Error("vendor_id is required");
        error.statusCode = 400;
        throw error;
    }

    if (!Array.isArray(payload.items) || payload.items.length === 0) {
        const error = new Error("At least one item is required");
        error.statusCode = 400;
        throw error;
    }

    if (
        payload.type !== undefined &&
        payload.type !== null &&
        payload.type !== "" &&
        Number(payload.type) !== GRN_TYPE_GENERATED &&
        Number(payload.type) !== GRN_TYPE_DRAFT
    ) {
        const error = new Error("type must be 1 (generated) or 2 (draft)");
        error.statusCode = 400;
        throw error;
    }

    for (const [index, item] of payload.items.entries()) {
        if (item.material_id === undefined || item.material_id === null || item.material_id === "") {
            const error = new Error(`items[${index}].material_id is required`);
            error.statusCode = 400;
            throw error;
        }

        if (item.gate_qty === undefined || item.gate_qty === null || item.gate_qty === "") {
            const error = new Error(`items[${index}].gate_qty is required`);
            error.statusCode = 400;
            throw error;
        }
    }
}

async function createPhaseOneGrn(payload, userId, userContext = {}) {
    validatePhaseOnePayload(payload);

    const poId = Number(payload.po_id);
    const vendorId = Number(payload.vendor_id);

    const purchaseOrder = await prisma.txn_purchase_orders.findUnique({
        where: { id: poId },
        include: {
            txn_purchase_order_items: true,
        },
    });

    if (!purchaseOrder) {
        const error = new Error("Purchase order not found");
        error.statusCode = 404;
        throw error;
    }

    if (Number(purchaseOrder.vendor_id) !== vendorId) {
        const error = new Error("vendor_id does not match the purchase order vendor");
        error.statusCode = 400;
        throw error;
    }

    const poItemsByMaterialId = new Map(
        purchaseOrder.txn_purchase_order_items.map((item) => [item.material_id, item])
    );

    const itemCreates = [];
    const confirmedItemEffects = [];
    const ruleItems = [];

    for (const [index, item] of payload.items.entries()) {
        const materialId = Number(item.material_id);
        const poItem = poItemsByMaterialId.get(materialId);

        if (!poItem) {
            const error = new Error(
                `items[${index}].material_id ${materialId} not found on purchase order`
            );
            error.statusCode = 400;
            throw error;
        }

        const gateQty = Number(item.gate_qty);
        const poQuantity = Number(item.quantity ?? poItem.qty);
        const previousQuantity = Number(item.previous_quantity ?? 0);
        const balanceQuantity = Number(
            item.balance_quantity ?? poQuantity - previousQuantity
        );

        if (gateQty < 0) {
            const error = new Error(`items[${index}].gate_qty cannot be negative`);
            error.statusCode = 400;
            throw error;
        }

        if (gateQty > balanceQuantity) {
            const error = new Error(
                `items[${index}].gate_qty exceeds balance quantity`
            );
            error.statusCode = 400;
            throw error;
        }

        itemCreates.push({
            po_item_id: poItem.id,
            po_quantity: poQuantity,
            previously_received_quantity: previousQuantity,
            gate_received_quantity: gateQty,
            confirmed_quantity: 0,
            accepted_quantity: gateQty,
            rejected_quantity: 0,
            unit: poItem.uom ?? null,
        });

        confirmedItemEffects.push({
            po_item_id: poItem.id,
            material_id: materialId,
        });

        ruleItems.push({
            quantity: gateQty,
            unit_price: Number(poItem.unit_price ?? 0),
        });
    }

    const approvalRequirements = await evaluateApprovalRequirements({
        module: APPROVAL_MODULE_GRN,
        roleId: userContext.roleId,
        departmentId: userContext.departmentId,
        items: ruleItems,
    });
    const isPhaseTwoRequired = Boolean(approvalRequirements.l2ApprovalRequired);
    const isGrnRuleEnabled = Boolean(approvalRequirements.hasEnabledRules);

    const grnNumber = await generateGrnNumber();
    const grnType =
        payload.type !== undefined && payload.type !== null && payload.type !== ""
            ? Number(payload.type)
            : GRN_TYPE_GENERATED;
    const shouldAutoComplete =
        grnType !== GRN_TYPE_DRAFT && !isGrnRuleEnabled;

    if (shouldAutoComplete) {
        for (const item of itemCreates) {
            item.confirmed_quantity = item.gate_received_quantity;
        }
    }

    let statusCodeId;
    let statusNotFoundMessage;

    if (grnType === GRN_TYPE_DRAFT) {
        statusCodeId = GRN_STATUS_DRAFT_CODE_ID;
        statusNotFoundMessage = "Draft GRN status not found";
    } else if (shouldAutoComplete) {
        statusCodeId = GRN_STATUS_COMPLETED_CODE_ID;
        statusNotFoundMessage = "Completed GRN status not found";
    } else {
        statusCodeId = GRN_STATUS_PHASE_ONE_CODE_ID;
        statusNotFoundMessage = "Phase one GRN status not found";
    }

    const statusId = await getGrnStatusIdByCodeId(statusCodeId, statusNotFoundMessage);

    const created = await prisma.$transaction(async (tx) => {
        const createdGrn = await tx.txn_grns.create({
            data: {
                grn_number: grnNumber,
                po_id: BigInt(poId),
                vendor_id: BigInt(vendorId),
                gate_entry_date: payload.gate_entry_date
                    ? new Date(payload.gate_entry_date)
                    : new Date(),
                vehicle_no: payload.vehicle_no || null,
                driver_name: payload.driver_name || null,
                remarks: payload.remarks || null,
                type: grnType,
                status_id: statusId,
                is_phase_two_required: isPhaseTwoRequired,
                gate_received_by: userId ? BigInt(userId) : null,
                invoice_no: payload.invoice_no || null,
                invoice_date: payload.invoice_date ? new Date(payload.invoice_date) : null,
                invoice_amount: payload.invoice_amount ? Number(payload.invoice_amount) : null,
                created_by: userId ? BigInt(userId) : null,
                updated_by: userId ? BigInt(userId) : null,
                txn_grn_items: {
                    create: itemCreates,
                },
            },
            include: grnInclude,
        });

        if (shouldAutoComplete) {
            await applyConfirmedQuantityFulfillment(
                tx,
                poId,
                confirmedItemEffects.map((item, index) => ({
                    ...item,
                    confirmed_quantity: Number(itemCreates[index].confirmed_quantity),
                }))
            );
        }

        return createdGrn;
    });

    return formatGrn(created);
}

async function getGrns() {
    const grns = await prisma.txn_grns.findMany({
        include: grnInclude,
        orderBy: { created_at: "desc" },
    });

    return grns.map(formatGrn);
}

async function getPhaseOneGrns() {
    const phaseOneInclude = {
        txn_grn_items: grnInclude.txn_grn_items,
        mst_grns_status: grnInclude.mst_grns_status,
    };

    const grns = await prisma.txn_grns.findMany({
        where: {
            mst_grns_status: {
                code_id: {
                    in: [GRN_STATUS_PHASE_ONE_CODE_ID, GRN_STATUS_DRAFT_CODE_ID, GRN_STATUS_COMPLETED_CODE_ID],
                },
            },
        },
        include: phaseOneInclude,
        orderBy: { created_at: "desc" },
    });

    const { vendorById, poById } = await getVendorAndPoMaps(grns);
    return grns.map((grn) => formatPhaseOneGrn(grn, vendorById, poById));
}

async function getPhaseTwoGrns() {
    const grns = await prisma.txn_grns.findMany({
        where: {
            status_id: {
                in: [GRN_STATUS_PHASE_ONE_CODE_ID, GRN_STATUS_COMPLETED_CODE_ID],
            },
            is_phase_two_required: true,
        },
        include: {
            txn_grn_items: grnInclude.txn_grn_items,
            txn_grn_attachments: grnInclude.txn_grn_attachments,
            mst_grns_status: grnInclude.mst_grns_status,
        },
        orderBy: { created_at: "desc" },
    });

    const { vendorById, poById } = await getVendorAndPoMaps(grns);
    return grns.map((grn) => formatPhaseTwoGrn(grn, vendorById, poById));
}

function parseItemsPayload(items) {
    if (items === undefined || items === null || items === "") {
        return [];
    }

    if (typeof items === "string") {
        try {
            return JSON.parse(items);
        } catch (_error) {
            const error = new Error("items must be a valid JSON array");
            error.statusCode = 400;
            throw error;
        }
    }

    return items;
}

function sanitizeFolderName(value) {
    return String(value || "unknown")
        .trim()
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
        .replace(/\s+/g, "_")
        .slice(0, 100) || "unknown";
}

function formatFolderDate(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) {
        const error = new Error("invoice_date is invalid");
        error.statusCode = 400;
        throw error;
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function ensureGrnUploadDir(poNo, invoiceDate) {
    const poFolder = sanitizeFolderName(poNo);
    const dateFolder = formatFolderDate(invoiceDate);
    const targetDir = path.join(GRN_UPLOAD_ROOT, poFolder, dateFolder);
    fs.mkdirSync(targetDir, { recursive: true });
    return { targetDir, poFolder, dateFolder };
}

function saveGrnAttachmentFile(file, poNo, invoiceDate) {
    const { targetDir, poFolder, dateFolder } = ensureGrnUploadDir(poNo, invoiceDate);
    const ext = path.extname(file.originalname || "") || "";
    const baseName = path
        .basename(file.originalname || "attachment", ext)
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
        .slice(0, 100);
    const fileName = `${Date.now()}-${baseName}${ext}`;
    const absolutePath = path.join(targetDir, fileName);

    fs.writeFileSync(absolutePath, file.buffer);

    return {
        fileName: file.originalname || fileName,
        storedFileName: fileName,
        relativePath: path.join("uploads", "grn", poFolder, dateFolder, fileName).replace(/\\/g, "/"),
        fileSize: file.size ?? file.buffer?.length ?? null,
        mimeType: file.mimetype || null,
    };
}

function validatePhaseTwoConfirmPayload(payload) {
    if (!payload?.invoice_no) {
        const error = new Error("invoice_no is required");
        error.statusCode = 400;
        throw error;
    }

    if (!payload?.invoice_date) {
        const error = new Error("invoice_date is required");
        error.statusCode = 400;
        throw error;
    }

    if (payload.invoice_amount === undefined || payload.invoice_amount === null || payload.invoice_amount === "") {
        const error = new Error("invoice_amount is required");
        error.statusCode = 400;
        throw error;
    }

    const items = parseItemsPayload(payload.items);
    if (!Array.isArray(items) || items.length === 0) {
        const error = new Error("At least one item is required");
        error.statusCode = 400;
        throw error;
    }

    for (const [index, item] of items.entries()) {
        if (item.id === undefined || item.id === null || item.id === "") {
            const error = new Error(`items[${index}].id is required`);
            error.statusCode = 400;
            throw error;
        }

        if (
            item.confirmed_quantity === undefined ||
            item.confirmed_quantity === null ||
            item.confirmed_quantity === ""
        ) {
            const error = new Error(`items[${index}].confirmed_quantity is required`);
            error.statusCode = 400;
            throw error;
        }

        if (Number(item.confirmed_quantity) < 0) {
            const error = new Error(`items[${index}].confirmed_quantity cannot be negative`);
            error.statusCode = 400;
            throw error;
        }
    }

    return items;
}

async function confirmPhaseTwoGrn(id, payload, file, userId) {
    const items = validatePhaseTwoConfirmPayload(payload);

    if (!file) {
        const error = new Error("file is required");
        error.statusCode = 400;
        throw error;
    }

    const grnId = BigInt(id);
    const existing = await prisma.txn_grns.findUnique({
        where: { id: grnId },
        include: {
            txn_grn_items: {
                include: {
                    txn_purchase_order_items: {
                        select: { id: true, material_id: true },
                    },
                },
            },
            txn_grn_attachments: true,
            mst_grns_status: {
                select: { id: true, code_id: true },
            },
        },
    });

    if (!existing) {
        const error = new Error("GRN not found");
        error.statusCode = 404;
        throw error;
    }

    if (Number(existing.mst_grns_status?.code_id) !== GRN_STATUS_PHASE_ONE_CODE_ID) {
        const error = new Error("Only phase-one GRNs can be confirmed in phase two");
        error.statusCode = 400;
        throw error;
    }

    if (!existing.is_phase_two_required) {
        const error = new Error("Phase two is not required for this GRN");
        error.statusCode = 400;
        throw error;
    }

    const existingItemIds = new Set(existing.txn_grn_items.map((item) => Number(item.id)));
    for (const [index, item] of items.entries()) {
        if (!existingItemIds.has(Number(item.id))) {
            const error = new Error(`items[${index}].id does not belong to this GRN`);
            error.statusCode = 400;
            throw error;
        }
    }

    const purchaseOrder = await prisma.txn_purchase_orders.findUnique({
        where: { id: Number(existing.po_id) },
        select: { po_no: true },
    });

    if (!purchaseOrder) {
        const error = new Error("Purchase order not found for GRN");
        error.statusCode = 404;
        throw error;
    }

    const completedStatusId = await getGrnStatusIdByCodeId(
        GRN_STATUS_COMPLETED_CODE_ID,
        "Completed GRN status not found"
    );

    const savedFile = saveGrnAttachmentFile(
        file,
        purchaseOrder.po_no,
        payload.invoice_date
    );

    const documentType = payload.document_type || "INVOICE";
    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
        for (const item of items) {
            await tx.txn_grn_items.update({
                where: { id: BigInt(item.id) },
                data: {
                    confirmed_quantity: Number(item.confirmed_quantity),
                    updated_at: now,
                },
            });
        }

        await tx.txn_grn_attachments.create({
            data: {
                grn_id: grnId,
                document_type: String(documentType).slice(0, 50),
                file_name: savedFile.fileName.slice(0, 255),
                file_path: savedFile.relativePath,
                file_size:
                    savedFile.fileSize !== null && savedFile.fileSize !== undefined
                        ? BigInt(savedFile.fileSize)
                        : null,
                mime_type: savedFile.mimeType
                    ? String(savedFile.mimeType).slice(0, 100)
                    : null,
                uploaded_by: userId ? BigInt(userId) : null,
                uploaded_at: now,
            },
        });

        const existingById = new Map(
            existing.txn_grn_items.map((item) => [Number(item.id), item])
        );

        await applyConfirmedQuantityFulfillment(
            tx,
            Number(existing.po_id),
            items.map((item) => {
                const existingItem = existingById.get(Number(item.id));
                return {
                    po_item_id: Number(existingItem.po_item_id),
                    material_id: Number(existingItem.txn_purchase_order_items?.material_id),
                    confirmed_quantity: Number(item.confirmed_quantity),
                };
            })
        );

        return tx.txn_grns.update({
            where: { id: grnId },
            data: {
                invoice_no: String(payload.invoice_no),
                invoice_date: new Date(payload.invoice_date),
                invoice_amount: Number(payload.invoice_amount),
                status_id: completedStatusId,
                invoice_confirmed_by: userId ? BigInt(userId) : null,
                invoice_confirmed_at: now,
                updated_by: userId ? BigInt(userId) : null,
                updated_at: now,
            },
            include: grnInclude,
        });
    });

    return formatGrn(updated);
}

async function deleteGrn(id) {
    const grnId = BigInt(id);

    const grn = await prisma.txn_grns.findUnique({
        where: { id: grnId },
        include: grnInclude,
    });

    if (!grn) {
        const error = new Error("GRN not found");
        error.statusCode = 404;
        throw error;
    }

    await prisma.$transaction(async (tx) => {
        await tx.txn_grn_attachments.deleteMany({
            where: { grn_id: grnId },
        });

        await tx.txn_grn_items.deleteMany({
            where: { grn_id: grnId },
        });

        await tx.txn_grns.delete({
            where: { id: grnId },
        });
    });

    return formatGrn(grn);
}

module.exports = {
    getGrns,
    getPhaseOneGrns,
    getPhaseTwoGrns,
    createPhaseOneGrn,
    confirmPhaseTwoGrn,
    deleteGrn,
};
