const { prisma } = require("../config/db");
const {
    STATUS_L1_L2_APPROVED_CODE_ID,
    PO_TYPE_DRAFT,
    PO_TYPE_ORDER,
    PO_STATUS_L1_APPROVAL_PENDING_CODE_ID,
    PO_STATUS_L2_APPROVAL_PENDING_CODE_ID,
    PO_STATUS_GENERATED_CODE_ID,
    PO_STATUS_REJECTED_CODE_ID,
    PO_STATUS_DRAFT_CODE_ID,
} = require("../config/status.config");
const {
    ROLE_L1_APPROVER,
    ROLE_L2_APPROVER,
    isAdministrator,
    isApprover,
} = require("../config/roles.config");
const { APPROVAL_MODULE_PURCHASE_ORDER } = require("../config/approval-modules.config");
const { evaluateApprovalRequirements } = require("./approval-rule-evaluator.service");

const approvedIndentInclude = {
    mst_area: { select: { id: true, name: true } },
    mst_departments: { select: { id: true, name: true } },
    mst_indent_statuses: {
        select: { id: true, code: true, codeId: true, description: true },
    },
    txn_indent_items: {where: {is_rejected: false}},
    mst_employees_txn_indents_requested_byTomst_employees: {
        select: { id: true, employee_name: true, email: true },
    },
    mst_employees_txn_indents_l1_approved_byTomst_employees: {
        select: { id: true, employee_name: true },
    },
    mst_employees_txn_indents_l2_approved_byTomst_employees: {
        select: { id: true, employee_name: true },
    },
};

const vendorSelect = {
    id: true,
    company_name: true,
    contact_person: true,
    email: true,
    contact_phone: true,
    company_address: true,
};

const purchaseOrderInclude = {
    txn_purchase_order_items: true,
    txn_purchase_order_terms: {
        orderBy: { display_order: "asc" },
    },
    mst_vendors: { select: vendorSelect },
    mst_currencies: {
        select: {
            id: true,
            currency_code: true,
            currency_name: true,
            currency_symbol: true,
        },
    },
    mst_purchase_order_status: {
        select: { id: true, code: true, code_id: true, description: true },
    },
};

async function generatePoNo(prefix = "PO") {
    const year = new Date().getFullYear();
    const poNoPrefix = `${prefix}-${year}-`;

    const latestPo = await prisma.txn_purchase_orders.findFirst({
        where: {
            po_no: {
                startsWith: poNoPrefix,
            },
        },
        orderBy: {
            po_no: "desc",
        },
        select: {
            po_no: true,
        },
    });

    let nextSequence = 1;

    if (latestPo) {
        const sequencePart = latestPo.po_no.slice(poNoPrefix.length);
        const currentSequence = Number.parseInt(sequencePart, 10);

        if (!Number.isNaN(currentSequence)) {
            nextSequence = currentSequence + 1;
        }
    }

    return `${poNoPrefix}${String(nextSequence).padStart(5, "0")}`;
}

function validatePoItems(items) {
    if (!Array.isArray(items) || items.length === 0) {
        const error = new Error("At least one item is required");
        error.statusCode = 400;
        throw error;
    }

    const requiredFields = [
        "material_id",
        "material_code",
        "description",
        "unit_price",
        "uom",
        "gst_rate",
    ];

    for (const [index, item] of items.entries()) {
        const quantity = item.quantity ?? item.qty;
        if (quantity === undefined || quantity === null || quantity === "") {
            const error = new Error(`items[${index}].quantity is required`);
            error.statusCode = 400;
            throw error;
        }

        for (const field of requiredFields) {
            if (item[field] === undefined || item[field] === null || item[field] === "") {
                const error = new Error(`items[${index}].${field} is required`);
                error.statusCode = 400;
                throw error;
            }
        }
    }
}

function getPayloadSubtotal(payload) {
    return payload.subtotal ?? payload.sub_total;
}

function validateCreatePayload(payload) {
    if (payload.vendor_id === undefined || payload.vendor_id === null || payload.vendor_id === "") {
        const error = new Error("vendor_id is required");
        error.statusCode = 400;
        throw error;
    }

    if (
        getPayloadSubtotal(payload) === undefined ||
        getPayloadSubtotal(payload) === null ||
        getPayloadSubtotal(payload) === ""
    ) {
        const error = new Error("subtotal is required");
        error.statusCode = 400;
        throw error;
    }

    if (
        payload.total_amount === undefined ||
        payload.total_amount === null ||
        payload.total_amount === ""
    ) {
        const error = new Error("total_amount is required");
        error.statusCode = 400;
        throw error;
    }

    validatePoItems(payload.items);
}

