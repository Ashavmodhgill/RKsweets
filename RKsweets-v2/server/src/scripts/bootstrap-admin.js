import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
dotenv.config({path:fileURLToPath(new URL('../../.env',import.meta.url))});
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { Admin } from '../models.js';
if(!process.env.MONGODB_URI){console.error('Set MONGODB_URI in server/.env before bootstrapping.');process.exit(1);}
const rl=createInterface({input,output});
try{await mongoose.connect(process.env.MONGODB_URI);if(await Admin.exists({})){throw new Error('An admin account already exists. Public admin registration is disabled.');}const businessName=(await rl.question('Business name: ')).trim();const businessPhone=(await rl.question('Business contact number (optional): ')).trim();const password=await rl.question('Set a strong admin password (minimum 12 characters): ');if(!businessName||password.length<12)throw new Error('Business name is required and the password must contain at least 12 characters.');await Admin.create({businessName,businessPhone,passwordHash:await bcrypt.hash(password,12)});console.log('Owner admin created. Keep the password private and store it in your password manager.');}catch(e){console.error(e.message);process.exitCode=1;}finally{rl.close();await mongoose.disconnect();}
