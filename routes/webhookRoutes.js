const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const axios = require('axios');
const querystring = require('querystring');
const path = require('path');
const fs = require('fs');
const { DateTime } = require('luxon');

// --- Centralized Configuration and Utilities ---
const DATA_ROOT_FOLDER = process.env.DATA_ROOT_FOLDER;
if (!DATA_ROOT_FOLDER) {
    console.error("CRITICAL ERROR: DATA_ROOT_FOLDER is not set in environment variables!");
    // In a real application, you might want to exit the process or throw an error
    // here to prevent the server from starting with a bad configuration.
}

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
if (!WEBHOOK_SECRET) {
    console.error("CRITICAL ERROR: WEBHOOK_SECRET environment variable is not set!");
    // Same as above, a critical error that should stop server initialization.
}

/**
 * Checks for a valid access token file and returns its content.
 * @returns {Promise<object|null>} The parsed access token data or null if not found.
 */
async function checkTokenValidity() {
    try {
        const dateStr = DateTime.now().toFormat('yyyy-LL-dd');
        const tokenFilePath = path.join(DATA_ROOT_FOLDER, 'kite_access_token', `access_token_${dateStr}.json`);
        console.log(`🔍 Looking for access token file at: ${tokenFilePath}`);
        const access_token_data_content = fs.readFileSync(tokenFilePath, "utf-8");
        const access_token_data = JSON.parse(access_token_data_content);
        return access_token_data;
    } catch (e) {
        console.error("❌ Failed to read access token file:", e.message);
        return null;
    }
}


// --- Middleware for Webhook Signature Validation ---
/**
 * Express middleware to validate the signature of incoming webhook requests.
 * It checks for required headers, timestamp validity, and HMAC signature.
 * If validation fails, it sends an appropriate error response and stops the request chain.
 * If successful, it calls next() to pass control to the route handler.
 */
function validateWebhookSignature(req, res, next) {
    console.log("------------------------------------");
    console.log('➡️ Starting Webhook Signature Validation...');

    const signatureHeader = req.headers['x-dipsip-signature'];
    const timestampHeader = req.headers['x-dipsip-timestamp'];
    // Assuming 'rawBody' is added by a middleware like `express.json({ verify: ... })`
    const rawBody = req.rawBody;

    if (!signatureHeader || !timestampHeader || typeof rawBody === 'undefined') {
        console.error('❌ Webhook: Missing signature, timestamp, or raw body.');
        return res.status(400).send('Bad Request: Missing required webhook headers or body.');
    }

    const [signatureVersion, signature] = signatureHeader.split('=');

    if (signatureVersion !== 'v1' || !signature) {
        console.error('❌ Webhook: Invalid signature format or version.');
        return res.status(400).send('Bad Request: Invalid signature format.');
    }

    const incomingTimestamp = parseInt(timestampHeader);
    const fiveMinutesAgo = Math.floor(Date.now() / 1000) - (5 * 60);

    if (isNaN(incomingTimestamp) || incomingTimestamp < fiveMinutesAgo) {
        console.warn('⚠️ Webhook: Timestamp is invalid or too old. Possible replay attack.');
        return res.status(403).send('Forbidden: Timestamp is invalid or too old.');
    }

    const signedPayload = `${signatureVersion}:${timestampHeader}.${rawBody}`;
    const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
    hmac.update(signedPayload);
    const expectedSignature = hmac.digest('hex');

    if (expectedSignature !== signature) {
        console.error('❌ Webhook: Signature mismatch. Request is not authentic.');
        return res.status(401).send('Unauthorized: Invalid signature.');
    }

    console.log('✅ Webhook: Signature verified successfully.');
    // If validation passes, move to the next middleware or route handler
    next();
}


// --- Refactored Routes using the middleware ---

// The /ping route now only contains its specific logic.
// The signature validation is handled by the middleware.
router.post('/ping', validateWebhookSignature, async (req, res) => {
    console.log('➡️ Received Webhook Ping Request (Signature OK).');
    res.status(200).json({ message: 'Pong from DipSipClient' });
    console.log("------------------------------------");
});

// The /etf route now only contains its specific logic.
// The signature validation is handled by the middleware.
router.post('/etf', validateWebhookSignature, async (req, res) => {
    console.log('➡️ Received Webhook ETF Request (Signature OK).');

    try {
        const orders = req.body;
        if (!Array.isArray(orders) || orders.length === 0) {
            console.error('❌ Valid signature, but payload is empty or invalid:', orders);
            return res.status(400).json({ error: 'Payload must be a non-empty JSON array of instruments.' });
        }

        const accessTokenData = await checkTokenValidity();
        if (!accessTokenData || !accessTokenData.data || !accessTokenData.data.access_token) {
            console.error('❌ Customer Kite API: Failed to retrieve a valid Zerodha access token.');
            return res.status(500).json({ error: 'Failed to retrieve customer\'s Zerodha access token.' });
        }

        const { api_key, access_token } = accessTokenData.data;
        const authHeader = `token ${api_key}:${access_token}`;
        const KITE_API_URL = "https://api.kite.trade/orders/regular";
        const KITE_VERSION_HEADER = "3";
        const headers = {
            'X-Kite-Version': KITE_VERSION_HEADER,
            'Authorization': authHeader,
            'Content-Type': 'application/x-www-form-urlencoded'
        };
        const defaultOrderParams = {
            exchange: 'NSE',
            transaction_type: 'BUY',
            order_type: 'MARKET',
            product: 'CNC',
            validity: 'DAY',
        };
        const results = [];

        for (const order of orders) {
            if (!order.symbol || !order.quantity) {
                console.warn('⚠️ Skipping order due to missing symbol or quantity:', order);
                results.push({ symbol: order.symbol || 'unknown', status: 'error', message: 'Missing symbol or quantity.' });
                continue;
            }

            const postData = querystring.stringify({
                ...defaultOrderParams,
                tradingsymbol: order.symbol,
                quantity: Math.round(order.quantity),
            });

            console.log(`➡️ Placing MARKET order for ${order.symbol} with quantity ${Math.round(order.quantity)}...`);
            try {
                //THIS LINE POSTS THE ORDER TO ZERODHA KITE. COMMENT THIS OUT TO JUST PRINT THE ORDER DETAILS
                const response = await axios.post(KITE_API_URL, postData, { headers });
                console.log(`✅ Order placed for ${order.symbol}:`, response.data);
                results.push({ symbol: order.symbol, status: 'success', data: response.data });
            } catch (error) {
                if (error.response) {
                    console.error(`❌ Failed to place order for ${order.symbol}:`, `Status: ${error.response.status}`, `Error Data:`, error.response.data);
                    results.push({ symbol: order.symbol, status: 'error', message: `Kite API error: ${error.response.data.message || error.response.status}` });
                } else {
                    console.error(`❌ Failed to place order for ${order.symbol}:`, error.message);
                    results.push({ symbol: order.symbol, status: 'error', message: `Network or request error: ${error.message}` });
                }
            }
        }
        res.status(200).json({ message: 'Order placement process completed.', results: results });

    } catch (error) {
        console.error('❌ An unexpected error occurred during order processing:', error);
        res.status(500).json({ error: 'An internal server error occurred during order processing.' });
    } finally {
        console.log("------------------------------------");
    }
});

module.exports = router;