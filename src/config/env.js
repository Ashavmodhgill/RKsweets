import "dotenv/config";

function required(name) {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

const jwtSecret = required("JWT_SECRET");
if (jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters long.");
}

const bcryptSaltRounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 10);
if (!Number.isInteger(bcryptSaltRounds) || bcryptSaltRounds < 4 || bcryptSaltRounds > 31) {
    throw new Error("BCRYPT_SALT_ROUNDS must be an integer between 4 and 31.");
}

const port = Number(process.env.PORT ?? 3003);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
}

export const env = Object.freeze({
    mongodbUri: required("MONGODB_URI"),
    jwtSecret,
    bcryptSaltRounds,
    port
});
