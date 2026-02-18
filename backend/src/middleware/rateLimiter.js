import rateLimit from 'express-rate-limit';

export const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10000, // High limit for development (React Strict Mode doubles requests)
    message: 'Too many requests from this IP, please try again in 15 minutes',
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10000, // Very high limit for development (React Strict Mode doubles requests)
    message: 'To many API requests from this IP, please try again in 15 minutes',
    standardHeaders: true,
    legacyHeaders: false,
});
