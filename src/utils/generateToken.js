const jwt = require("jsonwebtoken");





const generateToken = (userId) => {
    const payload = {
        userId: userId
    };
    const token = jwt.sign(payload,process.env.JWT_SECRET,{
        expiresIn: process.env.JWT_EXPIRES_IN || "7d"
    });
    return token;
}

module.exports = {
    generateToken
}