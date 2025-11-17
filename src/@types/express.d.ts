// src/@types/express.d.ts
import { User as AppUser } from "users/user.types";

declare global {
    namespace Express {
        interface User extends AppUser {}

        interface Request {
            user?: AppUser;
            validatedData?: Record<string, unknown>;
        }
    }
}

export {};