const {prisma} = require("../config/db");


async function createWatchListItem(movieId,status,rating,review,userId) {
    // verify movie exists
    // t
    const movieExists = await prisma.movie.findUnique({
        where: {id: movieId}
    });
    if (!movieExists) {
        throw new Error("Movie not found");
    }
    //verify movie is not already in watchlist
    const watchListItemExists = await prisma.watchListItem.findUnique({
        where: {user_id_movie_id: {user_id: userId, movie_id: movieId}}
    });
    if (watchListItemExists) {
        throw new Error("Movie already in watchlist");
    }
    // create a new watchlist item
    const newWatchListItem = await prisma.watchListItem.create({
        data: {movie_id: movieId,status:status || 'PLANNED',rating:rating,review:review,user_id:userId}
    });
    return newWatchListItem;
}

async function getWatchListItems(userId) {
    const watchListItems = await prisma.watchListItem.findMany({
        where: {user_id: userId}
    });
    return watchListItems;
}

async function deleteWatchListItem(id) {
    const watchListItem = await prisma.watchListItem.findUnique({
        where: {id: id}
    });
    if (!watchListItem) {
        throw new Error("Watchlist item not found");
    }
    await prisma.watchListItem.delete({where: {id: watchListItem.id}});
    return {message: "Watchlist item deleted successfully"};
}

module.exports = {createWatchListItem,getWatchListItems,deleteWatchListItem};