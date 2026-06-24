const express = require("express");
const router = express.Router();
const watchListService = require("../services/watchList.Service");
const authMiddleware = require("../middlewares/authMiddleware");

const handleResponse = (res,status,message,data=null) => {
    res.status(status).json({
        status,
        message,
        data
    });
};

router.use(authMiddleware);

router.post("/",async (req,res,next) => {
    console.log("request body",req.body);
    
    const {movieId,status,rating,review} = req.body;
    try {
        // create a new watchlist item
        const newWatchListItem = await watchListService.createWatchListItem(movieId,status,rating,review,req.user.id);
        handleResponse(res,201,"Watchlist item created successfully",newWatchListItem);
    }
    catch (error) {
        handleResponse(res,500,"Internal server error",error.message || "Something went wrong");
    }
});

router.get("/",async (req,res,next) => {
    const {userId} = req.user.id;
    try {
        const watchListItems = await watchListService.getWatchListItems(userId);
        handleResponse(res,200,"Watchlist items fetched successfully",watchListItems);
    }
    catch (error) {
        handleResponse(res,500,"Internal server error",error.message || "Something went wrong");
    }
});

router.delete("/:id",async (req,res,next) => {
    const {id} = req.params;
    try {
        const deletedWatchListItem = await watchListService.deleteWatchListItem(id);
        handleResponse(res,200,"Watchlist item deleted successfully",deletedWatchListItem);
    }
    catch (error) {
        handleResponse(res,500,"Internal server error",error.message || "Something went wrong");
    }
});


module.exports = router;