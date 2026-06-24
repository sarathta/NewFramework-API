const express = require("express");
const router = express.Router();
const userService =  require("../services/user.service");




const handleResponse = (res,status,message,data=null) => {
    res.status(status).json({
        status,
        message,
        data
    });
};

router.post("/",async (req,res,next) => {
    const {name,email} = req.body;
    try {
        const newUser = await userService.createUser(name,email);
        handleResponse(res,201,"User created successfully",newUser);
    }
    catch (error) {
        handleResponse(res,500,"Internal server error",null);
    }
});

router.get("/",async (req,res,next) => {
    try {
        const users = await userService.getAllUsers();
        handleResponse(res,200,"Users fetched successfully",users);
    }
    catch (error) {
        next(error);
    }
});

router.get("/:id",async (req,res,next) => {
    try {
        const user = await userService.getUserById(req.params.id);
        if (!user) {
            return handleResponse(res,404,"User not found",null);
        }
        handleResponse(res,200,"User fetched successfully",user);
    }
    catch (error) {
        next(error);
    }
});

router.put("/:id",async (req,res,next) => {
    const {name,email} = req.body;
    try {
        const updatedUser = await userService.updateUser(req.params.id,name,email);
        if (!updatedUser) {
            return handleResponse(res,404,"User not found",null);
        }
        handleResponse(res,200,"User updated successfully",updatedUser);
    }
    catch (error) {
        next(error);
    }
});

router.delete("/:id",async (req,res,next) => {
    try {
        const deletedUser = await userService.deleteUser(req.params.id);
        if (!deletedUser) {
            return handleResponse(res,404,"User not found",null);
        }
        handleResponse(res,200,"User deleted successfully",deletedUser);
    }
    catch (error) {
        next(error);
    }
});

module.exports = router;