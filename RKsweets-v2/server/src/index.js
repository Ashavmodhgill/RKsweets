import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
dotenv.config({path:fileURLToPath(new URL('../.env',import.meta.url))});
import mongoose from 'mongoose';
import { createApp } from './app.js';

const required = ['MONGODB_URI', 'ADMIN_SESSION_SECRET', 'CUSTOMER_SESSION_SECRET'];
const missing = required.filter(key => !process.env[key]);
if (missing.length) { console.error(`Missing required environment values: ${missing.join(', ')}. Copy .env.example to .env and configure them.`); process.exit(1); }
await mongoose.connect(process.env.MONGODB_URI);
const port = Number(process.env.PORT || 3003);
createApp().listen(port, () => console.log(`RK Sweet Shop API listening on http://localhost:${port}`));
