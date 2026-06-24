const {prisma} = require("../config/db");
const bcrypt = require("bcryptjs");
const {generateToken} = require("../utils/generateToken");

async function register(name,email,password) {
    const userExists = await prisma.users.findUnique({
        where: {email: email}
    });
    if (userExists) {
        throw new Error("User already exists");
    }
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password,salt);
    // Create user
    const newUser = await prisma.users.create({
        data: {name,email,password:hashedPassword}
    });
    // Return user
    return {id: newUser.id, name: newUser.name, email: newUser.email};
}

async function login(email,password) {
    // Check if user exists
    const user = await prisma.users.findUnique({
        where: {email: email}
    });
    if (!user) {
        throw new Error("Invalid credentials");
    }

    // Check if password is correct
    const isPasswordCorrect = await bcrypt.compare(password,user.password);
    if (!isPasswordCorrect) {
        throw new Error("Invalid credentials");
    }
    // Generate token
    const token = generateToken(user.id);
    // Return user
    return {user:{id: user.id, name: user.name, email: user.email}, token : token || null};
   
}

async function logout(res) {
    try {
        res.cookie("token","",{httpOnly: true, expires: new Date(0)});
        return {message: "User logged out successfully"};
    }
    catch (error) {
        throw new Error("Internal server error");
    }
}

module.exports = {
    register,
    login,
    logout
}