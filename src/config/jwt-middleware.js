import JWT from 'passport-jwt';
import User from '../models/user.js';
import { env } from './env.js';
// this alll from the documantiona of the passport-jwt package


const JwtStrategy = JWT.Strategy;
const ExtractJwt = JWT.ExtractJwt;

const opts = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: env.jwtSecret
}

export const passportAuth = (passport) => {
    passport.use(new JwtStrategy(opts, async (jwt_payload, done) => {
     const user = await  User.findById(jwt_payload.id);
     if(!user){
        done(null, false);
     }
     else{
        done(null, user);
     }
    }))
}
