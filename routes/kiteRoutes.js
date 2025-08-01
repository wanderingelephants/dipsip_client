const express = require('express');
const router = express.Router();
const axios = require('axios');
const querystring = require('querystring');
const { DateTime } = require('luxon');
const sha256 = require('crypto-js/sha256');
const path = require('path');
const fs = require('fs');

// --- Helper function from your original server.js (if needed by other routes here) ---
// For this example, checkTokenValidity is used by webhookRoutes, so it's kept external
// or can be passed as a dependency if strictly coupled.

router.get('/login/success', async (req, res) => {
    console.log("------------------------------------");
    console.log('➡️ Received Kite Login Success Callback.');
    try {
        const { request_token } = req.query;
        if (!request_token) {
            console.error("❌ Login Callback: Missing 'request_token' in query parameters.");
            return res.status(400).json({ message: "Bad Request: Missing request_token" });
        }

        const api_key = process.env.KITE_API_KEY;
        const api_secret = process.env.KITE_API_SECRET;

        if (!api_key || !api_secret) {
            console.error("❌ Login Callback: Missing KITE_API_KEY or KITE_API_SECRET.");
            return res.status(500).json({ message: "Server Error: Kite API keys not configured" });
        }

        const checksum = sha256(api_key + request_token + api_secret).toString();
        const formData = {
            "api_key": api_key,
            "request_token": request_token,
            "checksum": checksum
        };

        console.log(`➡️ Exchanging request_token for session token...`);
        const resp = await axios.post('https://api.kite.trade/session/token', querystring.stringify(formData), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Kite-Version': 3,
            }
        });

        const data = resp.data;
        const dateStr = DateTime.now().toFormat('yyyy-LL-dd');

        // Ensure the directory exists before writing the file
        const dirPath = path.join(process.env.DATA_ROOT_FOLDER);
        if (!fs.existsSync(dirPath)) {
            console.log(`Creating directory: ${dirPath}`);
            fs.mkdirSync(dirPath, { recursive: true });
        }
        
        const filePath = path.join(dirPath, `access_token_${dateStr}.json`);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        console.log(`✅ Access token saved to ${filePath}`);
        
        return res.status(200).json({
            message: "OK - Kite API login successful and token saved."
        });
    } catch (e) {
        console.error('❌ Error in Kite login success route:', e.response?.data || e.message);
        return res.status(500).json({
            message: "Could not process login request"
        });
    }
});

module.exports = router;