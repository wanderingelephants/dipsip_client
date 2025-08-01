dipsip_client
This repository contains a standalone Node.js Express application designed to serve as a webhook endpoint. It receives signed trade alerts, verifies their authenticity, and then places market orders using the Zerodha Kite API.

The application is built to be run in a Docker container for a self-contained and easily deployable environment.

Prerequisites
Docker and Docker Compose installed.

Setup
Configure Environment Variables:
Create a file named .env in the root directory and populate it with your configuration. You can copy the contents from default.env as a starting point.

cp default.env .env

Ensure WEBHOOK_SECRET is the exact same string you configured in the Dipsip frontend, and DATA_ROOT_FOLDER points to a directory on your machine where your Zerodha access token file is stored.

Create the Access Token File:
The check_token_validity.js script looks for an access token JSON file in the DATA_ROOT_FOLDER. You must create this file manually.

Assuming today's date is 2023-10-27, you would create a file named access_token_2023-10-27.json inside the directory you specified in DATA_ROOT_FOLDER.

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

A volume will be mounted to /usr/src/app/data inside the container, linked to your DATA_ROOT_FOLDER on the host machine.

Stopping the Application
To stop the running container, press Ctrl+C in your terminal. To stop and remove the container, run:

docker-compose down