import User from '../models/userModel.js';
import { fetchCustomerOrders } from '../services/shopifyService.js';
import { sendOrderConfirmationEmail, sendOrderCancellationEmail } from '../services/emailService.js';
import {
  tagOrderAsCancellationRequested,
  getOrderTrackingDetails,
  getShopifyAdminAccessToken,
} from '../services/shopifyAdminService.js';

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

    // 2. If token is present, fetch real Shopify orders via Storefront API
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

    // 3. Fallback: Query Shopify Admin API directly by user.email
    try {
      const shop = process.env.SHOPIFY_STORE_DOMAIN || 'etujp6-nv.myshopify.com';
      const apiVersion = process.env.SHOPIFY_API_VERSION || '2024-01';
      const adminToken = await getShopifyAdminAccessToken();

      const adminRes = await fetch(
        `https://${shop}/admin/api/${apiVersion}/orders.json?email=${encodeURIComponent(user.email.trim())}&status=any`,
        {
          headers: {
            'X-Shopify-Access-Token': adminToken,
            'Content-Type': 'application/json',
          },
        }
      );

      if (adminRes.ok) {
        const adminData = await adminRes.json();
        const rawOrders = adminData.orders || [];

        const mappedOrders = rawOrders.map((o) => {
          const isCancelled =
            isOrderCancelledInDB(o) ||
            Boolean(o.cancelled_at || o.cancel_reason || o.tags?.includes('ORDER_CANCELLED'));
          const isCancelPending = o.tags?.includes('CANCEL_REQUESTED');

          return {
            id: o.id,
            name: o.name,
            orderNumber: o.order_number,
            processedAt: o.processed_at || o.created_at,
            createdAt: o.created_at,
            totalPrice: { amount: o.total_price },
            fulfillmentStatus: o.fulfillment_status,
            financialStatus: o.financial_status,
            cancelledAt: o.cancelled_at,
            cancelReason: o.cancel_reason,
            cancellationRequested: isCancelPending,
            isCancelled: isCancelled,
            tags: o.tags,
            fulfillments: (o.fulfillments || []).map((f) => ({
              trackingCompany: f.tracking_company,
              trackingNumber: f.tracking_number,
              trackingUrl: f.tracking_url,
              status: f.shipment_status || f.status,
              updatedAt: f.updated_at,
            })),
            lineItems: {
              edges: (o.line_items || []).map((item) => ({
                node: {
                  title: item.title,
                  quantity: item.quantity,
                  originalTotalPrice: { amount: item.price * item.quantity },
                  variantTitle: item.variant_title,
                },
              })),
            },
            shippingAddress: o.shipping_address,
          };
        });

        return res.status(200).json({
          success: true,
          shopifySynced: true,
          count: mappedOrders.length,
          orders: mappedOrders,
          message: 'Shopify orders retrieved successfully.',
        });
      }
    } catch (adminErr) {
      console.warn('[Shopify Admin Orders Fallback Notice]', adminErr.message);
    }

    // 4. Default empty state
    return res.status(200).json({
      success: true,
      shopifySynced: false,
      count: 0,
      orders: [],
      message: 'No synced Shopify orders found for this account email.',
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
 * @desc    Shopify Webhook for Orders Create (orders/create)
 * @route   POST /api/orders/webhook
 * @access  Public (called automatically by Shopify Webhook)
 */
export const handleShopifyOrderWebhook = async (req, res) => {
  try {
    const order = req.body;
    if (!order || !order.id) {
      return res.status(200).json({ received: true });
    }

    const email = order.email || order.contact_email || order.customer?.email;
    const fullName =
      [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(' ') ||
      order.shipping_address?.name ||
      'Valued Customer';
    const orderNumber = order.name || `#${order.order_number}`;

    const items = (order.line_items || []).map((item) => ({
      title: item.title,
      quantity: item.quantity,
      price: item.price,
    }));

    if (email) {
      sendOrderConfirmationEmail({
        to: email,
        fullName,
        orderNumber,
        items,
        shippingAddress: order.shipping_address || {},
        subtotal: order.subtotal_price || 0,
        shippingCost: order.total_shipping_price_set?.shop_money?.amount || 0,
        grandTotal: order.total_price || 0,
      }).catch((err) =>
        console.error(`[Shopify Webhook Order Email Error] to ${email}:`, err.message)
      );
    }

    return res.status(200).json({ success: true, orderNumber });
  } catch (error) {
    console.error('[Shopify Webhook Error]', error.message);
    return res.status(200).json({ received: true, error: error.message });
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

    // Automatically tag order in Shopify Admin UI as CANCEL_REQUESTED and record reason in Notes
    tagOrderAsCancellationRequested({
      orderId,
      orderName,
      reason,
      notes,
    }).catch((err) => console.warn('[Shopify Auto-Tag Warning]', err.message));

    return res.status(200).json({
      success: true,
      message: `Cancellation request for order ${orderName || orderId} has been successfully submitted. You will receive an email confirmation shortly.`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Public Order Tracking by Order Number & Email/Phone
 * @route   POST /api/orders/track
 * @access  Public
 */
export const trackOrderPublic = async (req, res, next) => {
  try {
    const { orderNumber, emailOrPhone } = req.body;

    if (!orderNumber || !emailOrPhone) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both your Order Number (e.g. #1004) and your registered Email or Mobile Number.',
      });
    }

    const trackingData = await getOrderTrackingDetails({ orderNumber, emailOrPhone });

    return res.status(200).json({
      success: true,
      order: trackingData,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || 'Unable to retrieve tracking information for this order.',
    });
  }
};

export default {
  getCustomerOrders,
  confirmOrderEmail,
  handleShopifyOrderWebhook,
  cancelOrderRequest,
  trackOrderPublic,
};
