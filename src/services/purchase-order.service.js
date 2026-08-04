const { prisma } = require("../config/db");
const {
    STATUS_L1_L2_APPROVED_CODE_ID,
    PO_TYPE_DRAFT,
    PO_TYPE_ORDER,
} = require("../config/status.config");

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
    mst_vendors: { select: vendorSelect },
    mst_currencies: {
        select: {
            id: true,
            currency_code: true,
            currency_name: true,
            currency_symbol: true,
        },
    },
};

async function generatePoNo(prefix = "PO") {
    const count = await prisma.txn_purchase_orders.count();
    const year = new Date().getFullYear();
    return `${prefix}-${year}-${String(count + 1).padStart(5, "0")}`;
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
        subtotal,
        gst_amount,
        issued_date,
        ...poData
    } = po;

    return {
        ...poData,
        subtotal,
        sub_total: subtotal,
        gst_amount,
        issued_date,
        po_date: issued_date,
        vendor: mst_vendors,
        currency: mst_currencies,
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
}

async function createPurchaseOrder(payload, type) {
    await validatePurchaseOrderPayload(payload);

    const { poType, fields } = buildPurchaseOrderFields(payload, type);
    const prefix = poType === PO_TYPE_DRAFT ? "DRF" : "PO";
    const poNo = await generatePoNo(prefix);

    const purchaseOrder = await prisma.txn_purchase_orders.create({
        data: {
            ...fields,
            po_no: poNo,
            txn_purchase_order_items: {
                create: mapPoItems(payload.items),
            },
        },
        include: purchaseOrderInclude,
    });

    return formatPurchaseOrder(purchaseOrder);
}

async function updatePurchaseOrder(id, payload) {
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

    let poNo = existing.po_no;
    if (existing.type === PO_TYPE_DRAFT && poType === PO_TYPE_ORDER) {
        poNo = await generatePoNo("PO");
    }

    const purchaseOrder = await prisma.$transaction(async (tx) => {
        await tx.txn_purchase_order_items.deleteMany({
            where: { po_id: poId },
        });

        return tx.txn_purchase_orders.update({
            where: { id: poId },
            data: {
                ...fields,
                po_no: poNo,
                updated_at: new Date(),
                txn_purchase_order_items: {
                    create: mapPoItems(payload.items),
                },
            },
            include: purchaseOrderInclude,
        });
    });

    return formatPurchaseOrder(purchaseOrder);
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
                    mst_material_categories: {
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
    createPurchaseOrder: (payload) => createPurchaseOrder(payload, PO_TYPE_ORDER),
    updatePurchaseOrder,
    getDrafts: () => getPurchaseOrdersByType(PO_TYPE_DRAFT),
    getPurchaseOrders,
};
