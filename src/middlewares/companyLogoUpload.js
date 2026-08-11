const path = require("path");
const fs = require("fs");
const multer = require("multer");

const companyLogoDir = path.join(process.cwd(), "uploads", "company-logos");

if (!fs.existsSync(companyLogoDir)) {
    fs.mkdirSync(companyLogoDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination(_req, _file, cb) {
        cb(null, companyLogoDir);
    },
    filename(_req, file, cb) {
        const ext = path.extname(file.originalname) || ".png";
        cb(null, `logo-${Date.now()}${ext}`);
    },
});

const companyLogoUpload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter(_req, file, cb) {
        const allowed =
            file.mimetype.startsWith("image/") ||
            /\.(png|jpe?g|gif|webp|svg)$/i.test(file.originalname);

        if (!allowed) {
            return cb(new Error("Only image files are allowed for logo"));
        }

        cb(null, true);
    },
});

module.exports = {
    companyLogoUpload,
    companyLogoDir,
};
