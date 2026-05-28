import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";
import ApiError from "./ApiError.js";

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

export const uploadToCloudinary = (buffer, folder) => {
    const path = folder
        ? process.env.CLOUDINARY_BASE_FOLDER + "/" + folder
        : process.env.CLOUDINARY_BASE_FOLDER;
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: path
            },
            (error, result) => {
                if (error) return reject(error);
                resolve(result);
            }
        );
        streamifier.createReadStream(buffer).pipe(uploadStream);
    });
};

export const deleteFromCloudinary = async (publicId) => {
    try {
        await cloudinary.uploader.destroy(publicId);
    } catch (error) {
        console.error("Cloudinary Delete Error:", error);
        throw new ApiError(500, "Unable to upload to Cloudinary");
    }
};
