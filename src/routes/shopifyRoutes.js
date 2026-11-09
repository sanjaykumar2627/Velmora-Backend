import express from 'express';
import {
  createCart,
  getCart,
  addLinesToCart,
  updateCartLines,
  removeCartLines,
  getProducts,
  getProductByHandle,
  getCollections,
} from '../controllers/shopifyController.js';
import { optionalAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// Cart & Checkout endpoints
router.post('/cart/create', optionalAuth, createCart);
router.get('/cart/:cartId', getCart);
router.post('/cart/:cartId/lines', addLinesToCart);
router.put('/cart/:cartId/lines', updateCartLines);
router.delete('/cart/:cartId/lines', removeCartLines);

// Product endpoints
router.get('/products', getProducts);
router.get('/products/:handle', getProductByHandle);
router.get('/collections', getCollections);

export default router;
