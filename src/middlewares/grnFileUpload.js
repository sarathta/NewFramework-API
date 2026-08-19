const multer = require("multer");

const grnFileUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter(_req, file, cb) {
        const allowed =
            file.mimetype.startsWith("image/") ||
            file.mimetype === "application/pdf" ||
            file.mimetype === "application/msword" ||
            file.mimetype ===
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
            /\.(png|jpe?g|gif|webp|pdf|doc|docx)$/i.test(file.originalname);

        if (!allowed) {
            return cb(new Error("Only image, PDF, or Word files are allowed"));
        }

        cb(null, true);
    },
});

module.exports = {
    grnFileUpload,
};