async function validateVendor(vendorId) {
    const vendor = await prisma.mst_vendors.findUnique({
        where: { id: Number(vendorId) },
        select: { id: true },
    });

    if (!vendor) {
        const error = new Error("Vendor not found");
        error.statusCode = 404;
        throw error;
    }
}

async function validateCurrency(currencyId) {
    const currency = await prisma.mst_currencies.findUnique({
        where: { id: Number(currencyId) },
        select: { id: true },
    });

    if (!currency) {
        const error = new Error("Currency not found");
        error.statusCode = 404;
        throw error;
    }
}

async function validateMaterials(items) {
    const materialIds = [...new Set(items.map((item) => Number(item.material_id)))];

    const materials = await prisma.mst_materials.findMany({
        where: { id: { in: materialIds } },
        select: { id: true },
    });

    if (materials.length !== materialIds.length) {
        const error = new Error("One or more materials not found");
        error.statusCode = 404;
        throw error;
    }
}

async function validateApprovedMaterials(items) {
    const approvedMaterialIds = [
        ...new Set(
            items
                .map((item) => item.approved_material_id)
                .filter((id) => id !== undefined && id !== null && id !== "")
                .map(Number)
        ),
    ];

    if (approvedMaterialIds.length === 0) {
        return;
    }

    const approvedMaterials = await prisma.txn_approved_indent_materials.findMany({
        where: {
            id: { in: approvedMaterialIds },
            is_received: false,
        },
        select: {
            id: true,
            material_id: true,
            quantity: true,
            received_quantity: true,
        },
    });

    if (approvedMaterials.length !== approvedMaterialIds.length) {
        const error = new Error("One or more approved materials not found or already received");
        error.statusCode = 404;
        throw error;
    }

    const approvedById = new Map(approvedMaterials.map((row) => [row.id, row]));

    for (const [index, item] of items.entries()) {
        if (
            item.approved_material_id === undefined ||
            item.approved_material_id === null ||
            item.approved_material_id === ""
        ) {
            continue;
        }

        const approved = approvedById.get(Number(item.approved_material_id));
        if (!approved) {
            const error = new Error(
                `items[${index}].approved_material_id is invalid`
            );
            error.statusCode = 400;
            throw error;
        }

        if (Number(approved.material_id) !== Number(item.material_id)) {
            const error = new Error(
                `items[${index}].material_id does not match approved material`
            );
            error.statusCode = 400;
            throw error;
        }

        // const pendingQuantity =
        //     Number(approved.quantity) - Number(approved.received_quantity);
        // const requestedQuantity = Number(item.quantity ?? item.qty);

        // if (requestedQuantity > pendingQuantity) {
        //     const error = new Error(
        //         `items[${index}].quantity exceeds pending approved quantity`
        //     );
        //     error.statusCode = 400;
        //     throw error;
        // }
    }
}

function mapPoItems(items) {
    return items.map((item) => ({
        material_id: Number(item.material_id),
        material_code: item.material_code,
        description: item.description,
        qty: item.quantity ?? item.qty,
        unit_price: item.unit_price,
        uom: item.uom,
        gst_rate: item.gst_rate,
    }));
}

function normalizeTermIds(termIds) {
    if (termIds === undefined || termIds === null) {
        return undefined;
    }

    if (!Array.isArray(termIds)) {
        const error = new Error("term_ids must be an array");
        error.statusCode = 400;
        throw error;
    }

    return [...new Set(termIds.map((id) => Number(id)).filter((id) => !Number.isNaN(id)))];
}

async function validatePoTerms(termIds) {
    if (!termIds || termIds.length === 0) {
        return [];
    }

    const terms = await prisma.mst_po_terms.findMany({
        where: { id: { in: termIds } },
        orderBy: [{ display_order: "asc" }, { id: "asc" }],
    });

    if (terms.length !== termIds.length) {
        const error = new Error("One or more PO terms not found");
        error.statusCode = 404;
        throw error;
    }

    const termsById = new Map(terms.map((term) => [term.id, term]));
    return termIds.map((id) => termsById.get(id));
}

function mapPoTermsCreate(masterTerms = []) {
    return masterTerms.map((term, index) => ({
        term_id: term.id,
        term_title: term.title,
        term_context: term.content,
        display_order:
            term.display_order !== undefined && term.display_order !== null
                ? Number(term.display_order)
                : index + 1,
    }));
}

