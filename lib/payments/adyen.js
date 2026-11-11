const express = require('express');
const { indexOrders, indexTransactions } = require('../indexing');
const numeral = require('numeral');
const got = require('got');
const { getId, sendEmail, getEmailTemplate } = require('../common');
const { getPaymentConfig } = require('../config');
const { emptyCart } = require('../cart');
const router = express.Router();

router.post('/setup', async (req, res, next) => {
    const config = req.app.config;
    const adyenConfig = getPaymentConfig('adyen');

    if(!req.session.cart){
        res.status(400).json({
            error: 'Cart is empty. Please add something to your cart before checking out.'
        });
        return;
    }

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
    // Store the Adyen session ID so the result can be verified server-side
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

    // The payment result is verified server-side with Adyen. This requires
    // the session created in /setup and the sessionResult from the client.
    const sessionId = req.session.adyenSessionId;
    const sessionResult = req.body.sessionResult;
    if(!sessionId || !sessionResult){
        res.status(400).json({ message: 'Invalid payment session. Please try again.' });
        return;
    }

    // A session result can only be redeemed once
    delete req.session.adyenSessionId;

    // Verify the payment result with Adyen
    let paymentResult;
    try{
        const resultResponse = await got.get(`https://checkout-${adyenConfig.environment}.adyen.com/v68/sessions/${sessionId}?sessionResult=${encodeURIComponent(sessionResult)}`, {
            headers: {
                'content-type': 'application/json',
                'x-API-key': adyenConfig.apiKey
            }
        });
        paymentResult = JSON.parse(resultResponse.body);
    }catch(ex){
        console.log('Exception verifying payment result', ex.message);
        res.status(400).json({ message: 'Failed to verify payment. Please try again.' });
        return;
    }

    // Update response based on the verified payment result
    let paymentStatus = 'Paid';
    let approved = true;
    if(paymentResult.status !== 'completed' || paymentResult.resultCode !== 'Authorised'){
        paymentStatus = 'Declined';
        approved = false;
    }

    const gatewayReference = paymentResult.pspReference || sessionId;

    // Create our transaction
    const transaction = await db.transactions.insertOne({
        gateway: 'adyen',
        gatewayReference: gatewayReference,
        gatewayMessage: paymentResult.resultCode,
        approved: approved,
        amount: req.session.totalCartAmount,
        currency: adyenConfig.currency,
        customer: getId(req.session.customerId),
        created: new Date()
    });

    const transactionId = transaction.insertedId;

    // Index transactios
    await indexTransactions(req.app);

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
    indexOrders(req.app)
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
