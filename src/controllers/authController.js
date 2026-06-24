const express = require("express");
const router = express.Router();
const authService = require("../services/auth.service");


const handleResponse = (res,status,message,data=null) => {
    res.status(status).json({
        status,
        message,
        data
    });
};

router.post("/register",async (req,res,next) => {
    const {name,email,password} = req.body;
    try {
        const newUser = await authService.register(name,email,password);
        handleResponse(res,201,"User registered successfully",newUser);
    }
    catch (error) {
        handleResponse(res,500,"Internal server error",error.message || "Something went wrong");
    }
});

router.post("/login",async (req,res,next) => {
    const {email,password} = req.body;
    try {
        const user = await authService.login(email,password);

         res.cookie("jwt", user.token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
        });

        handleResponse(res,200,"User logged in successfully",user);
    }
    catch (error) {
        handleResponse(res,500,"Internal server error",error.message || "Something went wrong");
    }
});

router.post("/logout",async (req,res,next) => {
    try {
        const logout = await authService.logout(res);
        handleResponse(res,200,"User logged out successfully",logout);
    }
    catch (error) {
        handleResponse(res,500,"Internal server error",error.message || "Something went wrong");
    }
});

module.exports = router;