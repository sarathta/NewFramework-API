const { prisma } = require("../config/db");

const vendorMaterialSelect = {
    id: true,
    vendor_id: true,
    material_id: true,
};

async function getVendorMaterials() {
    return prisma.mst_vendor_materials.findMany({
        select: vendorMaterialSelect,
        orderBy: { id: "asc" },
    });
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

async function validateMaterials(materialIds) {
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

async function saveVendorMaterials(vendorId, materialIds) {
    const numericVendorId = Number(vendorId);
    const uniqueMaterialIds = [...new Set(materialIds.map((id) => Number(id)))];

    await validateVendor(numericVendorId);

    if (uniqueMaterialIds.length > 0) {
        await validateMaterials(uniqueMaterialIds);
    }

    await prisma.$transaction(async (tx) => {
        const existing = await tx.mst_vendor_materials.findMany({
            where: { vendor_id: numericVendorId },
            select: { material_id: true },
        });

        const existingMaterialIds = existing.map((row) => row.material_id);
        const materialIdsToDelete = existingMaterialIds.filter(
            (id) => !uniqueMaterialIds.includes(id)
        );
        const materialIdsToAdd = uniqueMaterialIds.filter(
            (id) => !existingMaterialIds.includes(id)
        );

        if (materialIdsToDelete.length > 0) {
            await tx.mst_vendor_materials.deleteMany({
                where: {
                    vendor_id: numericVendorId,
                    material_id: { in: materialIdsToDelete },
                },
            });
        }

        if (materialIdsToAdd.length > 0) {
            await tx.mst_vendor_materials.createMany({
                data: materialIdsToAdd.map((materialId) => ({
                    vendor_id: numericVendorId,
                    material_id: materialId,
                })),
            });
        }
    });

    return prisma.mst_vendor_materials.findMany({
        where: { vendor_id: numericVendorId },
        select: vendorMaterialSelect,
        orderBy: { id: "asc" },
    });
}

module.exports = {
    getVendorMaterials,
    saveVendorMaterials,
};
