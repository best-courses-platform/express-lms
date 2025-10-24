import { AuthenticatedUser } from '../utils/typeGuards';

declare global {
    namespace Express {
        interface Request {
            user?: AuthenticatedUser;
        }
    }
}