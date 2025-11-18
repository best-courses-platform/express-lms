// middleware/validate.ts
import { z, ZodType, ZodError } from "zod";
import { RequestHandler } from "express";
import { COMMON_MESSAGES } from "../shared/constants/messages";

export const validate = (schema: ZodType<any>, source: keyof z.infer<typeof schema> = 'body'): RequestHandler => {
    return (req, _res, next) => {
        try {
            const result = schema.parse({
                body: req.body,
                params: req.params,
                query: req.query,
                cookies: req.cookies
            });

            // Записываем только нужную часть данных
            req.validatedData = result[source];

            next();
        } catch (error) {
            if (error instanceof ZodError) {
                return next({
                    status: 400,
                    message: COMMON_MESSAGES.ERROR.VALIDATION_ERROR,
                    details: error.flatten()
                });
            }
            next(error);
        }
    };
};