async function syncPurchaseOrderTerms(tx, poId, termIds) {
    await tx.txn_purchase_order_terms.deleteMany({
        where: { po_id: Number(poId) },
    });

    if (!termIds || termIds.length === 0) {
        return;
    }

    const masterTerms = await validatePoTerms(termIds);

    await tx.txn_purchase_order_terms.createMany({
        data: mapPoTermsCreate(masterTerms).map((term) => ({
            ...term,
            po_id: Number(poId),
        })),
    });
}

function parseOptionalDate(value) {
    return value ? new Date(value) : null;
}

function parseOptionalDecimal(value) {
    return value === undefined || value === null || value === "" ? null : value;
}

function parseOptionalString(value) {
    if (value === undefined || value === null || value === "") {
        return null;
    }
    return value;
}

function formatPurchaseOrder(po) {
    const {
        mst_vendors,
        mst_currencies,
        txn_purchase_order_items,
        txn_purchase_order_terms,
        mst_purchase_order_status,
        subtotal,
        gst_amount,
        issued_date,
        ...poData
    } = po;

    const terms = (txn_purchase_order_terms ?? []).map((term) => ({
        id: term.id,
        term_id: term.term_id,
        title: term.term_title,
        content: term.term_context,
        display_order: term.display_order,
    }));

    return {
        ...poData,
        subtotal,
        sub_total: subtotal,
        gst_amount,
        issued_date,
        po_date: issued_date,
        vendor: mst_vendors,
        currency: mst_currencies,
        status: mst_purchase_order_status
            ? {
                  id: mst_purchase_order_status.id,
                  code: mst_purchase_order_status.code,
                  code_id: mst_purchase_order_status.code_id,
                  description: mst_purchase_order_status.description,
              }
            : null,
        term_ids: terms.map((term) => term.term_id).filter((id) => id != null),
        terms,
        items: txn_purchase_order_items.map(({ qty, ...item }) => ({
            ...item,
            qty,
            quantity: qty,
        })),
    };
}

function buildPurchaseOrderFields(payload, type) {
    const {
        vendor_id,
        currency_id,
        exchange_rate,
        gst_amount,
        total_amount,
        freight,
        packing,
        other_charges,
        remarks,
        payment_terms,
        shipping_address,
        billing_address,
        expected_delivery,
        issued_date,
        po_date,
    } = payload;

    const subtotal = getPayloadSubtotal(payload);
    const poType = Number(payload.type ?? type);
    const numericExchangeRate = parseOptionalDecimal(exchange_rate);
    const numericTotalAmount = Number(total_amount);
    const baseCurrencyAmount =
        numericExchangeRate !== null
            ? numericTotalAmount * Number(numericExchangeRate)
            : null;

    return {
        poType,
        fields: {
            vendor_id: Number(vendor_id),
            type: poType,
            subtotal,
            gst_amount: parseOptionalDecimal(gst_amount),
            total_amount,
            currency_id:
                currency_id !== undefined && currency_id !== null && currency_id !== ""
                    ? Number(currency_id)
                    : null,
            exchange_rate: numericExchangeRate,
            base_currency_amount: baseCurrencyAmount,
            freight: parseOptionalDecimal(freight),
            packing: parseOptionalDecimal(packing),
            other_charges: parseOptionalDecimal(other_charges),
            remarks: parseOptionalString(remarks),
            payment_terms: parseOptionalString(payment_terms),
            shipping_address: parseOptionalString(shipping_address),
            billing_address: parseOptionalString(billing_address),
            expected_delivery: parseOptionalDate(expected_delivery),
            issued_date: parseOptionalDate(issued_date ?? po_date) ?? new Date(),
        },
    };
}

async function validatePurchaseOrderPayload(payload) {
    validateCreatePayload(payload);
    await validateVendor(payload.vendor_id);

    if (
        payload.currency_id !== undefined &&
        payload.currency_id !== null &&
        payload.currency_id !== ""
    ) {
        await validateCurrency(payload.currency_id);
    }

    await validateMaterials(payload.items);
    await validateApprovedMaterials(payload.items);

    const termIds = normalizeTermIds(payload.term_ids);
    if (termIds !== undefined) {
        await validatePoTerms(termIds);
    }
}

async function getPoStatusIdByCodeId(codeId, notFoundMessage) {
    const status = await prisma.mst_purchase_order_status.findFirst({
        where: { code_id: Number(codeId) },
        select: { id: true },
    });

    if (!status) {
        const error = new Error(notFoundMessage || "Purchase order status not found");
        error.statusCode = 404;
        throw error;
    }

    return status.id;
}

