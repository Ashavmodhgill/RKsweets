import { SignJWT, jwtVerify } from 'jose';
import { Admin, Customer } from './models.js';
const secret = kind => new TextEncoder().encode(process.env[kind === 'admin' ? 'ADMIN_SESSION_SECRET' : 'CUSTOMER_SESSION_SECRET']);
const cookieName = kind => kind === 'admin' ? 'rk_admin' : 'rk_customer';
export async function setSession(res, kind, id, version=0) {
  const token = await new SignJWT({ sub:String(id), aud:kind, ver:version }).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('8h').sign(secret(kind));
  const cookieOptions={httpOnly:true,secure:process.env.COOKIE_SECURE === 'true',sameSite:process.env.COOKIE_SAME_SITE||'lax',path:'/',maxAge:8*60*60*1000};
  res.cookie(cookieName(kind),token,cookieOptions);
  res.cookie(`${cookieName(kind)}_csrf`, token.slice(-24), {...cookieOptions,httpOnly:false});
}
export const clearSession=(res,kind)=>{res.clearCookie(cookieName(kind),{path:'/'});res.clearCookie(`${cookieName(kind)}_csrf`,{path:'/'});};
export function requireAuth(kind) { return async (req,res,next)=>{try { const token=req.cookies[cookieName(kind)]; if(!token) return res.status(401).json({error:{code:'UNAUTHENTICATED',message:'Please sign in.'}}); const {payload}=await jwtVerify(token,secret(kind),{audience:kind}); const Model=kind==='admin'?Admin:Customer; const user=await Model.findById(payload.sub).select('+sessionVersion'); if(!user||user.status!=='active'||Number(payload.ver)!==Number(user.sessionVersion||0)) return res.status(401).json({error:{code:'UNAUTHENTICATED',message:'Please sign in.'}}); req.user=user; req.sessionKind=kind; next(); } catch {res.status(401).json({error:{code:'UNAUTHENTICATED',message:'Please sign in.'}});} }; }
export function csrf(req,res,next){ if(!['GET','HEAD','OPTIONS'].includes(req.method)){const cookie=req.cookies[`${cookieName(req.sessionKind)}_csrf`];if(!cookie||req.get('x-csrf-token')!==cookie)return res.status(403).json({error:{code:'CSRF',message:'Refresh and try again.'}});} next(); }
