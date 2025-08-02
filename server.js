// server.js - Main Express application for dipsip_client

require('dotenv').config(); // Load environment variables from .env file
const express = require('express');
const { cleanOldAccessTokenFiles } = require('./cleanOldAccessTokenFiles');

// Import the route modules
const kiteRoutes = require('./routes/kiteRoutes');
const webhookRoutes = require('./routes/webhookRoutes'); // Ensure checkTokenValidity is handled

const app = express();
const PORT = process.env.PORT || 4000;

// Environment variable checks (kept here as they are critical for the app startup)
const DATA_ROOT_FOLDER = process.env.DATA_ROOT_FOLDER;
if (!DATA_ROOT_FOLDER) {
    console.error("CRITICAL ERROR: DATA_ROOT_FOLDER is not set in environment variables!");
    process.exit(1);
}

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
if (!WEBHOOK_SECRET) {
  console.error("CRITICAL ERROR: WEBHOOK_SECRET environment variable is not set!");
  process.exit(1);
}
console.log("✅ Webhook server starting. WEBHOOK_SECRET is configured.");

cleanOldAccessTokenFiles();
// --- IMPORTANT for Webhook Signature Verification ---
app.use(express.json({
  verify: (req, res, buf) => {
    try {
      req.rawBody = buf.toString();
    } catch (error) {
      console.error('❌ Error parsing raw body for verification:', error);
      res.status(400).send('Bad Request: Unable to process body for verification.');
    }
  }
}));

// Use the route modules
// The path given to app.use acts as a prefix for all routes defined in the router.
app.use('/kite', kiteRoutes); // All routes in kiteRoutes will be prefixed with /kite
app.use('/webhook', webhookRoutes); // All routes in webhookRoutes will be prefixed with /webhook

// Start the server
app.listen(PORT, () => {
    console.log(`🚀 Webhook server listening on port ${PORT}`);
    console.log(`Kite Login Endpoint: http://localhost:${PORT}/kite/login/success`);
    console.log(`Webhook ETF Endpoint: http://localhost:${PORT}/webhook/etf`);
});