function resolvePoStatusCodeId({
    l1_approval_required,
    l2_approval_required,
    l1_approved,
    l2_approved,
}) {
    const l1Required = Boolean(l1_approval_required);
    const l2Required = Boolean(l2_approval_required);
    const l1Approved = Boolean(l1_approved);
    const l2Approved = Boolean(l2_approved);

    if ((!l1Required || l1Approved) && (!l2Required || l2Approved)) {
        return PO_STATUS_GENERATED_CODE_ID;
    }

    if (l2Required && !l2Approved && (!l1Required || l1Approved)) {
        return PO_STATUS_L2_APPROVAL_PENDING_CODE_ID;
    }

    if (l1Required && !l1Approved) {
        return PO_STATUS_L1_APPROVAL_PENDING_CODE_ID;
    }

    return PO_STATUS_GENERATED_CODE_ID;
}

async function resolvePurchaseOrderApprovalFields(poType, payload, userContext = {}) {
    if (poType !== PO_TYPE_ORDER) {
        return {
            l1_approval_required: false,
            l2_approval_required: false,
            l1_approved: false,
            l2_approved: false,
            status_id: await getPoStatusIdByCodeId(
                PO_STATUS_DRAFT_CODE_ID,
                "Draft purchase order status not found"
            ),
        };
    }

    const approvalRequirements = await evaluateApprovalRequirements({
        module: APPROVAL_MODULE_PURCHASE_ORDER,
        roleId: userContext.roleId,
        departmentId: userContext.departmentId,
        items: payload.items ?? [],
        totalAmount: payload.total_amount ?? getPayloadSubtotal(payload),
    });

    const l1ApprovalRequired = Boolean(approvalRequirements.l1ApprovalRequired);
    const l2ApprovalRequired = Boolean(approvalRequirements.l2ApprovalRequired);
    const l1Approved = !l1ApprovalRequired;
    const l2Approved = !l2ApprovalRequired;

    const approvalFields = {
        l1_approval_required: l1ApprovalRequired,
        l2_approval_required: l2ApprovalRequired,
        l1_approved: l1Approved,
        l2_approved: l2Approved,
    };

    const statusCodeId = resolvePoStatusCodeId(approvalFields);
    approvalFields.status_id = await getPoStatusIdByCodeId(
        statusCodeId,
        "Purchase order status not found"
    );

    return approvalFields;
}

async function createPurchaseOrder(payload, type, userContext = {}) {
    await validatePurchaseOrderPayload(payload);

    const { poType, fields } = buildPurchaseOrderFields(payload, type);
    const approvalFields = await resolvePurchaseOrderApprovalFields(
        poType,
        payload,
        userContext
    );
    const termIds = normalizeTermIds(payload.term_ids);
    const prefix = poType === PO_TYPE_DRAFT ? "DRF" : "PO";
    const poNo = await generatePoNo(prefix);

    const purchaseOrder = await prisma.$transaction(async (tx) => {
        const created = await tx.txn_purchase_orders.create({
            data: {
                ...fields,
                ...approvalFields,
                po_no: poNo,
                txn_purchase_order_items: {
                    create: mapPoItems(payload.items),
                },
            },
        });

        if (termIds !== undefined) {
            await syncPurchaseOrderTerms(tx, created.id, termIds);
        }

        return tx.txn_purchase_orders.findUnique({
            where: { id: created.id },
            include: purchaseOrderInclude,
        });
    });

    return formatPurchaseOrder(purchaseOrder);
}

async function updatePurchaseOrder(id, payload, userContext = {}) {
    const poId = Number(id);

    const existing = await prisma.txn_purchase_orders.findUnique({
        where: { id: poId },
        select: { id: true, type: true, po_no: true },
    });

    if (!existing) {
        const error = new Error("Purchase order not found");
        error.statusCode = 404;
        throw error;
    }

    await validatePurchaseOrderPayload(payload);

    const { poType, fields } = buildPurchaseOrderFields(payload, existing.type);
    const approvalFields = await resolvePurchaseOrderApprovalFields(
        poType,
        payload,
        userContext
    );

    const termIds = normalizeTermIds(payload.term_ids);

    let poNo = existing.po_no;
    if (existing.type === PO_TYPE_DRAFT && poType === PO_TYPE_ORDER) {
        poNo = await generatePoNo("PO");
    }

    const purchaseOrder = await prisma.$transaction(async (tx) => {
        await tx.txn_purchase_order_items.deleteMany({
            where: { po_id: poId },
        });

        const updated = await tx.txn_purchase_orders.update({
            where: { id: poId },
            data: {
                ...fields,
                ...approvalFields,
                po_no: poNo,
                updated_at: new Date(),
                txn_purchase_order_items: {
                    create: mapPoItems(payload.items),
                },
            },
        });

        if (termIds !== undefined) {
            await syncPurchaseOrderTerms(tx, updated.id, termIds);
        }

        return tx.txn_purchase_orders.findUnique({
            where: { id: updated.id },
            include: purchaseOrderInclude,
        });
    });

    return formatPurchaseOrder(purchaseOrder);
}

