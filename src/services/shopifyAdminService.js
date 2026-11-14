/**
 * Shopify Admin API Service
 * Handles authenticated admin actions such as tagging orders, updating notes, and auto-cancellations.
 */

let cachedToken = null;
let tokenExpiry = 0;

/**
 * Retrieves a valid Shopify Admin Access Token using Client Credentials or static .env token
 */
export async function getShopifyAdminAccessToken() {
  // If static SHOPIFY_ADMIN_ACCESS_TOKEN is configured, use it directly
  if (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN) {
    return process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  }

  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  const shop = process.env.SHOPIFY_STORE_DOMAIN || 'etujp6-nv.myshopify.com';

  if (!clientId || !clientSecret) {
    throw new Error('Shopify Client ID or Client Secret is missing from environment variables');
  }

  // Return cached token if still valid
  if (cachedToken && Date.now() < tokenExpiry - 60000) {
    return cachedToken;
  }

  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Shopify Token Exchange Failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in || 86400) * 1000;
  return cachedToken;
}

/**
 * Automatically tags an order in Shopify Admin as CANCEL_REQUESTED and updates the order note
 */
export async function tagOrderAsCancellationRequested({ orderId, orderName, reason, notes }) {
  try {
    const shop = process.env.SHOPIFY_STORE_DOMAIN || 'etujp6-nv.myshopify.com';
    const apiVersion = process.env.SHOPIFY_API_VERSION || '2024-01';
    const accessToken = await getShopifyAdminAccessToken();

    // 1. Determine numeric ID or lookup by order name
    let numericId = null;
    if (orderId) {
      const match = String(orderId).match(/\d+/g);
      if (match && match.length > 0) {
        // Take the longest continuous digit sequence (often the full Shopify Order ID)
        numericId = match.reduce((a, b) => (a.length >= b.length ? a : b));
      }
    }

    let targetOrder = null;

    // Try fetching by numeric ID first if plausible
    if (numericId && numericId.length >= 8) {
      const res = await fetch(`https://${shop}/admin/api/${apiVersion}/orders/${numericId}.json?fields=id,name,tags,note`, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      });
      if (res.ok) {
        const body = await res.json();
        targetOrder = body.order;
      }
    }

    // If not found yet and orderName exists (e.g. #1003), search by name
    if (!targetOrder && orderName) {
      const cleanName = encodeURIComponent(orderName.trim());
      const searchRes = await fetch(`https://${shop}/admin/api/${apiVersion}/orders.json?name=${cleanName}&status=any&fields=id,name,tags,note`, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      });
      if (searchRes.ok) {
        const body = await searchRes.json();
        if (body.orders && body.orders.length > 0) {
          targetOrder = body.orders[0];
        }
      }
    }

    if (!targetOrder) {
      console.warn(`[Shopify Admin] Could not locate order ${orderName || orderId} in Shopify Admin to tag.`);
      return { success: false, message: 'Order not found in Shopify' };
    }

    // 2. Prepare updated tags
    const existingTags = targetOrder.tags
      ? targetOrder.tags.split(',').map((t) => t.trim()).filter(Boolean)
      : [];

    if (!existingTags.includes('CANCEL_REQUESTED')) {
      existingTags.push('CANCEL_REQUESTED');
    }

    // 3. Prepare updated note
    const cancellationNote = `[Cancellation Requested]: ${reason || 'User requested cancellation'}${notes ? ` | Notes: ${notes}` : ''}`;
    let updatedNote = targetOrder.note ? `${targetOrder.note}\n${cancellationNote}` : cancellationNote;

    // 4. Update the order in Shopify Admin
    const updateRes = await fetch(`https://${shop}/admin/api/${apiVersion}/orders/${targetOrder.id}.json`, {
      method: 'PUT',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        order: {
          id: targetOrder.id,
          tags: existingTags.join(', '),
          note: updatedNote,
        },
      }),
    });

    if (!updateRes.ok) {
      const errBody = await updateRes.text();
      console.error(`[Shopify Admin Tag Error] (${updateRes.status}):`, errBody);
      return { success: false, error: errBody };
    }

    const updatedData = await updateRes.json();
    console.log(`[Shopify Admin] Order ${targetOrder.name || targetOrder.id} successfully tagged as CANCEL_REQUESTED in Shopify Admin UI!`);
    return { success: true, order: updatedData.order };
  } catch (err) {
    console.error('[Shopify Admin Tagging Error]:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Fetches and verifies order tracking details from Shopify Admin
 */
export async function getOrderTrackingDetails({ orderNumber, emailOrPhone }) {
  const shop = process.env.SHOPIFY_STORE_DOMAIN || 'etujp6-nv.myshopify.com';
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2024-01';
  const accessToken = await getShopifyAdminAccessToken();

  if (!orderNumber || !emailOrPhone) {
    const err = new Error('Both Order Number and Email or Phone Number are required.');
    err.statusCode = 400;
    throw err;
  }

  const cleanNum = orderNumber.trim().replace(/^#+/, '');
  const targetNames = [`#${cleanNum}`, cleanNum];

  let targetOrder = null;

  for (const name of targetNames) {
    const searchRes = await fetch(
      `https://${shop}/admin/api/${apiVersion}/orders.json?name=${encodeURIComponent(name)}&status=any`,
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      }
    );
    if (searchRes.ok) {
      const body = await searchRes.json();
      if (body.orders && body.orders.length > 0) {
        targetOrder = body.orders[0];
        break;
      }
    }
  }

  if (!targetOrder) {
    const err = new Error(`Order ${orderNumber} could not be found. Please check your order number.`);
    err.statusCode = 404;
    throw err;
  }

  // Verification matching:
  const inputDigits = emailOrPhone.replace(/\D/g, '');
  const inputEmail = emailOrPhone.toLowerCase().trim();

  const orderEmail = (targetOrder.email || targetOrder.contact_email || targetOrder.customer?.email || '').toLowerCase().trim();
  const orderPhones = [
    targetOrder.phone,
    targetOrder.customer?.phone,
    targetOrder.shipping_address?.phone,
    targetOrder.billing_address?.phone,
  ]
    .filter(Boolean)
    .map((p) => String(p).replace(/\D/g, ''));

  const emailMatch = inputEmail.includes('@') && orderEmail && orderEmail === inputEmail;
  const phoneMatch = inputDigits.length >= 10 && orderPhones.some((p) => p.endsWith(inputDigits.slice(-10)));

  if (!emailMatch && !phoneMatch) {
    const err = new Error('The email or phone number entered does not match this order.');
    err.statusCode = 403;
    throw err;
  }

  // Construct stages & status
  const tags = targetOrder.tags || '';
  const isCancelled = Boolean(
    targetOrder.cancelled_at ||
    targetOrder.cancel_reason ||
    tags.includes('ORDER_CANCELLED')
  );
  const isCancellationRequested = tags.includes('CANCEL_REQUESTED');

  const fulfillments = targetOrder.fulfillments || [];
  const primaryFulfillment = fulfillments[0] || null;

  // Determine current stage:
  // 1 = Placed, 2 = Confirmed / Processing, 3 = Shipped / In Transit, 4 = Out for Delivery, 5 = Delivered
  let currentStage = 1;
  let stageLabel = 'Order Placed';

  if (targetOrder.confirmed) {
    currentStage = 2;
    stageLabel = 'Order Processing';
  }

  if (fulfillments.length > 0) {
    currentStage = 3;
    stageLabel = 'Shipped';
    const fStatus = (primaryFulfillment.shipment_status || primaryFulfillment.status || '').toLowerCase();
    if (fStatus.includes('out_for_delivery')) {
      currentStage = 4;
      stageLabel = 'Out for Delivery';
    } else if (fStatus.includes('delivered') || targetOrder.fulfillment_status === 'fulfilled') {
      currentStage = 5;
      stageLabel = 'Delivered';
    }
  }

  // Estimated delivery: 3 to 5 business days from order placement
  const placedDate = new Date(targetOrder.created_at || Date.now());
  const estMin = new Date(placedDate);
  estMin.setDate(estMin.getDate() + 3);
  const estMax = new Date(placedDate);
  estMax.setDate(estMax.getDate() + 5);

  const options = { month: 'short', day: 'numeric' };
  const estimatedDeliveryText = `${estMin.toLocaleDateString('en-IN', options)} – ${estMax.toLocaleDateString('en-IN', options)}`;

  return {
    orderNumber: targetOrder.name,
    createdAt: targetOrder.created_at,
    financialStatus: targetOrder.financial_status,
    fulfillmentStatus: targetOrder.fulfillment_status || 'unfulfilled',
    isCancelled,
    cancelledAt: targetOrder.cancelled_at,
    isCancellationRequested,
    currentStage,
    stageLabel,
    estimatedDelivery: estimatedDeliveryText,
    destination: targetOrder.shipping_address
      ? `${targetOrder.shipping_address.city}, ${targetOrder.shipping_address.province}`
      : 'India',
    recipientName: targetOrder.shipping_address?.name || 'Customer',
    carrier: primaryFulfillment?.tracking_company || (currentStage >= 3 ? 'Express Delivery' : null),
    trackingNumber: primaryFulfillment?.tracking_number || null,
    trackingUrl: primaryFulfillment?.tracking_url || null,
    items: (targetOrder.line_items || []).map((item) => ({
      title: item.title,
      quantity: item.quantity,
      price: item.price,
      sku: item.sku,
    })),
    totalPrice: targetOrder.total_price,
    currency: targetOrder.currency || 'INR',
  };
}

export default {
  getShopifyAdminAccessToken,
  tagOrderAsCancellationRequested,
  getOrderTrackingDetails,
};
