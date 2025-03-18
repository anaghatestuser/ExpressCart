![expressCart](https://raw.githubusercontent.com/mrvautin/expressCart/master/public/images/logo.png)

Check out the documentation [here](https://github.com/mrvautin/expressCart/wiki).

<!-- View the demo shop [here](https://expresscart-demo.markmoffat.com/). -->

Contributing to ExpressCart
We welcome contributions from the community! Follow the steps below to get started.

Step 1 - Fork the Repository
Click the Fork button on the repository page to create a copy of the project under your GitHub account.

Step 2 - Clone the Repository
Clone your forked repository to your local machine:

sh
Copy
Edit
git clone <your-forked-repo-link>
cd expressCart-opensource
Step 3 - Install Dependencies
Make sure Node.js and MongoDB are installed on your system. Then, run:

sh
Copy
Edit
npm install
Step 4 - Set Up Environment Variables
Create a .env file in the project root and add the required environment variables, such as:

env
Copy
Edit
MONGO_URI=mongodb://localhost:27017/expressCart
SESSION_SECRET=your_secret_key
STRIPE_SECRET_KEY=your_stripe_key
PAYPAL_CLIENT_ID=your_paypal_client_id
Step 5 - Run the Application
Start the application with:

sh
Copy
Edit
npm start
For development mode with live-reloading, use:

sh
Copy
Edit
npm run dev
License
This project is licensed under the MIT License.