function ensurePoApproverRole(roleId) {
    if (!isApprover(roleId)) {
        const error = new Error("Only approvers can perform this action");
        error.statusCode = 403;
        throw error;
    }
}

function resolvePoApprovalLevelForRole(po, roleId) {
    if (roleId === ROLE_L1_APPROVER) {
        if (po.l1_approved) {
            const error = new Error("Purchase order is already L1 approved");
            error.statusCode = 409;
            throw error;
        }

        if (!po.l1_approval_required) {
            const error = new Error("L1 approval is not required for this purchase order");
            error.statusCode = 409;
            throw error;
        }

        return "l1";
    }

    if (roleId === ROLE_L2_APPROVER) {
        if (!po.l1_approved) {
            const error = new Error("L1 approval is required before L2 approval");
            error.statusCode = 409;
            throw error;
        }

        if (po.l2_approved) {
            const error = new Error("Purchase order is already L2 approved");
            error.statusCode = 409;
            throw error;
        }

        if (!po.l2_approval_required) {
            const error = new Error("L2 approval is not required for this purchase order");
            error.statusCode = 409;
            throw error;
        }

        return "l2";
    }

    const error = new Error("Only approvers can perform this action");
    error.statusCode = 403;
    throw error;
}

async function isPurchaseOrderAdministrator(userId, roleId) {
    if (isAdministrator(roleId)) {
        return true;
    }

    const employee = await prisma.mst_employees.findUnique({
        where: { id: Number(userId) },
        select: {
            mst_user_roles: { select: { role_name: true } },
        },
    });

    return isAdministrator(roleId, employee?.mst_user_roles?.role_name);
}

async function approvePurchaseOrder(id, userId, roleId) {
    const poId = Number(id);
    const isAdmin = await isPurchaseOrderAdministrator(userId, roleId);

    if (!isAdmin) {
        ensurePoApproverRole(roleId);
    }

    const purchaseOrder = await prisma.txn_purchase_orders.findUnique({
        where: { id: poId },
        include: {
            mst_purchase_order_status: { select: { code_id: true } },
        },
    });

    if (!purchaseOrder) {
        const error = new Error("Purchase order not found");
        error.statusCode = 404;
        throw error;
    }

    if (purchaseOrder.type === PO_TYPE_DRAFT) {
        const error = new Error("Cannot approve a draft purchase order");
        error.statusCode = 409;
        throw error;
    }

    if (purchaseOrder.mst_purchase_order_status?.code_id === PO_STATUS_REJECTED_CODE_ID) {
        const error = new Error("Cannot approve a rejected purchase order");
        error.statusCode = 409;
        throw error;
    }

    const now = new Date();
    const updateData = {
        updated_at: now,
    };

    let nextApprovalState = {
        l1_approval_required: purchaseOrder.l1_approval_required,
        l2_approval_required: purchaseOrder.l2_approval_required,
        l1_approved: Boolean(purchaseOrder.l1_approved),
        l2_approved: Boolean(purchaseOrder.l2_approved),
    };

    if (isAdmin) {
        const pendingL1 = purchaseOrder.l1_approval_required && !purchaseOrder.l1_approved;
        const pendingL2 = purchaseOrder.l2_approval_required && !purchaseOrder.l2_approved;

        if (!pendingL1 && !pendingL2) {
            const error = new Error("No approval is pending for this purchase order");
            error.statusCode = 409;
            throw error;
        }

        if (pendingL1) {
            updateData.l1_approved = true;
            updateData.l1_approved_at = now;
            nextApprovalState.l1_approved = true;
        }

        if (pendingL2) {
            updateData.l2_approved = true;
            updateData.l2_approved_at = true;
            nextApprovalState.l2_approved = true;
        }
    } else {
        const approvalLevel = resolvePoApprovalLevelForRole(purchaseOrder, roleId);

        if (approvalLevel === "l1") {
            updateData.l1_approved = true;
            updateData.l1_approved_at = now;
            nextApprovalState.l1_approved = true;
        } else {
            updateData.l2_approved = true;
            updateData.l2_approved_at = true;
            nextApprovalState.l2_approved = true;
        }
    }

    updateData.status_id = await getPoStatusIdByCodeId(
        resolvePoStatusCodeId(nextApprovalState),
        "Purchase order status not found"
    );

    await prisma.txn_purchase_orders.update({
        where: { id: poId },
        data: updateData,
    });

    const updated = await prisma.txn_purchase_orders.findUnique({
        where: { id: poId },
        include: purchaseOrderInclude,
    });

    return formatPurchaseOrder(updated);
}

