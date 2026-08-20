const MASTER_GROUPS = [
    { key: "materials", label: "Materials", icon: "pi pi-box" },
    { key: "vendors", label: "Vendors", icon: "pi pi-briefcase" },
];

const GROUP_TABLES = {
    materials: [
        { key: "mst_materials", label: "Materials", icon: "pi pi-list" },
        { key: "mst_material_categories", label: "Categories", icon: "pi pi-tags" },
        { key: "mst_tax_codes", label: "Tax Codes", icon: "pi pi-percentage" },
        { key: "mst_uoms", label: "Units of Measure", icon: "pi pi-calculator" },
        { key: "mst_currencies", label: "Currencies", icon: "pi pi-dollar" },
        { key: "mst_currency_rates", label: "Currency Rates", icon: "pi pi-sync" },
        { key: "mst_inventory_control_thresholds", label: "Inventory Thresholds", icon: "pi pi-chart-line" },
    ],
    // vendors: [{ key: "mst_vendors", label: "Vendors", icon: "pi pi-list" }, { key: "test_abc", label: "Abc", icon: "pi pi-list" }],
    vendors: [{ key: "mst_vendors", label: "Vendors", icon: "pi pi-list" }],

};

const MASTER_CONFIGS = {
    mst_materials: {
        title: "Materials",
        dataKey: "id",
        idAutoIncrement: true,
        relations: {
            category_id: {
                include: "mst_material_categories",
                labelKey: "category_label",
                labelFn: (row) => row.name,
            },
            uom_id: {
                include: "mst_uoms",
                labelKey: "uom_label",
                labelFn: (row) => row.name,
            },
        },
        columns: [
            { field: "code", header: "Code" },
            { field: "description", header: "Description" },
            { field: "category_label", header: "Category", type: "dropdown", displayField: "category_label" },
            { field: "uom_label", header: "UOM", type: "dropdown", displayField: "uom_label" }
        ],
        formFields: [
            { field: "description", label: "Description", type: "textarea", required: true, placeholder: "Enter description" },
            {
                field: "category_id",
                label: "Category",
                type: "dropdown",
                required: true,
                optionsSource: "mst_material_categories",
                displayField: "category_label",
            },
            {
                field: "uom_id",
                label: "UOM",
                type: "dropdown",
                required: true,
                optionsSource: "mst_uoms",
                displayField: "uom_label",
            }
        ],
        optionsConfig: {
            mst_material_categories: { labelFn: (row) => row.name },
            mst_uoms: { labelFn: (row) => row.name }
        },
        hasUpdatedAt: false,
    },

    mst_material_categories: {
        title: "Material Categories",
        dataKey: "id",
        idAutoIncrement: true,
        columns: [
            { field: "name", header: "Name" },
            { field: "code", header: "Code" },
        ],
        formFields: [
            { field: "name", label: "Name", type: "text", required: true, placeholder: "Enter category name" },
            { field: "code", label: "Code", type: "text", required: true, placeholder: "Enter category code" },
        ],
        optionsConfig: {},
    },

    mst_tax_codes: {
        title: "Tax Codes",
        dataKey: "id",
        idAutoIncrement: true,
        columns: [
            { field: "hsn_codes", header: "HSN Code" },
            { field: "gst_rate", header: "GST Rate (%)", type: "number" },
        ],
        formFields: [
            { field: "hsn_codes", label: "HSN Code", type: "text", required: true, placeholder: "Enter HSN code" },
            { field: "gst_rate", label: "GST Rate (%)", type: "number", required: true, placeholder: "18.00" },
        ],
        optionsConfig: {},
    },

    mst_uoms: {
        title: "Units of Measure",
        dataKey: "id",
        idAutoIncrement: true,
        columns: [
            { field: "code", header: "Code" },
            { field: "name", header: "Name" },
        ],
        formFields: [
            { field: "code", label: "Code", type: "text", required: true, placeholder: "Enter UOM code" },
            { field: "name", label: "Name", type: "text", required: true, placeholder: "Enter UOM name" },
        ],
        optionsConfig: {},
    },

    mst_currencies: {
        title: "Currencies",
        dataKey: "id",
        idAutoIncrement: true,
        columns: [
            { field: "currency_code", header: "Code" },
            { field: "currency_name", header: "Name" },
            { field: "currency_symbol", header: "Symbol" },
            { field: "decimal_places", header: "Decimal Places", type: "number" },
            { field: "is_base_currency", header: "Base Currency", type: "boolean" },
        ],
        formFields: [
            { field: "currency_code", label: "Currency Code", type: "text", required: true, placeholder: "INR" },
            { field: "currency_name", label: "Currency Name", type: "text", required: true, placeholder: "Indian Rupee" },
            { field: "currency_symbol", label: "Symbol", type: "text", required: true, placeholder: "₹" },
            { field: "decimal_places", label: "Decimal Places", type: "number", placeholder: "2" },
            { field: "is_base_currency", label: "Base Currency", type: "boolean" },
        ],
        optionsConfig: {},
    },

    mst_inventory_control_thresholds: {
        title: "Inventory Thresholds",
        dataKey: "id",
        idAutoIncrement: true,
        relations: {
            material_code_id: {
                include: "mst_materials",
                labelKey: "material_label",
                labelFn: (row) => row.code,
            },
        },
        columns: [
            { field: "material_label", header: "Material", type: "dropdown", displayField: "material_label" },
            { field: "minimum_level", header: "Minimum Level", type: "number" },
            { field: "maximum_level", header: "Maximum Level", type: "number" },
            { field: "threshold", header: "Threshold", type: "number" },
        ],
        formFields: [
            {
                field: "material_code_id",
                label: "Material",
                type: "dropdown",
                required: true,
                optionsSource: "mst_materials",
                displayField: "material_label",
            },
            { field: "minimum_level", label: "Minimum Level", type: "number", placeholder: "0.00" },
            { field: "maximum_level", label: "Maximum Level", type: "number", placeholder: "0.00" },
            { field: "threshold", label: "Threshold", type: "number", placeholder: "0.00" },
        ],
        optionsConfig: {
            mst_materials: { labelFn: (row) => row.code },
        },
    },

    mst_currency_rates: {
        title: "Currency Rates",
        dataKey: "id",
        idAutoIncrement: true,
        relations: {
            from_currency_id: {
                include: "mst_currencies_mst_currency_rates_from_currency_idTomst_currencies",
                labelKey: "from_currency_label",
                labelFn: (row) => row.currency_name,
            },
            to_currency_id: {
                include: "mst_currencies_mst_currency_rates_to_currency_idTomst_currencies",
                labelKey: "to_currency_label",
                labelFn: (row) => row.currency_name,
            },
        },
        columns: [
            { field: "from_currency_label", header: "From Currency", type: "dropdown", displayField: "from_currency_label" },
            { field: "to_currency_label", header: "To Currency", type: "dropdown", displayField: "to_currency_label" },
            { field: "exchange_rate", header: "Exchange Rate", type: "number" },
        ],
        formFields: [
            {
                field: "from_currency_id",
                label: "From Currency",
                type: "dropdown",
                required: true,
                optionsSource: "mst_currencies",
                displayField: "from_currency_label",
            },
            {
                field: "to_currency_id",
                label: "To Currency",
                type: "dropdown",
                required: true,
                optionsSource: "mst_currencies",
                displayField: "to_currency_label",
            },
            { field: "exchange_rate", label: "Exchange Rate", type: "number", required: true, placeholder: "1.000000" },
        ],
        optionsConfig: {
            mst_currencies: { labelFn: (row) => row.currency_name },
        },
    },

    test_abc: {
        title: "Abc",
        dataKey: "id",
        idAutoIncrement: true,
        columns: [
            { field: "name", header: "Name" },
        ],
        formFields: [
            { field: "name", label: "Name", type: "text", required: true, placeholder: "Enter name" },
           
        ],
        optionsConfig: {},
    },
    mst_vendors: {
        title: "Vendors",
        dataKey: "id",
        idAutoIncrement: true,
        columns: [
            { field: "company_name", header: "Company Name" },
            { field: "company_address", header: "Address" },
            { field: "contact_person", header: "Contact Person" },
            { field: "contact_phone", header: "Phone" },
            { field: "email", header: "Email" },
            { field: "pan", header: "PAN" },
            { field: "ifsc_code", header: "IFSC Code" },
        ],
        formFields: [
            { field: "company_name", label: "Company Name", type: "text", required: true, placeholder: "Enter company name" },
            { field: "company_address", label: "Company Address", type: "textarea", required: true, placeholder: "Enter address" },
            { field: "contact_person", label: "Contact Person", type: "text", required: true, placeholder: "Enter contact person" },
            { field: "contact_phone", label: "Contact Phone", type: "text", required: true, placeholder: "Enter phone number" },
            { field: "email", label: "Email", type: "text", required: true, placeholder: "Enter email" },
            { field: "pan", label: "PAN", type: "text", required: true, placeholder: "Enter PAN" },
            { field: "tan", label: "TAN", type: "text", placeholder: "Enter TAN" },
            { field: "bank_name", label: "Bank Name", type: "text", required: true, placeholder: "Enter bank name" },
            { field: "bank_account_no", label: "Bank Account No", type: "text", required: true, placeholder: "Enter account number" },
            { field: "bank_branch_address", label: "Bank Branch Address", type: "textarea", placeholder: "Enter branch address" },
            { field: "ifsc_code", label: "IFSC Code", type: "text", required: true, placeholder: "Enter IFSC code" },
        ],
        optionsConfig: {},
        hasUpdatedAt: true,
    },
};

