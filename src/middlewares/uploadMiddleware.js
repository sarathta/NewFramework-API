const multer = require("multer");

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter(req, file, cb) {
        const allowed =
            file.mimetype === "text/csv" ||
            file.mimetype === "application/vnd.ms-excel" ||
            file.mimetype ===
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
            file.originalname.endsWith(".csv") ||
            file.originalname.endsWith(".xlsx") ||
            file.originalname.endsWith(".xls");

        if (!allowed) {
            return cb(new Error("Only CSV or Excel files are allowed"));
        }

        cb(null, true);
    },
});

module.exports = upload;
