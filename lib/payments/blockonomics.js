const express = require('express');
const { indexOrders } = require('../indexing');
const { getId, sendEmail, getEmailTemplate } = require('../common');
const { getPaymentConfig } = require('../config');
const router = express.Router();
const axios = require('axios').default;

router.get('/checkout_cancel', (req, res, next) => {
    // return to checkout for adjustment or repayment
    res.redirect('/checkout');
});

router.get('/checkout_return', async (req, res, next) => {
  const db = req.app.db;
  const config = req.app.config;
  const blockonomicsConfig = getPaymentConfig('blockonomics');

  const status = req.query.status || -1;
  const address = req.query.addr || 'na';

  if(Number(status) === 2){
    // the address is used as the order lookup key; refuse anything but a string
    if(typeof address !== 'string'){
      res.status(200).json({ err: 'Order not found' });
      return;
    }
    // we are interested only in final confirmations
    const order = await db.orders.findOne({ orderPaymentId: address });
    if(order){
      if(!blockonomicsConfig || !blockonomicsConfig.hostUrl || !blockonomicsConfig.searchHistoryApi || !blockonomicsConfig.apiKey){
        console.info('Blockonomics payment config incomplete blockonomics', address);
        res.status(200).json({ err: 'Unable to verify payment' });
        return;
      }
      // The Blockonomics callback is unauthenticated: status, value and txid
      // are all supplied by the caller and cannot be trusted. Use the callback
      // only as a notification and confirm the payment server-side through the
      // Blockonomics API (authenticated with the merchant API key) before
      // updating the order.
      let receivedSat = 0;
      let receivedTxid = null;
      try{
        const response = await axios.post(
          blockonomicsConfig.hostUrl + blockonomicsConfig.searchHistoryApi,
          { addr: address },
          { timeout: 10000, headers: { 'Content-Type': 'application/json', 'User-Agent': 'blockonomics', Accept: 'application/json', Authorization: `Bearer ${blockonomicsConfig.apiKey}` } }
        );
        const records = Array.isArray(response.data) ? response.data : [];
        for(const record of records){
          if(!record || record.addr !== address || !Array.isArray(record.history)){
            continue;
          }
          for(const tx of record.history){
            if(tx && tx.status === 'Confirmed' && tx.confirmations >= 2 && typeof tx.value === 'number' && tx.value > 0){
              receivedSat += tx.value;
              receivedTxid = tx.txid;
            }
          }
        }
      }catch(ex){
        console.info('Error verifying payment with blockonomics', ex);
        res.status(200).json({ err: 'Unable to verify payment' });
        return;
      }

      if(receivedSat >= Math.round(order.orderExpectedBtc * 1e8)){
        try{
            await db.orders.updateOne({
                _id: order._id },
                { $set: { orderStatus: 'Paid', orderReceivedBtc: receivedSat / 1e8, orderBlockonomicsTxid: receivedTxid }
            }, { multi: false });
            // if approved, send email etc
                    // set payment results for email
            const paymentResults = {
                message: 'Your payment was successfully completed',
                messageType: 'success',
                paymentEmailAddr: order.orderEmail,
                paymentApproved: true,
                paymentDetails: `<p><strong>Order ID: </strong>${order._id}</p><p><strong>Transaction ID: </strong>${order.orderPaymentId}</p>`
            };

            // send the email with the response
            // TODO: Should fix this to properly handle result
            sendEmail(req.session.paymentEmailAddr, `Your payment with ${config.cartTitle}`, getEmailTemplate(paymentResults));
            res.status(200).json({ err: '' });
        }catch(ex){
            console.info('Error updating status success blockonomics', ex);
            res.status(200).json({ err: 'Error updating status' });
        }
        return;
      }
      console.info('Payment not confirmed blockonomics', address);
      res.status(200).json({ err: 'Payment not confirmed' });
      return;
    }
    res.status(200).json({ err: 'Order not found' });
    console.info('Order not found blockonomics', address);
    return;
  }
  res.status(200).json({ err: 'Payment not final' });
  console.info('Payment not final blockonomics', address);
});

router.post('/checkout_action', (req, res, next) => {
  const blockonomicsConfig = getPaymentConfig('blockonomics');
  const config = req.app.config;
  const db = req.app.db;
  const blockonomicsParams = {};
  // get current rate
  axios
  .get(blockonomicsConfig.hostUrl + blockonomicsConfig.priceApi + config.currencyISO)
  .then((response) => {
    blockonomicsParams.expectedBtc = Math.round(req.session.totalCartAmount / response.data.price * Math.pow(10, 8)) / Math.pow(10, 8);
    // get new address
    axios
      .post(blockonomicsConfig.hostUrl + blockonomicsConfig.newAddressApi, {}, { headers: { 'Content-Type': 'application/json', 'User-Agent': 'blockonomics', Accept: 'application/json', Authorization: `Bearer ${blockonomicsConfig.apiKey}` } })
      .then((response) => {
          blockonomicsParams.address = response.data.address;
          blockonomicsParams.timestamp = Math.floor(new Date() / 1000);
          // create order with status Pending and save ref

            const orderDoc = {
                orderPaymentId: blockonomicsParams.address,
                orderPaymentGateway: 'Blockonomics',
                orderExpectedBtc: blockonomicsParams.expectedBtc,
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
                orderStatus: 'Pending',
                orderDate: new Date(),
                orderProducts: req.session.cart,
                orderType: 'Single'
            };
            db.orders.insertOne(orderDoc, (err, newDoc) => {
                if(err){
                    console.info(err.stack);
                }
                // get the new ID
                const newId = newDoc.insertedId;
                // add to lunr index
                indexOrders(req.app)
                .then(() => {
                    // set the order ID in the session, to link to it from blockonomics payment page
                    blockonomicsParams.pendingOrderId = newId;
                    req.session.blockonomicsParams = blockonomicsParams;
                    res.redirect('/blockonomics_payment');
              });
            });
      });
  });
});

module.exports = router;
