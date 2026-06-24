const jwt = require("jsonwebtoken");
const {prisma} = require("../config/db");


const authMiddleware = async (req,res,next) => {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
        token = req.headers.authorization.split(" ")[1];
    }
    else if (req.cookies?.jwt) {
        token = req.cookies.jwt;
    }
    if (!token) {
        return res.status(401).json({message: "Unauthorized, no token provided"});
    }
    try {
        //verify token and get user id
        const decoded = jwt.verify(token,process.env.JWT_SECRET);
        const user = await prisma.users.findUnique({
            where: {id: decoded.userId}
        });
        if (!user) {
            return res.status(401).json({message: "Unauthorized, user not found"});
        }
        req.user = user;
        next();
    }
    catch (error) {
        return res.status(401).json({message: "Unauthorized",error: error.message});
    }
}

module.exports = authMiddleware;