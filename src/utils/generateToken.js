const jwt = require("jsonwebtoken");





const generateToken = (user) => {
    const payload = {
        userId: user.id,
        username: user.username,
        role: user.role_id
    };
    const token = jwt.sign(payload,process.env.JWT_SECRET,{
        expiresIn: process.env.JWT_EXPIRES_IN || "7d"
    });
    return token;
}

module.exports = {
    generateToken
}