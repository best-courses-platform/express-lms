import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { userService } from 'users/user.service';
import { config } from '../../config/config';

export const jwtStrategy = new JwtStrategy(
    {
        jwtFromRequest: ExtractJwt.fromExtractors([
            ExtractJwt.fromAuthHeaderAsBearerToken(),
            ExtractJwt.fromUrlQueryParameter('token'),
            (req) => req.cookies?.access_token || null
        ]),
        secretOrKey: config.jwtSecret,
        algorithms: ['HS256'],
        ignoreExpiration: false
    },
    async (payload, done) => {
        try {
            if (payload.type !== 'access') {
                return done(null, false);
            }

            const user = await userService.getById(payload.sub);

            if (user) {
                return done(null, user);
            }

            return done(null, false);
        } catch (error) {
            return done(error, false);
        }
    }
);
