const express = require("express");
const router = express.Router();
const authService = require("../services/auth.service");


router.post("/login",async (req,res,next) => {
    const {username,password} = req.body;
    try {
        const user = await authService.login(username,password);

         res.cookie("jwt", user.token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
        });

        return res.status(200).json(user);
    }
    catch (error) {
        return res.status(500).json({message: error.message || "Something went wrong"});
    }
});

router.post("/logout",async (req,res,next) => {
    try {
        const logout = await authService.logout(res);
        return res.status(200).json(logout);
    }
    catch (error) {
        return res.status(500).json({message: error.message || "Something went wrong"});
    }
});

module.exports = router;