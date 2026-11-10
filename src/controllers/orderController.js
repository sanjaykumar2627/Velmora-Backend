import User from '../models/userModel.js';
import { fetchCustomerOrders } from '../services/shopifyService.js';
import { sendOrderConfirmationEmail } from '../services/emailService.js';

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

/**
 * @desc    Send order confirmation email
 * @route   POST /api/orders/confirm
 * @access  Protected (or Optional with valid email)
 */
export const confirmOrderEmail = async (req, res, next) => {
  try {
    const { orderNumber, items, shippingAddress, subtotal, shippingCost, grandTotal } = req.body;
    const user = req.user;

    const emailToSend = user?.email || req.body.email;
    const nameToSend = user?.fullName || req.body.fullName;

    if (!emailToSend) {
      return res.status(400).json({ success: false, message: 'Recipient email is required.' });
    }

    sendOrderConfirmationEmail({
      to: emailToSend,
      fullName: nameToSend,
      orderNumber,
      items: items || [],
      shippingAddress: shippingAddress || {},
      subtotal: subtotal || 0,
      shippingCost: shippingCost || 0,
      grandTotal: grandTotal || 0,
    }).catch((err) => {
      console.error(`[Order Email Error] Failed to send order email to ${emailToSend}:`, err.message);
    });

    return res.status(200).json({
      success: true,
      message: 'Order confirmation email dispatched successfully.',
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getCustomerOrders,
  confirmOrderEmail,
};
