import ApiError from "./ApiError.js";

const errorHandler = (err, req, res, next) => {
    if (err instanceof ApiError) {
        return res.status(err.statusCode).json({
            success: err.success,
            message: err.message,
            errors: err.errors
        });
    }

    // fallback for unexpected errors
    console.error(err.stack);
    return res.status(500).json({
        success: false,
        message: "Internal server error",
        errors: []
    });
};

export default errorHandler;
