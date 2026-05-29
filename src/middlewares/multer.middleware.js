import multer from "multer";
import ApiError from "../utils/ApiError.js";

const storage = multer.memoryStorage();

const allowedMimeTypes = ["application/pdf"];

const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith("image/") || allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(
            new ApiError(400, "Only images and PDF files are allowed", [
                {
                    code: "INVALID_FILE_TYPE"
                }
            ]),
            false
        );
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024
    }
});

export default upload;
