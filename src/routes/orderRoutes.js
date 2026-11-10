import express from 'express';
import { getCustomerOrders, confirmOrderEmail } from '../controllers/orderController.js';
import { protect, optionalAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// Protected order history route
router.get('/', protect, getCustomerOrders);

// Order confirmation email dispatch
router.post('/confirm', optionalAuth, confirmOrderEmail);

export default router;
