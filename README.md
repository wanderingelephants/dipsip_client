dipsip_client
This repository contains a standalone Node.js Express application designed to serve as a webhook endpoint. It receives signed order alerts, verifies their authenticity, and then places market orders using the Zerodha Kite API.

The application is built to be run in a Docker container for a self-contained and easily deployable environment.

Prerequisites
Docker and Docker Compose installed.

Setup
Configure Environment Variables:
Create a file named .env in the root directory and populate it with your configuration. You can copy the contents from default.env as a starting point.

cp default.env .env

Ensure WEBHOOK_SECRET is the exact same string you configured in the Dipsip Profile page, and KITE_ACCESS_TOKEN_DATA_FOLDER points to a directory on your machine where your Zerodha access token file is stored.

Create the Access Token File:
The check_token_validity.js script looks for an access token JSON file in the KITE_ACCESS_TOKEN_DATA_FOLDER. You must create this file manually.

Assuming today's date is 2023-10-27, you would create a file named access_token_2023-10-27.json inside the directory you specified in KITE_ACCESS_TOKEN_DATA_FOLDER.

Example access_token_2023-10-27.json:

{
  "data": {
    "api_key": "YOUR_ZERODHA_API_KEY",
    "access_token": "YOUR_ZERODHA_ACCESS_TOKEN"
  }
}

Note: The access_token expires daily, so you will need to update this file with a new token each morning.

Running the Application
Once your .env file and access token file are set up, run the following command from the root of this project:

docker-compose up --build

This will:

Build the Docker image for the Node.js application.

Start the container.

The application will be accessible at http://localhost:4000/webhook/etf.

A volume will be mounted to /usr/src/app/data inside the container, linked to your KITE_ACCESS_TOKEN_DATA_FOLDER on the host machine.

Stopping the Application
To stop the running container, press Ctrl+C in your terminal. To stop and remove the container, run:

docker-compose down


After the app starts go to ngrok console at http://localhost:4040/inspect/http

This will reveal your ngrok tunnel URL. Something like https://<randomstring>.ngrok-free.app. 

In Kite dev console specify 

1. login call back as https://<randomstring>.ngrok-free.app/kite/login/success
2. order status callback as https://<randomstring>.ngrok-free.app/kite/order/status

Notes about various env variables

The secret key for verifying webhook signatures.
This MUST be the exact same string as configured in your Dipsip profile.
This ensures that any callback you get is coming from DipSip Server and not malicious. DipSip will sign the payload with this secret. (HMAC SHA256 signature)
WEBHOOK_SECRET="a-very-long-and-secure-secret-string"


Get ngrok auth token from https://dashboard.ngrok.com/get-started/setup
and run this on your shell - ngrok config add-authtoken <NGROK_AUTH_TOKEN>
NGROK_AUTHTOKEN=<NGROK_AUTH_TOKEN>

#Get these from kite dev console https://developers.kite.trade/apps
KITE_API_KEY=<YOUR KITE API KEY>
KITE_API_SECRET=<YOUR KITE SECRET>

You local folder where kite access token will be saved. This access token remains active for one day and is 
flushed by Brokers every day at 7:30 AM IST. To reuse it during the day, the app code stores it locally.
You (like everybody else) needs to login every day to refresh the token. https://kite.zerodha.com/connect/login?api_key=<YOUR API KEY>

Create the following folder one time. e.g. /Users/<username>/kite_data or on Windows D:/my_data/kite_data
KITE_ACCESS_TOKEN_DATA_FOLDER=<Your Local Path>/kite_data