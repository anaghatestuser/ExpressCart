const express = require('express');
const { indexOrders, indexTransactions } = require('../indexing');
const { getId, sendEmail, getEmailTemplate } = require('../common');
const { getPaymentConfig } = require('../config');
const { emptyCart } = require('../cart');
const numeral = require('numeral');
const router = express.Router();

router.post('/setup', async (req, res, next) => {
    const stripeConfig = getPaymentConfig('stripe');
    const stripe = require('stripe')(stripeConfig.secretKey);

    // Check for customer
    const customers = await stripe.customers.list({
        email: req.session.customerEmail
    });

    let stripeCustomer;
    if(customers.data.length === 0){
        // Create a Stripe customer if one doesn't exist
        stripeCustomer = await stripe.customers.create({
            email: req.session.customerEmail,
            name: `${req.session.customerFirstname} ${req.session.customerLastname}`,
            description: req.session.customerId.toString()
        });
    }else{
        // Set customer if existing
        stripeCustomer = customers.data[0];
    }

    // Set the Stripe customer to the session
    req.session.stripeCustomer = stripeCustomer.id;

    // Setup the Payment Intent
    const intent = {
        amount: numeral(req.session.totalCartAmount).format('0.00').replace('.', ''),
        currency: stripeConfig.stripeCurrency,
        payment_method_types: stripeConfig.paymentMethods,
        customer: stripeCustomer.id
    };

    // Default to a once off payment
    let paymentType = 'single';

    // If a subscription, set some values specific to storing method.
    if(req.session.cartSubscription){
        paymentType = 'subscription';
        intent.setup_future_usage = 'off_session';
        intent.payment_method_types = ['card'];
    }

    // Set the payment type
    intent.metadata = {
        paymentType
    };

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create(intent);

    // Persist the payment intent ID in the session so /checkout_action can
    // verify the returned intent was created for this session
    req.session.paymentIntentId = paymentIntent.id;

    res.send({
        clientSecret: paymentIntent.client_secret
    });
});

router.get('/checkout_action', async (req, res, next) => {
    const db = req.app.db;
    const config = req.app.config;
    const stripeConfig = getPaymentConfig('stripe');
    const stripe = require('stripe')(stripeConfig.secretKey);

    // Get result
    const result = req.query;

    // Check for the result
    if(!result || !result.payment_intent){
        req.session.messageType = 'danger';
        req.session.message = 'Unable to retrieve the payment.';
        res.redirect('/checkout/payment');
        return;
    }

    // The payment intent must be the one created by /setup for this session
    if(!req.session.paymentIntentId || result.payment_intent !== req.session.paymentIntentId){
        req.session.messageType = 'danger';
        req.session.message = 'Unable to retrieve the payment.';
        res.redirect('/checkout/payment');
        return;
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(
        result.payment_intent
    );

    // Check for payment intent
    if(!paymentIntent){
        req.session.messageType = 'danger';
        req.session.message = 'Unable to retrieve the payment.';
        res.redirect('/checkout/payment');
        return;
    }

    // Expected cart amount in the smallest currency unit, as set in /setup
    const expectedAmount = Number(numeral(req.session.totalCartAmount).format('0.00').replace('.', ''));

    // Check the payment intent has not already been used for an approved order
    const existingTransaction = await db.transactions.findOne({
        gateway: 'stripe',
        gatewayReference: paymentIntent.id,
        approved: true
    });

    // Only proceed when the intent was charged the exact session cart amount
    // in the configured currency and has not been replayed
    if(existingTransaction ||
        Number(paymentIntent.amount) !== expectedAmount ||
        String(paymentIntent.currency).toLowerCase() !== String(stripeConfig.stripeCurrency).toLowerCase()){
        req.session.paymentIntentId = null;
        req.session.messageType = 'danger';
        req.session.message = 'Unable to validate the payment. Please try again.';
        res.redirect('/checkout/payment');
        return;
    }

    // order status
    let paymentStatus = 'Paid';
    let approved = true;
    if(paymentIntent.status !== 'succeeded'){
        paymentStatus = 'Declined';
        approved = false;
    }

    // Create our transaction
    const transaction = await db.transactions.insertOne({
        gateway: 'stripe',
        gatewayReference: paymentIntent.id,
        gatewayMessage: paymentIntent.status,
        approved: approved,
        amount: req.session.totalCartAmount,
        currency: stripeConfig.stripeCurrency,
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
        orderType: paymentIntent.metadata.paymentType,
        transaction: transactionId
    };

    // insert order into DB
    const newOrder = await db.orders.insertOne(orderDoc);

    // get the new ID
    const orderId = newOrder.insertedId;

    // If a subscription payment
    if(orderDoc.orderType === 'subscription'){
        // Attach the payment method to the customer
        await stripe.paymentMethods.attach(paymentIntent.payment_method, {
            customer: paymentIntent.customer
        });

        // Update customers default payment method
        await stripe.customers.update(paymentIntent.customer, {
            invoice_settings: {
                default_payment_method: paymentIntent.payment_method
            }
        });

        // Create the subscription for the merchant
        await stripe.subscriptions.create({
            customer: paymentIntent.customer,
            items: [{
                price: req.session.cartSubscription
            }],
            metadata: {
                orderId: orderId.toString()
            }
        });
    }

    // Update order to transaction
    await db.transactions.updateOne({
        _id: getId(transactionId)
    }, {
        $set: {
            order: getId(orderId)
        }
    });

    // add to lunr index
    await indexOrders(req.app);
    // if approved, send email etc
    if(paymentIntent.status === 'succeeded'){
        // Consume the payment intent binding so it cannot be replayed
        req.session.paymentIntentId = null;

        // set the results
        req.session.messageType = 'success';
        req.session.message = 'Your payment was successfully completed';
        req.session.paymentEmailAddr = orderDoc.orderEmail;
        req.session.paymentApproved = true;
        req.session.paymentDetails = `<p><strong>Order ID: </strong>${orderId}</p><p><strong>Transaction ID: </strong>${paymentIntent.id}</p>`;

        // set payment results for email
        const paymentResults = {
            paymentId: orderId,
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

        // Return the outcome
        res.redirect(`/payment/${orderId}`);
        return;
    }
    // Return failure
    req.session.messageType = 'danger';
    req.session.message = 'Your payment has declined. Please try again';
    req.session.paymentApproved = false;
    req.session.paymentDetails = `<p><strong>Order ID: </strong>${orderId}</p><p><strong>Transaction ID: </strong>${paymentIntent.id}</p>`;
    res.redirect(`/payment/${orderId}`);
});

module.exports = router;
