import express from 'express';
import {
  getCustomerOrders,
  confirmOrderEmail,
  cancelOrderRequest,
  returnOrderRequest,
  handleShopifyOrderWebhook,
  trackOrderPublic,
} from '../controllers/orderController.js';
import { protect, optionalAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public order tracking route
router.post('/track', trackOrderPublic);

// Protected order history route
router.get('/', protect, getCustomerOrders);

// Order confirmation email dispatch
router.post('/confirm', optionalAuth, confirmOrderEmail);

// Shopify Webhook for automatic Order Confirmation (orders/create)
router.post('/webhook', handleShopifyOrderWebhook);

// Order cancellation request route
router.post('/cancel', optionalAuth, cancelOrderRequest);

// Order return / exchange request route
router.post('/return', optionalAuth, returnOrderRequest);

export default router;
