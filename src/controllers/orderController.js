import User from '../models/userModel.js';
import { fetchCustomerOrders } from '../services/shopifyService.js';

/**
 * @desc    Get authenticated customer's Shopify orders
 * @route   GET /api/orders
 * @access  Protected
 */
export const getCustomerOrders = async (req, res, next) => {
  try {
    // 1. Fetch user to check for linked Shopify customer credentials
    const user = await User.findById(req.user._id).select('+shopifyCustomerAccessToken');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const customerToken = user.shopifyCustomerAccessToken || req.headers['x-shopify-customer-token'];

    // 2. If token is present, fetch real Shopify orders
    if (customerToken) {
      try {
        const customerData = await fetchCustomerOrders(customerToken);
        if (customerData && customerData.orders) {
          const rawOrders = customerData.orders.edges?.map((edge) => edge.node) || [];
          
          return res.status(200).json({
            success: true,
            shopifySynced: true,
            count: rawOrders.length,
            orders: rawOrders,
            message: 'Real Shopify order commissions retrieved successfully.',
          });
        }
      } catch (shopifyError) {
        console.warn('[Shopify Order Query Notice]', shopifyError.message);
      }
    }

    // 3. If Shopify customer authentication is not configured / not linked:
    // Follow strict requirement: Do not return fake data or store mock orders in MongoDB.
    return res.status(200).json({
      success: true,
      shopifySynced: false,
      count: 0,
      orders: [],
      message: 'No synced Shopify orders found for this account email.',
      setupInfo: {
        reason: 'Shopify Storefront customer order access requires active customer authentication linking.',
        instructions: [
          '1. Enable "Customer Accounts" in Shopify Admin -> Settings -> Customer Accounts.',
          '2. Ensure the customer places checkout orders using the email: ' + user.email,
          '3. Once an order is completed on Shopify, you can link the customer account token or configure Shopify Headless Customer Accounts API.',
        ],
      },
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getCustomerOrders,
};
