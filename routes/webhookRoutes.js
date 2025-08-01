const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const axios = require('axios');
const querystring = require('querystring');
const path = require('path');
const fs = require('fs');
const { DateTime } = require('luxon');

// --- Your customer's `check_token_validity.js` logic moved here or kept as a utility ---
// For demonstration, let's keep it here for now as it's directly used by this route.
// In a larger app, you might move this into a `utils` or `services` folder.
const DATA_ROOT_FOLDER = process.env.DATA_ROOT_FOLDER;
if (!DATA_ROOT_FOLDER) {
    // This check is duplicated, ideally moved to an init script or main server.js
    console.error("CRITICAL ERROR: DATA_ROOT_FOLDER is not set in environment variables!");
    // You might want to throw an error here instead of process.exit in a route file
    // or ensure this check happens before routes are loaded.
}

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

// Get WEBHOOK_SECRET here as well, as this file needs it for verification.
// Again, ideally, this is loaded once globally or passed as a dependency.
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
if (!WEBHOOK_SECRET) {
    console.error("CRITICAL ERROR: WEBHOOK_SECRET environment variable is not set!");
    // Similar to DATA_ROOT_FOLDER, consider how to handle this in a modular way.
}

router.post('/etf', async (req, res) => {
    console.log("------------------------------------");
    console.log('➡️ Received Webhook Request.');

    // --- 1. Webhook Signature Verification ---
    const signatureHeader = req.headers['x-yourapp-signature'];
    const timestampHeader = req.headers['x-yourapp-timestamp'];
    const rawBody = req.rawBody; // rawBody is added by the main app.use(express.json) middleware

    if (!signatureHeader || !timestampHeader || typeof rawBody === 'undefined') {
        console.error('❌ Webhook: Missing signature, timestamp, or raw body in request.');
        return res.status(400).send('Bad Request: Missing required webhook headers or body.');
    }

    const [signatureVersion, signature] = signatureHeader.split('=');

    if (signatureVersion !== 'v1' || !signature) {
        console.error('❌ Webhook: Invalid signature format or version in header.');
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
        console.error('❌ Webhook: Signature mismatch. Request is not authentic or has been tampered with.');
        return res.status(401).send('Unauthorized: Invalid signature.');
    }
    console.log('✅ Webhook: Signature verified successfully. Request is authentic.');

    // --- 2. Order Placement Logic (only if signature is valid) ---
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