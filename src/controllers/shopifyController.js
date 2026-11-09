import * as shopifyService from '../services/shopifyService.js';
import User from '../models/userModel.js';

/**
 * @desc    Create a new Shopify cart & get secure checkout URL
 * @route   POST /api/shopify/cart/create
 * @access  Public / Optional Auth
 */
export const createCart = async (req, res, next) => {
  try {
    const { items, lines } = req.body;
    const cartLines = lines || items || [];

    if (!Array.isArray(cartLines) || cartLines.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cart cannot be empty. Please provide at least one product variant line item.',
      });
    }

    // Determine if we have a Shopify customer token to attach to checkout
    let customerAccessToken = null;
    if (req.user) {
      const user = await User.findById(req.user._id).select('+shopifyCustomerAccessToken');
      customerAccessToken = user?.shopifyCustomerAccessToken || null;
    }

    // Call Shopify Storefront API
    const cart = await shopifyService.createCart(cartLines, customerAccessToken);

    return res.status(201).json({
      success: true,
      cartId: cart.id,
      checkoutUrl: cart.checkoutUrl,
      cost: cart.cost,
      totalQuantity: cart.totalQuantity,
      lines: cart.lines?.edges?.map((e) => e.node) || [],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get cart details by ID
 * @route   GET /api/shopify/cart/:cartId
 * @access  Public
 */
export const getCart = async (req, res, next) => {
  try {
    const { cartId } = req.params;
    const decodedCartId = decodeURIComponent(cartId);

    const cart = await shopifyService.getCart(decodedCartId);
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    return res.status(200).json({
      success: true,
      cart,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Add lines to existing cart
 * @route   POST /api/shopify/cart/:cartId/lines
 * @access  Public
 */
export const addLinesToCart = async (req, res, next) => {
  try {
    const { cartId } = req.params;
    const { lines } = req.body;

    const decodedCartId = decodeURIComponent(cartId);
    const cart = await shopifyService.addCartLines(decodedCartId, lines);

    return res.status(200).json({
      success: true,
      cart,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update line items in cart
 * @route   PUT /api/shopify/cart/:cartId/lines
 * @access  Public
 */
export const updateCartLines = async (req, res, next) => {
  try {
    const { cartId } = req.params;
    const { lines } = req.body;

    const decodedCartId = decodeURIComponent(cartId);
    const cart = await shopifyService.updateCartLines(decodedCartId, lines);

    return res.status(200).json({
      success: true,
      cart,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Remove lines from cart
 * @route   DELETE /api/shopify/cart/:cartId/lines
 * @access  Public
 */
export const removeCartLines = async (req, res, next) => {
  try {
    const { cartId } = req.params;
    const { lineIds } = req.body;

    const decodedCartId = decodeURIComponent(cartId);
    const cart = await shopifyService.removeCartLines(decodedCartId, lineIds);

    return res.status(200).json({
      success: true,
      cart,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Fetch products from Shopify
 * @route   GET /api/shopify/products
 * @access  Public
 */
export const getProducts = async (req, res, next) => {
  try {
    const { first, query, sortKey, reverse } = req.query;
    const products = await shopifyService.fetchProducts({
      first: parseInt(first, 10) || 24,
      query: query || '',
      sortKey: sortKey || 'BEST_SELLING',
      reverse: reverse === 'true',
    });

    return res.status(200).json({
      success: true,
      count: products.length,
      products,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Fetch single product by handle
 * @route   GET /api/shopify/products/:handle
 * @access  Public
 */
export const getProductByHandle = async (req, res, next) => {
  try {
    const { handle } = req.params;
    const product = await shopifyService.fetchProductByHandle(handle);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    return res.status(200).json({
      success: true,
      product,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Fetch Shopify collections
 * @route   GET /api/shopify/collections
 * @access  Public
 */
export const getCollections = async (req, res, next) => {
  try {
    const { first } = req.query;
    const collections = await shopifyService.fetchCollections({
      first: parseInt(first, 10) || 10,
    });

    return res.status(200).json({
      success: true,
      count: collections.length,
      collections,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  createCart,
  getCart,
  addLinesToCart,
  updateCartLines,
  removeCartLines,
  getProducts,
  getProductByHandle,
  getCollections,
};
