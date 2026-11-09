# Velmora Luxury E-commerce — Production Backend

A high-performance, secure Node.js + Express backend architected for **Velmora** ([velmoraindia.store](https://velmoraindia.store)). Seamlessly bridges MongoDB Atlas for patron accounts, saved addresses, and persistent wishlists with the **Shopify Storefront API** for catalog retrieval, cart management, and official Shopify checkout redirects.

---

## Architecture Overview

```
               [ Patron Web Browser ]
                         │
      ┌──────────────────┴──────────────────┐
      ▼                                     ▼
[ React + Vite Frontend ]         [ Velmora Express Backend ]
(velmoraindia.store on Vercel)     (Render / Railway on Node.js)
      │                                     │
      │   HTTP-Only JWT Cookie Auth         ├──► [ MongoDB Atlas ]
      ├────────────────────────────────────►│    (Users, Addresses, Wishlists)
      │                                     │
      ▼                                     ▼
[ Shopify Storefront GraphQL API ] ◄────────┘
(Products, Variants, Real Inventory, Cart Management & Checkout URLs)
```

---

## Project Structure

```
Velmora-backend/
├── src/
│   ├── config/
│   │   └── db.js                 # Mongoose connection & pool events
│   ├── models/
│   │   ├── userModel.js          # User schema with bcrypt password hashing
│   │   ├── addressModel.js       # Saved delivery addresses schema
│   │   └── wishlistModel.js      # Wishlist with unique user+product index
│   ├── controllers/
│   │   ├── authController.js     # Register, Login, Logout, Session check
│   │   ├── userController.js     # Profile management & Address Book CRUD
│   │   ├── wishlistController.js # Add/Remove/Fetch user wishlist
│   │   ├── orderController.js    # Shopify Customer Orders integration
│   │   └── shopifyController.js  # Storefront Cart creation & Products proxy
│   ├── routes/
│   │   ├── authRoutes.js         # /api/auth
│   │   ├── userRoutes.js         # /api/user
│   │   ├── wishlistRoutes.js     # /api/wishlist
│   │   ├── orderRoutes.js        # /api/orders
│   │   └── shopifyRoutes.js      # /api/shopify
│   ├── middleware/
│   │   ├── authMiddleware.js     # JWT verification from HTTP-only cookie
│   │   ├── errorMiddleware.js    # 404 & centralized error formatting
│   │   └── rateLimitMiddleware.js# IP rate limiting for auth & API
│   ├── services/
│   │   ├── shopifyService.js     # Shopify Storefront GraphQL operations
│   │   └── emailService.js       # Nodemailer welcome & reset emails
│   ├── utils/
│   │   ├── generateToken.js      # JWT signing & HTTP-only cookie helper
│   │   └── validators.js         # Input sanitization and validation
│   └── server.js                 # Express app bootstrap, CORS & Helmet
├── .env.example                  # Environment template
├── .gitignore                    # Ignored files (node_modules, .env, logs)
├── package.json                  # Dependencies & start scripts (ES Modules)
├── render.yaml                   # Infrastructure blueprint for Render.com
├── Procfile                      # Process file for Railway / Heroku
├── postman_collection.json       # Ready-to-import Postman testing collection
└── README.md                     # Documentation
```

---

## Environment Variables

Copy `.env.example` to `.env` in the backend root:

```bash
cp .env.example .env
```

| Variable | Description | Example Value |
| :--- | :--- | :--- |
| `PORT` | Local server port | `5000` |
| `NODE_ENV` | Environment mode (`development` or `production`) | `development` |
| `MONGODB_URI` | MongoDB connection URI (Local or Atlas) | `mongodb://127.0.0.1:27017/velmora` |
| `JWT_SECRET` | Secret key for signing JSON Web Tokens | `velmora_super_secret_jwt_key_2026_at_least_32_chars` |
| `FRONTEND_URL` | Allowed frontend origin for CORS | `https://velmoraindia.store` |
| `SHOPIFY_STORE_DOMAIN` | Shopify store domain | `etujp6-nv.myshopify.com` |
| `SHOPIFY_STOREFRONT_ACCESS_TOKEN` | Public Storefront Access Token | `c2bd0c6ee42403ca8f01319307abe9e9` |
| `SHOPIFY_API_VERSION` | Shopify Storefront API Version | `2024-01` |
| `EMAIL_HOST` | SMTP server host (optional) | `smtp.gmail.com` |
| `EMAIL_PORT` | SMTP port | `587` |
| `EMAIL_USER` | SMTP username | `atelier@velmoraindia.store` |
| `EMAIL_PASSWORD` | SMTP password / app password | `xxxx xxxx xxxx xxxx` |

---

## Local Development Quickstart

### 1. Install dependencies
```bash
cd Velmora-backend
npm install
```

### 2. Start the development server
```bash
npm run dev
```

The server boots on `http://localhost:5000` with live reload via `nodemon`.

---

## API Reference

### Health Check
- `GET /api/health`
  - Returns backend status, MongoDB connection state, and Shopify configuration status.

### Authentication (`/api/auth`)
- `POST /api/auth/register`
  - Payload: `{ "fullName": "Ananya Sharma", "email": "ananya@example.com", "password": "Password123!", "phoneNumber": "+91 98765 43210" }`
  - Sets secure HTTP-only cookie (`velmora_token`) and returns user profile.
- `POST /api/auth/login`
  - Payload: `{ "email": "ananya@example.com", "password": "Password123!" }`
  - Verifies credentials, sets HTTP-only cookie, and returns user profile.
- `POST /api/auth/logout`
  - Clears the authentication cookie.
- `GET /api/auth/me`
  - Returns the currently authenticated patron from the cookie session.

### Patron Profile (`/api/user`)
- `GET /api/user/profile` — Get profile information.
- `PUT /api/user/profile` — Update `fullName`, `phoneNumber`, or change password.

### Saved Addresses (`/api/user/addresses`)
- `GET /api/user/addresses` — List user's saved delivery addresses.
- `POST /api/user/addresses` — Add a new delivery address (`fullName`, `phoneNumber`, `addressLine1`, `addressLine2`, `city`, `state`, `postalCode`, `country`, `isDefault`).
- `PUT /api/user/addresses/:addressId` — Update existing address or toggle default flag.
- `DELETE /api/user/addresses/:addressId` — Remove an address.

### Wishlist (`/api/wishlist`)
- `GET /api/wishlist` — Fetch saved wishlist items for the logged-in user.
- `POST /api/wishlist` — Add a Shopify product to wishlist (prevents duplicate entries).
- `DELETE /api/wishlist/:productId` — Remove an item by Shopify product ID.

### Shopify Checkout & Cart (`/api/shopify/cart`)
- `POST /api/shopify/cart/create`
  - Payload: `{ "lines": [{ "merchandiseId": "gid://shopify/ProductVariant/68126738219258", "quantity": 1 }] }`
  - Creates a live Shopify cart and returns the official checkout redirect URL (`checkoutUrl`).
- `GET /api/shopify/cart/:cartId` — Fetch live cart cost and lines.

### Orders (`/api/orders`)
- `GET /api/orders`
  - Retrieves real customer orders from Shopify. If Shopify customer authentication is not yet linked, returns an informative explanation without injecting fake data.

---

## Testing with Postman

1. Open Postman.
2. Click **Import** in the upper left.
3. Select `postman_collection.json` located in `Velmora-backend`.
4. Ensure the `baseUrl` collection variable points to `http://localhost:5000/api`.
5. Postman will automatically manage cookies for authentication across requests.

---

## Deployment Guide

### Deploying to Render (Recommended)

1. Push this repository to GitHub (`Velmora-backend`).
2. Log into [dashboard.render.com](https://dashboard.render.com).
3. Click **New +** > **Web Service**.
4. Connect your GitHub repository.
5. Set:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/api/health`
6. Add the environment variables from `.env.example`:
   - `NODE_ENV`: `production`
   - `MONGODB_URI`: Your MongoDB Atlas connection string (`mongodb+srv://<user>:<password>@cluster0.mongodb.net/velmora?retryWrites=true&w=majority`)
   - `JWT_SECRET`: A secure random 32+ character string
   - `FRONTEND_URL`: `https://velmoraindia.store`
   - `SHOPIFY_STORE_DOMAIN`: `etujp6-nv.myshopify.com`
   - `SHOPIFY_STOREFRONT_ACCESS_TOKEN`: `c2bd0c6ee42403ca8f01319307abe9e9`
   - `SHOPIFY_API_VERSION`: `2024-01`
7. Click **Create Web Service**. Your service URL will be something like `https://velmora-backend.onrender.com`.

### Deploying to Railway

1. Install Railway CLI or connect via GitHub at [railway.app](https://railway.app).
2. Choose **New Project** > **Deploy from GitHub repo**.
3. Railway automatically detects `Procfile` (`web: npm start`).
4. In Railway project settings, add the required environment variables.
5. Generate a domain name under **Settings** > **Networking**.

---

## Connecting Backend to Vercel Frontend

1. Go to your frontend project at [vercel.com](https://vercel.com).
2. Navigate to **Project Settings** > **Environment Variables**.
3. Add or update:
   - `VITE_API_BASE_URL`: `https://your-velmora-backend.onrender.com/api`
4. Redeploy the frontend on Vercel.
5. When patrons sign up, log in, manage addresses, or click **Proceed to Checkout**, requests will flow to your custom backend with secure HTTP-only cookies!
