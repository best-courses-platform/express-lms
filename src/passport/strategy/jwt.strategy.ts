import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { userService } from 'users/user.service';
import { config } from '../../config';

export const jwtStrategy = new JwtStrategy(
  {
    // Токен из query-параметра намеренно не читаем: он оседает в логах сервера/прокси,
    // истории браузера и заголовке Referer при переходе по ссылке. В проекте нет ни одного
    // легитимного кейса (например, video-тега без кастомных заголовков), который бы это требовал.
    jwtFromRequest: ExtractJwt.fromExtractors([
      ExtractJwt.fromAuthHeaderAsBearerToken(),
      req => req.cookies?.access_token || null,
    ]),
    secretOrKey: config.jwtSecret,
    algorithms: ['HS256'],
    ignoreExpiration: false,
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