function getGroups() {
    return MASTER_GROUPS;
}

function getGroupTables(groupKey) {
    return GROUP_TABLES[groupKey] || null;
}

function resolveMaster(groupKey, masterKey) {
    const tables = GROUP_TABLES[groupKey];
    if (!tables) {
        const error = new Error("Group not found");
        error.statusCode = 404;
        throw error;
    }

    const table = tables.find((item) => item.key === masterKey);
    if (!table) {
        const error = new Error("Master table not found in group");
        error.statusCode = 404;
        throw error;
    }

    const config = MASTER_CONFIGS[masterKey];
    if (!config) {
        const error = new Error("Master configuration not found");
        error.statusCode = 404;
        throw error;
    }

    return { table, config };
}

function getOptionsConfig(sourceKey) {
    for (const config of Object.values(MASTER_CONFIGS)) {
        if (config.optionsConfig?.[sourceKey]) {
            return config.optionsConfig[sourceKey];
        }
    }

    const sourceConfig = MASTER_CONFIGS[sourceKey];
    if (sourceConfig) {
        return {
            labelFn: (row) =>
                row.name ||
                row.code ||
                row.currency_name ||
                row.company_name ||
                row.hsn_codes ||
                String(row.id),
        };
    }

    return { labelFn: (row) => String(row.id) };
}

function getImportExportColumns(config) {
    const columns = [];

    if (config.idAutoIncrement !== false) {
        columns.push({ field: "id", label: "ID", type: "number", optional: true });
    }

    for (const formField of config.formFields || []) {
        if (formField.field === "id") continue;

        columns.push({
            field: formField.field,
            label: formField.label,
            type: formField.type,
            required: formField.required,
            optionsSource: formField.optionsSource,
            displayField: formField.displayField,
        });
    }

    return columns;
}

module.exports = {
    getGroups,
    getGroupTables,
    resolveMaster,
    getOptionsConfig,
    getImportExportColumns,
    MASTER_CONFIGS,
};
