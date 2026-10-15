import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'

    }
}, {timestamps: true});

// this is bycrypt we are encrypting the password  for your understanding
userSchema.pre('save', async function(){
    const user = this;
    if (!user.isModified('password')) return;
    const SALT = bcrypt.genSaltSync(env.bcryptSaltRounds);
    const encryptedPassword = bcrypt.hashSync(user.password, SALT);
    user.password= encryptedPassword;

});

userSchema.methods.comparePassword = function compare(password){
    return bcrypt.compareSync(password, this.password);
}

userSchema.methods.genJWT = function generate(){
     return jwt.sign({id: this.id, email: this.email}, env.jwtSecret, {
        expiresIn: '1h'
     })
}

const User = mongoose.model("User", userSchema);
export default User;