async function getPurchaseOrdersByType(type) {
    const purchaseOrders = await prisma.txn_purchase_orders.findMany({
        where: { type },
        include: purchaseOrderInclude,
        orderBy: { created_at: "desc" },
    });

    return purchaseOrders.map(formatPurchaseOrder);
}

async function getPurchaseOrders() {
    const purchaseOrders = await prisma.txn_purchase_orders.findMany({
        include: purchaseOrderInclude,
        orderBy: { created_at: "desc" },
    });

    return purchaseOrders.map(formatPurchaseOrder);
}

async function getApprovedPurchaseOrders() {
    const purchaseOrders = await prisma.txn_purchase_orders.findMany({
        where: { status_id: 5 },
        include: {
            ...purchaseOrderInclude,
            txn_purchase_order_items: {
                orderBy: { id: "asc" },
            },
        },
        orderBy: { created_at: "desc" },
    });

    if (purchaseOrders.length === 0) {
        return [];
    }

    const poItemIds = purchaseOrders.flatMap((po) =>
        po.txn_purchase_order_items.map((item) => item.id)
    );

    const previousQuantityByPoItemId = await getPreviousReceivedQuantitiesByPoItemIds(
        poItemIds
    );

    return purchaseOrders.map((po) =>
        formatApprovedPurchaseOrder(po, previousQuantityByPoItemId)
    );
}

function toNumeric(value) {
    if (value === null || value === undefined) {
        return 0;
    }
    if (typeof value === "bigint") {
        return Number(value);
    }
    if (typeof value?.toNumber === "function") {
        return value.toNumber();
    }
    return Number(value) || 0;
}

async function getPreviousReceivedQuantitiesByPoItemIds(poItemIds) {
    const previousQuantityByPoItemId = new Map();

    if (!poItemIds || poItemIds.length === 0) {
        return previousQuantityByPoItemId;
    }

    const grnItems = await prisma.txn_grn_items.findMany({
        where: {
            po_item_id: { in: poItemIds },
        },
        select: {
            po_item_id: true,
            accepted_quantity: true,
        },
    });

    for (const item of grnItems) {
        const poItemId = Number(item.po_item_id);
        const acceptedQuantity = toNumeric(item.accepted_quantity);
        previousQuantityByPoItemId.set(
            poItemId,
            (previousQuantityByPoItemId.get(poItemId) ?? 0) + acceptedQuantity
        );
    }

    return previousQuantityByPoItemId;
}

function formatApprovedPurchaseOrder(po, previousQuantityByPoItemId = new Map()) {
    const {
        mst_vendors,
        mst_currencies,
        txn_purchase_order_items,
        txn_purchase_order_terms,
        mst_purchase_order_status,
        subtotal,
        gst_amount,
        total_amount,
        freight,
        packing,
        other_charges,
        exchange_rate,
        base_currency_amount,
        issued_date,
        expected_delivery,
        created_at,
        updated_at,
        remarks,
        payment_terms,
        shipping_address,
        billing_address,
        vendor_id,
        currency_id,
        status_id,
        type,
        version,
        po_no,
        id,
        l1_approval_required,
        l2_approval_required,
        l1_approved,
        l1_approved_at,
        l2_approved,
        l2_approved_at,
    } = po;

    const terms = (txn_purchase_order_terms ?? []).map((term) => ({
        id: term.id,
        term_id: term.term_id,
        title: term.term_title,
        content: term.term_context,
        display_order: term.display_order,
    }));

    const items = (txn_purchase_order_items ?? []).map((item) => {
        const quantity = toNumeric(item.qty);
        const previousQuantity = previousQuantityByPoItemId.get(item.id) ?? 0;
        const balanceQuantity = quantity - previousQuantity;

        return {
            id: item.id,
            material_id: item.material_id,
            material_code: item.material_code,
            description: item.description,
            uom: item.uom,
            unit_price: toNumeric(item.unit_price),
            gst_rate: toNumeric(item.gst_rate),
            quantity,
            qty: quantity,
            previous_quantity: previousQuantity,
            balance_quantity: balanceQuantity < 0 ? 0 : balanceQuantity,
        };
    });

    return {
        id,
        po_no,
        type,
        version,
        vendor_id,
        currency_id,
        status_id,
        issued_date,
        po_date: issued_date,
        expected_delivery,
        payment_terms,
        billing_address,
        shipping_address,
        remarks,
        freight: toNumeric(freight),
        packing: toNumeric(packing),
        other_charges: toNumeric(other_charges),
        exchange_rate: toNumeric(exchange_rate),
        base_currency_amount: toNumeric(base_currency_amount),
        subtotal: toNumeric(subtotal),
        sub_total: toNumeric(subtotal),
        gst_amount: toNumeric(gst_amount),
        total_amount: toNumeric(total_amount),
        l1_approval_required,
        l2_approval_required,
        l1_approved,
        l1_approved_at,
        l2_approved,
        l2_approved_at,
        created_at,
        updated_at,
        vendor: mst_vendors,
        currency: mst_currencies,
        status: mst_purchase_order_status
            ? {
                  id: mst_purchase_order_status.id,
                  code: mst_purchase_order_status.code,
                  code_id: mst_purchase_order_status.code_id,
                  description: mst_purchase_order_status.description,
              }
            : null,
        terms,
        items,
    };
}

