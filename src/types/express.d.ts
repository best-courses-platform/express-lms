import { User as AppUser } from "users/user.types";

declare global {
    namespace Express {
        interface User extends AppUser {}

        interface Request {
            user?: AppUser;
        }
    }
}

export {}; // Важно: сделать файл модулем