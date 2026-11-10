/**
 * Shopify Storefront API Service
 * Centralizes all communication with Shopify GraphQL API
 */

const getShopifyConfig = () => {
  const domain = process.env.SHOPIFY_STORE_DOMAIN || 'etujp6-nv.myshopify.com';
  const token = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2024-01';

  return {
    domain,
    token,
    apiVersion,
    endpoint: `https://${domain}/api/${apiVersion}/graphql.json`,
  };
};

/**
 * Generic Shopify GraphQL fetch wrapper
 */
export const shopifyFetch = async ({ query, variables = {} }) => {
  const { endpoint, token } = getShopifyConfig();

  if (!token) {
    throw new Error('SHOPIFY_STOREFRONT_ACCESS_TOKEN is missing in environment variables.');
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Shopify API responded with HTTP status ${response.status}: ${response.statusText}`);
  }

  const json = await response.json();

  if (json.errors && json.errors.length > 0) {
    const errorMsg = json.errors.map((e) => e.message).join(' | ');
    throw new Error(`Shopify GraphQL Error: ${errorMsg}`);
  }

  return json.data;
};

// ==========================================
// 1. PRODUCTS & COLLECTIONS
// ==========================================

export const fetchProducts = async ({ first = 24, query = '', sortKey = 'BEST_SELLING', reverse = false } = {}) => {
  const PRODUCTS_QUERY = `
    query GetProducts($first: Int!, $query: String, $sortKey: ProductSortKeys, $reverse: Boolean) {
      products(first: $first, query: $query, sortKey: $sortKey, reverse: $reverse) {
        edges {
          node {
            id
            title
            handle
            description
            productType
            tags
            featuredImage {
              url
              altText
            }
            images(first: 10) {
              edges {
                node {
                  url
                  altText
                }
              }
            }
            priceRange {
              minVariantPrice {
                amount
                currencyCode
              }
            }
            compareAtPriceRange {
              minVariantPrice {
                amount
                currencyCode
              }
            }
            variants(first: 50) {
              edges {
                node {
                  id
                  title
                  availableForSale
                  price {
                    amount
                    currencyCode
                  }
                  compareAtPrice {
                    amount
                    currencyCode
                  }
                  selectedOptions {
                    name
                    value
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const data = await shopifyFetch({
    query: PRODUCTS_QUERY,
    variables: { first, query: query || null, sortKey, reverse },
  });

  return data.products?.edges?.map((e) => e.node) || [];
};

export const fetchProductByHandle = async (handle) => {
  const PRODUCT_QUERY = `
    query GetProductByHandle($handle: String!) {
      product(handle: $handle) {
        id
        title
        handle
        description
        descriptionHtml
        productType
        tags
        featuredImage {
          url
          altText
        }
        images(first: 15) {
          edges {
            node {
              url
              altText
            }
          }
        }
        priceRange {
          minVariantPrice {
            amount
            currencyCode
          }
        }
        compareAtPriceRange {
          minVariantPrice {
            amount
            currencyCode
          }
        }
        variants(first: 50) {
          edges {
            node {
              id
              title
              availableForSale
              price {
                amount
                currencyCode
              }
              compareAtPrice {
                amount
                currencyCode
              }
              selectedOptions {
                name
                value
              }
              image {
                url
                altText
              }
            }
          }
        }
      }
    }
  `;

  const data = await shopifyFetch({
    query: PRODUCT_QUERY,
    variables: { handle },
  });

  return data.product || null;
};

export const fetchCollections = async ({ first = 10 } = {}) => {
  const COLLECTIONS_QUERY = `
    query GetCollections($first: Int!) {
      collections(first: $first) {
        edges {
          node {
            id
            title
            handle
            description
            image {
              url
              altText
            }
          }
        }
      }
    }
  `;

  const data = await shopifyFetch({
    query: COLLECTIONS_QUERY,
    variables: { first },
  });

  return data.collections?.edges?.map((e) => e.node) || [];
};

// ==========================================
// 2. CART & CHECKOUT
// ==========================================

/**
 * Create a new Shopify cart
 * @param {Array} lines - Array of { merchandiseId, quantity }
 * @param {string} customerAccessToken - Optional Shopify customer token
 */
export const createCart = async (lines = [], customerAccessToken = null) => {
  const CART_CREATE_MUTATION = `
    mutation cartCreate($input: CartInput!) {
      cartCreate(input: $input) {
        cart {
          id
          checkoutUrl
          totalQuantity
          cost {
            totalAmount {
              amount
              currencyCode
            }
            subtotalAmount {
              amount
              currencyCode
            }
          }
          lines(first: 50) {
            edges {
              node {
                id
                quantity
                merchandise {
                  ... on ProductVariant {
                    id
                    title
                    price {
                      amount
                      currencyCode
                    }
                    product {
                      title
                      handle
                    }
                  }
                }
              }
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  // Normalize and resolve lines so that Product IDs are automatically mapped to valid ProductVariant IDs
  const resolvedLines = await Promise.all(
    lines.map(async (item) => {
      let merchandiseId = item.merchandiseId || item.variantId;
      const quantity = parseInt(item.quantity, 10) || 1;

      // If a Product ID was supplied instead of a ProductVariant ID:
      if (merchandiseId && merchandiseId.includes('/Product/') && !merchandiseId.includes('/ProductVariant/')) {
        try {
          const resolveQuery = `
            query ResolveVariant($id: ID!) {
              node(id: $id) {
                ... on Product {
                  variants(first: 1) {
                    edges {
                      node {
                        id
                      }
                    }
                  }
                }
              }
            }
          `;
          const nodeData = await shopifyFetch({
            query: resolveQuery,
            variables: { id: merchandiseId },
          });
          const firstVariantId = nodeData?.node?.variants?.edges?.[0]?.node?.id;
          if (firstVariantId) {
            console.log(`[Shopify Cart] Converted Product ID ${merchandiseId} to Variant ID ${firstVariantId}`);
            merchandiseId = firstVariantId;
          }
        } catch (resolveErr) {
          console.warn('[Cart Resolution Warning]', resolveErr.message);
        }
      }

      return {
        merchandiseId,
        quantity,
      };
    })
  );

  const input = {
    lines: resolvedLines,
  };

  if (customerAccessToken) {
    input.buyerIdentity = {
      customerAccessToken,
    };
  }

  const data = await shopifyFetch({
    query: CART_CREATE_MUTATION,
    variables: { input },
  });

  if (data.cartCreate?.userErrors?.length > 0) {
    const error = data.cartCreate.userErrors.map((e) => e.message).join(' | ');
    throw new Error(`Cart creation failed: ${error}`);
  }

  return data.cartCreate?.cart;
};

/**
 * Add items to existing Shopify cart
 */
export const addCartLines = async (cartId, lines) => {
  const CART_LINES_ADD_MUTATION = `
    mutation cartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
      cartLinesAdd(cartId: $cartId, lines: $lines) {
        cart {
          id
          checkoutUrl
          totalQuantity
          cost {
            totalAmount {
              amount
              currencyCode
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const formattedLines = lines.map((item) => ({
    merchandiseId: item.merchandiseId || item.variantId,
    quantity: parseInt(item.quantity, 10) || 1,
  }));

  const data = await shopifyFetch({
    query: CART_LINES_ADD_MUTATION,
    variables: { cartId, lines: formattedLines },
  });

  if (data.cartLinesAdd?.userErrors?.length > 0) {
    const error = data.cartLinesAdd.userErrors.map((e) => e.message).join(' | ');
    throw new Error(`Could not add items to cart: ${error}`);
  }

  return data.cartLinesAdd?.cart;
};

/**
 * Update item quantities in existing cart
 */
export const updateCartLines = async (cartId, lines) => {
  const CART_LINES_UPDATE_MUTATION = `
    mutation cartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
      cartLinesUpdate(cartId: $cartId, lines: $lines) {
        cart {
          id
          checkoutUrl
          totalQuantity
          cost {
            totalAmount {
              amount
              currencyCode
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const formattedLines = lines.map((item) => ({
    id: item.id || item.lineId,
    quantity: parseInt(item.quantity, 10),
  }));

  const data = await shopifyFetch({
    query: CART_LINES_UPDATE_MUTATION,
    variables: { cartId, lines: formattedLines },
  });

  if (data.cartLinesUpdate?.userErrors?.length > 0) {
    const error = data.cartLinesUpdate.userErrors.map((e) => e.message).join(' | ');
    throw new Error(`Could not update cart: ${error}`);
  }

  return data.cartLinesUpdate?.cart;
};

/**
 * Remove items from cart
 */
export const removeCartLines = async (cartId, lineIds) => {
  const CART_LINES_REMOVE_MUTATION = `
    mutation cartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
      cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
        cart {
          id
          checkoutUrl
          totalQuantity
          cost {
            totalAmount {
              amount
              currencyCode
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await shopifyFetch({
    query: CART_LINES_REMOVE_MUTATION,
    variables: { cartId, lineIds },
  });

  if (data.cartLinesRemove?.userErrors?.length > 0) {
    const error = data.cartLinesRemove.userErrors.map((e) => e.message).join(' | ');
    throw new Error(`Could not remove item from cart: ${error}`);
  }

  return data.cartLinesRemove?.cart;
};

/**
 * Get Cart by ID
 */
export const getCart = async (cartId) => {
  const GET_CART_QUERY = `
    query getCart($cartId: ID!) {
      cart(id: $cartId) {
        id
        checkoutUrl
        totalQuantity
        cost {
          totalAmount {
            amount
            currencyCode
          }
          subtotalAmount {
            amount
            currencyCode
          }
        }
        lines(first: 50) {
          edges {
            node {
              id
              quantity
              merchandise {
                ... on ProductVariant {
                  id
                  title
                  price {
                    amount
                    currencyCode
                  }
                  product {
                    title
                    handle
                    featuredImage {
                      url
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const data = await shopifyFetch({
    query: GET_CART_QUERY,
    variables: { cartId },
  });

  return data.cart;
};

// ==========================================
// 3. SHOPIFY CUSTOMER & ORDERS
// ==========================================

/**
 * Create Customer Access Token in Shopify
 */
export const customerAccessTokenCreate = async (email, password) => {
  const MUTATION = `
    mutation customerAccessTokenCreate($input: CustomerAccessTokenCreateInput!) {
      customerAccessTokenCreate(input: $input) {
        customerAccessToken {
          accessToken
          expiresAt
        }
        customerUserErrors {
          code
          field
          message
        }
      }
    }
  `;

  const data = await shopifyFetch({
    query: MUTATION,
    variables: { input: { email, password } },
  });

  return data.customerAccessTokenCreate;
};

/**
 * Trigger Shopify password recovery email
 */
export const customerRecover = async (email) => {
  const MUTATION = `
    mutation customerRecover($email: String!) {
      customerRecover(email: $email) {
        customerUserErrors {
          code
          field
          message
        }
      }
    }
  `;

  const data = await shopifyFetch({
    query: MUTATION,
    variables: { email },
  });

  return data.customerRecover;
};

/**
 * Fetch Customer Orders using Shopify Customer Access Token
 */
export const fetchCustomerOrders = async (customerAccessToken) => {
  if (!customerAccessToken) return null;

  const ORDERS_QUERY = `
    query getCustomerOrders($customerAccessToken: String!) {
      customer(customerAccessToken: $customerAccessToken) {
        id
        firstName
        lastName
        email
        phone
        orders(first: 20, sortKey: PROCESSED_AT, reverse: true) {
          edges {
            node {
              id
              name
              orderNumber
              processedAt
              financialStatus
              fulfillmentStatus
              totalPrice {
                amount
                currencyCode
              }
              lineItems(first: 10) {
                edges {
                  node {
                    title
                    quantity
                    originalTotalPrice {
                      amount
                      currencyCode
                    }
                    variant {
                      id
                      title
                      image {
                        url
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const data = await shopifyFetch({
    query: ORDERS_QUERY,
    variables: { customerAccessToken },
  });

  return data.customer || null;
};

export default {
  shopifyFetch,
  fetchProducts,
  fetchProductByHandle,
  fetchCollections,
  createCart,
  addCartLines,
  updateCartLines,
  removeCartLines,
  getCart,
  customerAccessTokenCreate,
  customerRecover,
  fetchCustomerOrders,
};