async function deletePurchaseOrder(id) {
    const poId = Number(id);

    const purchaseOrder = await prisma.txn_purchase_orders.findUnique({
        where: { id: poId },
        include: purchaseOrderInclude,
    });

    if (!purchaseOrder) {
        const error = new Error("Purchase order not found");
        error.statusCode = 404;
        throw error;
    }

    await prisma.$transaction(async (tx) => {
        await tx.txn_approved_indent_materials.updateMany({
            where: { po_id: poId },
            data: { po_id: null, po_no: null },
        });

        await tx.txn_purchase_order_terms.deleteMany({
            where: { po_id: poId },
        });

        await tx.txn_purchase_order_items.deleteMany({
            where: { po_id: poId },
        });

        await tx.txn_purchase_orders.delete({
            where: { id: poId },
        });
    });

    return formatPurchaseOrder(purchaseOrder);
}

async function getVendorsByMaterialIds(materialIds) {
    if (materialIds.length === 0) {
        return new Map();
    }

    const vendorMaterials = await prisma.mst_vendor_materials.findMany({
        where: { material_id: { in: materialIds } },
        include: { mst_vendors: { select: vendorSelect } },
    });

    const vendorsByMaterialId = new Map();

    for (const { material_id, mst_vendors } of vendorMaterials) {
        if (!vendorsByMaterialId.has(material_id)) {
            vendorsByMaterialId.set(material_id, new Map());
        }
        const vendorsMap = vendorsByMaterialId.get(material_id);
        if (!vendorsMap.has(mst_vendors.id)) {
            vendorsMap.set(mst_vendors.id, mst_vendors);
        }
    }

    return new Map(
        [...vendorsByMaterialId.entries()].map(([materialId, vendorsMap]) => [
            materialId,
            [...vendorsMap.values()],
        ])
    );
}

function getUniqueVendorsForMaterialIds(materialIds, vendorsByMaterialId) {
    const uniqueVendors = new Map();

    for (const materialId of materialIds) {
        for (const vendor of vendorsByMaterialId.get(materialId) ?? []) {
            if (!uniqueVendors.has(vendor.id)) {
                uniqueVendors.set(vendor.id, vendor);
            }
        }
    }

    return [...uniqueVendors.values()];
}

function formatApprovedIndent(indent, vendorsByMaterialId = new Map()) {
    const {
        mst_indent_statuses,
        mst_area,
        mst_departments,
        txn_indent_items,
        mst_employees_txn_indents_requested_byTomst_employees,
        mst_employees_txn_indents_l1_approved_byTomst_employees,
        mst_employees_txn_indents_l2_approved_byTomst_employees,
        ...indentData
    } = indent;

    const materialIds = txn_indent_items.map((item) => item.material_id);

    return {
        ...indentData,
        area: mst_area,
        department: mst_departments,
        status: mst_indent_statuses
            ? {
                  id: mst_indent_statuses.id,
                  code: mst_indent_statuses.code,
                  code_id: mst_indent_statuses.codeId,
                  description: mst_indent_statuses.description,
              }
            : null,
        items: txn_indent_items,
        vendors: getUniqueVendorsForMaterialIds(materialIds, vendorsByMaterialId),
        requested_by: mst_employees_txn_indents_requested_byTomst_employees,
        l1_approved_by: mst_employees_txn_indents_l1_approved_byTomst_employees,
        l2_approved_by: mst_employees_txn_indents_l2_approved_byTomst_employees,
    };
}

