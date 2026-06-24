const express = require('express');
const router = express.Router();

//--------------  Import controllers  ---------------------

const userController = require('../controllers/userController');
const authController = require('../controllers/authController');
const watchListController = require('../controllers/watchListController');

// Mount all routes
router.use('/users', userController);
router.use('/auth', authController);
router.use('/watchlist', watchListController);

module.exports = router;
