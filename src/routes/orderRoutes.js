import express from 'express';
import { getCustomerOrders } from '../controllers/orderController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Protected order history route
router.get('/', protect, getCustomerOrders);

export default router;
