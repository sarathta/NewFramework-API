const express = require('express');
const router = express.Router();

//--------------  Import controllers  ---------------------

const authController = require('../controllers/authController');
const userRoleController = require('../controllers/userRoleController');
const departmentController = require('../controllers/departmentController');
const employeeController = require('../controllers/employeeController');

// Mount all routes
router.use('/auth', authController);
router.use('/user-roles', userRoleController);
router.use('/departments', departmentController);
router.use('/users', employeeController);

module.exports = router;
