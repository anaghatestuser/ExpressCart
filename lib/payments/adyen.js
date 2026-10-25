const express = require('express');
const { requestOrdersReindex, requestTransactionsReindex } = require('../indexing');
const numeral = require('numeral');
const got = require('got');
const { getId, sendEmail, getEmailTemplate } = require('../common');
const { getPaymentConfig } = require('../config');
const { emptyCart } = require('../cart');
const router = express.Router();

router.post('/setup', async (req, res, next) => {
    const config = req.app.config;
    const adyenConfig = getPaymentConfig('adyen');

    const payload = {
        merchantAccount: adyenConfig.merchantAccount,
        amount: {
            currency: adyenConfig.currency,
            value: numeral(req.session.totalCartAmount).format('0.00').replace('.', '')
        },
        returnUrl: `${config.baseUrl}/adyen/checkout_return`,
        reference: Object.keys(req.session.cart)[0],
        countryCode: adyenConfig.countryCode,
        shopperEmail: req.session.customerEmail
    };

    let paymentsResponse;
    try{
        paymentsResponse = await got.post(`https://checkout-${adyenConfig.environment}.adyen.com/v68/sessions`, {
            headers: {
                'content-type': 'application/json',
                'x-API-key': adyenConfig.apiKey
            },
            json: payload
        });
        paymentsResponse = JSON.parse(paymentsResponse.body);
    }catch(ex){
        console.log('Exception getting supported payment methods', ex.message);
        res.status(400).json({ message: `Failed to retrieve payment methods.${ex.message}` });
        return;
    }

    // Store the Adyen session ID so the payment result can be verified
    req.session.adyenSessionId = paymentsResponse.id;

    res.status(200).json({
        paymentsResponse,
        environment: adyenConfig.environment,
        clientKey: adyenConfig.clientKey
    });
});

router.post('/checkout_action', async (req, res, next) => {
    const db = req.app.db;
    const config = req.app.config;
    const adyenConfig = getPaymentConfig('adyen');

    // Get the Adyen session ID created by the setup route
    const adyenSessionId = req.session.adyenSessionId;
    if(!adyenSessionId){
        res.status(400).json({ message: 'Payment session not found. Please try again.' });
        return;
    }

    // Remove the session ID so the payment can't be replayed
    delete req.session.adyenSessionId;

    // Verify the payment result with Adyen rather than trusting client data
    let sessionResponse;
    try{
        sessionResponse = await got.get(`https://checkout-${adyenConfig.environment}.adyen.com/v68/sessions/${adyenSessionId}`, {
            headers: {
                'content-type': 'application/json',
                'x-API-key': adyenConfig.apiKey
            }
        });
        sessionResponse = JSON.parse(sessionResponse.body);
    }catch(ex){
        console.log('Exception verifying payment session', ex.message);
        res.status(400).json({ message: 'Failed to verify the payment. Please try again.' });
        return;
    }

    // Determine the verified payment result from the gateway response
    const payments = Array.isArray(sessionResponse.payments) ? sessionResponse.payments : [];
    const authorisedPayment = payments.find((payment) => payment && payment.resultCode === 'Authorised');

    // Update response
    let paymentStatus = 'Paid';
    let approved = true;
    if(sessionResponse.status !== 'completed' || !authorisedPayment){
        paymentStatus = 'Declined';
        approved = false;
    }

    // Only use verified gateway data for the transaction records
    const verifiedPayment = authorisedPayment || payments[0] || {};
    const gatewayReference = verifiedPayment.id || adyenSessionId;
    const gatewayMessage = verifiedPayment.resultCode || sessionResponse.status;

    // Create our transaction
    const transaction = await db.transactions.insertOne({
        gateway: 'adyen',
        gatewayReference: gatewayReference,
        gatewayMessage: gatewayMessage,
        approved: approved,
        amount: req.session.totalCartAmount,
        currency: adyenConfig.currency,
        customer: getId(req.session.customerId),
        created: new Date()
    });

    const transactionId = transaction.insertedId;

    // Index transactios
    await requestTransactionsReindex(req.app);

    // new order doc
    const orderDoc = {
        orderTotal: req.session.totalCartAmount,
        orderShipping: req.session.totalCartShipping,
        orderItemCount: req.session.totalCartItems,
        orderProductCount: req.session.totalCartProducts,
        orderCustomer: getId(req.session.customerId),
        orderEmail: req.session.customerEmail,
        orderCompany: req.session.customerCompany,
        orderFirstname: req.session.customerFirstname,
        orderLastname: req.session.customerLastname,
        orderAddr1: req.session.customerAddress1,
        orderAddr2: req.session.customerAddress2,
        orderCountry: req.session.customerCountry,
        orderState: req.session.customerState,
        orderPostcode: req.session.customerPostcode,
        orderPhoneNumber: req.session.customerPhone,
        orderComment: req.session.orderComment,
        orderStatus: paymentStatus,
        orderDate: new Date(),
        orderProducts: req.session.cart,
        orderType: 'Single',
        transaction: transactionId
    };

    // insert order into DB
    const newOrder = await db.orders.insertOne(orderDoc);

    // get the new ID
    const newId = newOrder.insertedId;

    // Update order to transaction
    await db.transactions.updateOne({
        _id: getId(transactionId)
    }, {
        $set: {
            order: getId(newId)
        }
    });

    // add to lunr index
    requestOrdersReindex(req.app)
    .then(() => {
        // Process the result
        if(paymentStatus === 'Paid'){
            // set the results
            req.session.messageType = 'success';
            req.session.message = 'Your payment was successfully completed';
            req.session.paymentEmailAddr = orderDoc.orderEmail;
            req.session.paymentApproved = true;
            req.session.paymentDetails = `<p><strong>Order ID: </strong>${newId}</p><p><strong>Transaction ID: </strong>${gatewayReference}</p>`;

            // set payment results for email
            const paymentResults = {
                message: req.session.message,
                messageType: req.session.messageType,
                paymentEmailAddr: req.session.paymentEmailAddr,
                paymentApproved: true,
                paymentDetails: req.session.paymentDetails
            };

            // clear the cart
            if(req.session.cart){
                emptyCart(req, res, 'function');
            }

            // send the email with the response
            // TODO: Should fix this to properly handle result
            sendEmail(req.session.paymentEmailAddr, `Your payment with ${config.cartTitle}`, getEmailTemplate(paymentResults));
        }
        res.status(200).json({ paymentId: newId });
    });
});

module.exports = router;