async function getApprovedIndents() {
    const indents = await prisma.txn_indents.findMany({
        where: {
            // l1_approved: true,
            // l2_approved: true,
            is_material_issue: false,
            mst_indent_statuses: {
                codeId: STATUS_L1_L2_APPROVED_CODE_ID,
            },
        },
        include: approvedIndentInclude,
        orderBy: { created_at: "desc" },
    });

    const materialIds = [
        ...new Set(
            indents.flatMap((indent) =>
                indent.txn_indent_items.map((item) => item.material_id)
            )
        ),
    ];

    const vendorsByMaterialId = await getVendorsByMaterialIds(materialIds);

    return indents.map((indent) => formatApprovedIndent(indent, vendorsByMaterialId));
}

const approvedMaterialIndentSelect = {
    id: true,
    indent_no: true,
    department_id: true,
    area_id: true,
    total_value: true,
    created_at: true,
    status_id: true,
    mst_area: { select: { id: true, name: true } },
    mst_departments: { select: { id: true, name: true } },
    mst_indent_statuses: {
        select: { id: true, code: true, codeId: true, description: true },
    },
};

function toNumber(value) {
    return Number(value ?? 0);
}

async function getApprovedMaterials() {
    const rows = await prisma.txn_approved_indent_materials.findMany({
        where: { is_received: false },
        include: {
            mst_materials: {
                select: {
                    id: true,
                    code: true,
                    description: true,
                    category_id: true,
                    uom_id: true,
                    mst_material_categories: {
                        select: { id: true, code: true, name: true },
                    },
                    mst_uoms: {
                        select: { id: true, code: true, name: true },
                    },
                },
            },
            txn_indents: { select: approvedMaterialIndentSelect },
        },
        orderBy: { approved_date: "desc" },
    });

    const grouped = new Map();

    for (const row of rows) {
        const quantity = toNumber(row.quantity);
        const receivedQuantity = toNumber(row.received_quantity);
        const pendingQuantity = quantity - receivedQuantity;

        if (pendingQuantity <= 0) {
            continue;
        }

        const unitPrice = toNumber(row.price);
        const materialId = row.material_id;

        if (!grouped.has(materialId)) {
            const { mst_material_categories, ...material } = row.mst_materials;
            grouped.set(materialId, {
                material: {
                    ...material,
                    category: mst_material_categories,
                },
                pending_quantity: 0,
                unit_price: unitPrice,
                indents: [],
            });
        }

        const group = grouped.get(materialId);
        group.pending_quantity += pendingQuantity;
        group.unit_price = Math.max(group.unit_price, unitPrice);

        const {
            mst_area,
            mst_departments,
            mst_indent_statuses,
            ...indentData
        } = row.txn_indents;

        group.indents.push({
            ...indentData,
            area: mst_area,
            department: mst_departments,
            status: mst_indent_statuses
                ? {
                      id: mst_indent_statuses.id,
                      code: mst_indent_statuses.code,
                      code_id: mst_indent_statuses.codeId,
                      description: mst_indent_statuses.description,
                  }
                : null,
            approved_material_id: row.id,
            quantity,
            received_quantity: receivedQuantity,
            pending_quantity: pendingQuantity,
            unit_price: unitPrice,
            approved_date: row.approved_date,
            is_partially_received: row.is_partially_received,
            po_id: row.po_id,
            po_no: row.po_no,
        });
    }

    const materialIds = [...grouped.keys()];
    const vendorsByMaterialId = await getVendorsByMaterialIds(materialIds);

    return materialIds.map((materialId) => {
        const group = grouped.get(materialId);
        return {
            ...group,
            vendors: vendorsByMaterialId.get(materialId) ?? [],
        };
    });
}

module.exports = {
    getApprovedIndents,
    getApprovedMaterials,
    createDraft: (payload) => createPurchaseOrder(payload, PO_TYPE_DRAFT),
    createPurchaseOrder: (payload, userContext) =>
        createPurchaseOrder(payload, PO_TYPE_ORDER, userContext),
    updatePurchaseOrder,
    approvePurchaseOrder,
    deletePurchaseOrder,
    getDrafts: () => getPurchaseOrdersByType(PO_TYPE_DRAFT),
    getPurchaseOrders,
    getApprovedPurchaseOrders,
};
