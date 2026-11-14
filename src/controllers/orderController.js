import User from '../models/userModel.js';
import { fetchCustomerOrders } from '../services/shopifyService.js';
import { sendOrderConfirmationEmail, sendOrderCancellationEmail } from '../services/emailService.js';

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
    const cancelledList = user.cancelledOrders || [];

    const isOrderCancelledInDB = (order) => {
      const oId = String(order.id || '');
      const oName = String(order.name || order.orderNumber || '');
      return cancelledList.some(
        (c) =>
          (c.orderId && (oId.includes(c.orderId) || c.orderId.includes(oId))) ||
          (c.orderName && (oName === c.orderName || oName.includes(c.orderName)))
      );
    };

    // 2. If token is present, fetch real Shopify orders
    if (customerToken) {
      try {
        const customerData = await fetchCustomerOrders(customerToken);
        if (customerData && customerData.orders) {
          const rawOrders = customerData.orders.edges?.map((edge) => edge.node) || [];
          const enhancedOrders = rawOrders.map((order) => {
            if (isOrderCancelledInDB(order)) {
              return {
                ...order,
                cancellationRequested: true,
              };
            }
            return order;
          });

          return res.status(200).json({
            success: true,
            shopifySynced: true,
            count: enhancedOrders.length,
            orders: enhancedOrders,
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

/**
 * @desc    Request cancellation of an order
 * @route   POST /api/orders/cancel
 * @access  Public / Optional Auth
 */
export const cancelOrderRequest = async (req, res, next) => {
  try {
    const { orderId, orderName, reason, notes, customerEmail, customerName, fulfillmentStatus } = req.body;
    const effectiveEmail = req.user?.email || customerEmail;
    const effectiveName = req.user?.fullName || customerName || 'Valued Patron';

    if (!orderName && !orderId) {
      return res.status(400).json({
        success: false,
        message: 'Order reference number is required to process cancellation.',
      });
    }

    if (!effectiveEmail) {
      return res.status(400).json({
        success: false,
        message: 'Customer email is required.',
      });
    }

    // Strict Condition: Shipped orders cannot be cancelled
    const shippedStatuses = ['SHIPPED', 'FULFILLED', 'IN_TRANSIT', 'ON_THE_WAY', 'OUT_FOR_DELIVERY', 'DELIVERED'];
    if (fulfillmentStatus && shippedStatuses.includes(fulfillmentStatus.toUpperCase())) {
      return res.status(400).json({
        success: false,
        message: 'This order has already been shipped and dispatched, so it cannot be cancelled. You can initiate a return or exchange once the package arrives.',
      });
    }

    // Record cancellation in user document in database
    if (effectiveEmail) {
      await User.findOneAndUpdate(
        { email: effectiveEmail.toLowerCase().trim() },
        {
          $addToSet: {
            cancelledOrders: {
              orderId: String(orderId || ''),
              orderName: String(orderName || ''),
              reason: String(reason || 'Customer requested cancellation'),
              notes: String(notes || ''),
              requestedAt: new Date(),
            },
          },
        }
      ).catch((err) => console.warn('[Cancel Order Save Warning]', err.message));
    }

    // Dispatch cancellation email notifications to admin and customer
    await sendOrderCancellationEmail({
      customerEmail: effectiveEmail,
      customerName: effectiveName,
      orderName: orderName || orderId,
      reason: reason || 'Customer requested cancellation',
      notes: notes || '',
    });

    return res.status(200).json({
      success: true,
      message: `Cancellation request for order ${orderName || orderId} has been successfully submitted. You will receive an email confirmation shortly.`,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getCustomerOrders,
  confirmOrderEmail,
  cancelOrderRequest,
};
