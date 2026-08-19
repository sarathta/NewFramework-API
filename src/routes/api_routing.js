const express = require('express');
const router = express.Router();

//--------------  Import controllers  ---------------------

const authController = require('../controllers/authController');
const userRoleController = require('../controllers/userRoleController');
const departmentController = require('../controllers/departmentController');
const areaController = require('../controllers/areaController');
const employeeController = require('../controllers/employeeController');
const masterController = require('../controllers/masterController');
const masterDataController = require('../controllers/masterDataController');
const stockController = require('../controllers/stockController');
const indentsController = require('../controllers/indentsController');
const materialIssueController = require('../controllers/materialIssueController');
const purchaseOrderController = require('../controllers/purchaseOrderController');
const vendorMaterialsController = require('../controllers/vendorMaterialsController');
const systemParameetrsController = require('../controllers/systemParametersController');
const companySettingsController = require('../controllers/companySettingsController');
const grnController = require('../controllers/grnController');

// Mount all routes
router.use('/auth', authController);
router.use('/user-roles', userRoleController);
router.use('/areas', areaController);
router.use('/departments', departmentController);
router.use('/users', employeeController);
router.use('/masters', masterController);
router.use('/master-data', masterDataController);
router.use('/stocks', stockController);
router.use('/indents', indentsController);
router.use('/material-issue', materialIssueController);
router.use('/purchase-order', purchaseOrderController);
router.use('/vendor-materials', vendorMaterialsController);
router.use('/system-parameters', systemParameetrsController);
router.use('/company-settings', companySettingsController);
router.use('/grn', grnController);
router.use('/grns', grnController);

module.exports = router;
