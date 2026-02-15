const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { tenantIsolation } = require('../middleware/tenantIsolation');
const {
  getOrders,
  getOrderById,
  createOrder,
  updateOrder,
  deleteOrder
} = require('../controllers/orderController');

// Toutes les routes nécessitent l'authentification
router.use(protect);
router.use(tenantIsolation);

router.route('/')
  .get(getOrders)
  .post(createOrder);

router.route('/:id')
  .get(getOrderById)
  .put(updateOrder)
  .delete(deleteOrder);

module.exports = router;
