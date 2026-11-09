import Wishlist from '../models/wishlistModel.js';

/**
 * @desc    Get current user's wishlist
 * @route   GET /api/wishlist
 * @access  Protected
 */
export const getWishlist = async (req, res, next) => {
  try {
    const items = await Wishlist.find({ user: req.user._id }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: items.length,
      wishlist: items,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Add product to user's wishlist
 * @route   POST /api/wishlist
 * @access  Protected
 */
export const addToWishlist = async (req, res, next) => {
  try {
    const { productId, handle, title, price, originalPrice, image, categoryName } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'productId is required to add to wishlist.',
      });
    }

    // Check if item already exists in user's wishlist
    const existing = await Wishlist.findOne({ user: req.user._id, productId });
    if (existing) {
      return res.status(200).json({
        success: true,
        message: 'Product is already in your wishlist.',
        item: existing,
      });
    }

    const item = await Wishlist.create({
      user: req.user._id,
      productId: String(productId),
      handle: handle || '',
      title: title || '',
      price: price || 0,
      originalPrice: originalPrice || null,
      image: image || '',
      categoryName: categoryName || '',
    });

    return res.status(201).json({
      success: true,
      message: 'Product added to your wishlist.',
      item,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(200).json({
        success: true,
        message: 'Product is already in your wishlist.',
      });
    }
    next(error);
  }
};

/**
 * @desc    Remove product from user's wishlist
 * @route   DELETE /api/wishlist/:productId
 * @access  Protected
 */
export const removeFromWishlist = async (req, res, next) => {
  try {
    const { productId } = req.params;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'productId param is required.',
      });
    }

    // Support both decoded ID and direct ID (Shopify IDs have gid://...)
    const decodedId = decodeURIComponent(productId);

    const deleted = await Wishlist.findOneAndDelete({
      user: req.user._id,
      $or: [{ productId: decodedId }, { productId: productId }],
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Product was not found in your wishlist.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Product removed from wishlist.',
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
};
