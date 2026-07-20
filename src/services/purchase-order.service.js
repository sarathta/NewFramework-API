const { prisma } = require("../config/db");

const STATUS_L1_L2_APPROVED_CODE_ID = 7;
const STATUS_PO_GENERATED_CODE_ID = 4;
const PO_TYPE_DRAFT = 1;
const PO_TYPE_ORDER = 2;

const approvedIndentInclude = {
    mst_area: { select: { id: true, name: true } },
    mst_departments: { select: { id: true, name: true } },
    mst_indent_statuses: {
        select: { id: true, code: true, codeId: true, description: true },
    },
    txn_indent_items: true,
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
    txn_indents: {
        select: { id: true, indent_no: true, department_id: true, area_id: true },
    },
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

async function getStatusIdByCodeId(codeId, notFoundMessage) {
    const status = await prisma.mst_indent_statuses.findFirst({
        where: { codeId },
        select: { id: true },
    });

    if (!status) {
        const error = new Error(notFoundMessage);
        error.statusCode = 404;
        throw error;
    }

    return status.id;
}

async function getPoGeneratedStatusId() {
    return getStatusIdByCodeId(
        STATUS_PO_GENERATED_CODE_ID,
        "PO generated status not found"
    );
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

function validateCreatePayload(payload) {
    const requiredFields = [
        "indent_id",
        "vendor_id",
        "sub_total",
        "total_amount",
    ];

    for (const field of requiredFields) {
        if (payload[field] === undefined || payload[field] === null || payload[field] === "") {
            const error = new Error(`${field} is required`);
            error.statusCode = 400;
            throw error;
        }
    }

    validatePoItems(payload.items);
}

async function validateIndent(indentId) {
    const indent = await prisma.txn_indents.findUnique({
        where: { id: Number(indentId) },
        select: { id: true },
    });

    if (!indent) {
        const error = new Error("Indent not found");
        error.statusCode = 404;
        throw error;
    }
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

function formatPurchaseOrder(po) {
    const {
        mst_vendors,
        txn_indents,
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
        gst_rate: gst_amount,
        issued_date,
        po_date: issued_date,
        vendor: mst_vendors,
        indent: txn_indents,
        currency: mst_currencies,
        items: txn_purchase_order_items.map(({ qty, ...item }) => ({
            ...item,
            qty,
            quantity: qty,
        })),
    };
}

async function createPurchaseOrder(payload, type) {
    validateCreatePayload(payload);

    const {
        indent_id,
        vendor_id,
        currency_id,
        exchange_rate,
        sub_total,
        gst_rate,
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
        po_date,
        items,
    } = payload;

    await validateIndent(indent_id);
    await validateVendor(vendor_id);

    if (currency_id !== undefined && currency_id !== null && currency_id !== "") {
        await validateCurrency(currency_id);
    }

    await validateMaterials(items);

    const numericExchangeRate = parseOptionalDecimal(exchange_rate);
    const numericTotalAmount = Number(total_amount);
    const baseCurrencyAmount =
        numericExchangeRate !== null
            ? numericTotalAmount * Number(numericExchangeRate)
            : null;

    const prefix = type === PO_TYPE_DRAFT ? "DRF" : "PO";
    const poNo = await generatePoNo(prefix);
    const poGeneratedStatusId =
        type === PO_TYPE_ORDER ? await getPoGeneratedStatusId() : null;

    const purchaseOrderData = {
        po_no: poNo,
        indent_id: Number(indent_id),
        vendor_id: Number(vendor_id),
        type,
        subtotal: sub_total,
        gst_amount: parseOptionalDecimal(gst_rate ?? gst_amount),
        total_amount: total_amount,
        currency_id:
            currency_id !== undefined && currency_id !== null && currency_id !== ""
                ? Number(currency_id)
                : null,
        exchange_rate: numericExchangeRate,
        base_currency_amount: baseCurrencyAmount,
        freight: parseOptionalDecimal(freight),
        packing: parseOptionalDecimal(packing),
        other_charges: parseOptionalDecimal(other_charges),
        remarks: remarks ?? null,
        payment_terms: payment_terms ?? null,
        shipping_address: shipping_address ?? null,
        billing_address: billing_address ?? null,
        expected_delivery: parseOptionalDate(expected_delivery),
        issued_date: parseOptionalDate(po_date) ?? new Date(),
        txn_purchase_order_items: {
            create: mapPoItems(items),
        },
    };

    const purchaseOrder =
        type === PO_TYPE_ORDER
            ? await prisma.$transaction(async (tx) => {
                  const createdPo = await tx.txn_purchase_orders.create({
                      data: purchaseOrderData,
                      include: purchaseOrderInclude,
                  });

                  await tx.txn_indents.update({
                      where: { id: Number(indent_id) },
                      data: {
                          status_id: poGeneratedStatusId,
                          updated_at: new Date(),
                      },
                  });

                  return createdPo;
              })
            : await prisma.txn_purchase_orders.create({
                  data: purchaseOrderData,
                  include: purchaseOrderInclude,
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

module.exports = {
    getApprovedIndents,
    createDraft: (payload) => createPurchaseOrder(payload, PO_TYPE_DRAFT),
    createPurchaseOrder: (payload) => createPurchaseOrder(payload, PO_TYPE_ORDER),
    getDrafts: () => getPurchaseOrdersByType(PO_TYPE_DRAFT),
    getPurchaseOrders: () => getPurchaseOrdersByType(PO_TYPE_ORDER),
};
