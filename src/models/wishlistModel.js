import mongoose from 'mongoose';

const wishlistItemSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true,
    },
    productId: {
      type: String,
      required: [true, 'Shopify Product ID is required'],
      trim: true,
    },
    handle: {
      type: String,
      trim: true,
      default: '',
    },
    title: {
      type: String,
      trim: true,
      default: '',
    },
    price: {
      type: Number,
      default: 0,
    },
    originalPrice: {
      type: Number,
      default: null,
    },
    image: {
      type: String,
      trim: true,
      default: '',
    },
    categoryName: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate wishlist items for the same user
wishlistItemSchema.index({ user: 1, productId: 1 }, { unique: true });

const Wishlist = mongoose.model('Wishlist', wishlistItemSchema);
export default Wishlist;
