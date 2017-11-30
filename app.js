/*
 * Copyright 2016-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/* jshint node: true, devel: true */
'use strict';

const
  bodyParser = require('body-parser'),
  config = require('config'),
  crypto = require('crypto'),
  express = require('express'),
  https = require('https'),
  request = require('request'),
  mongoose = require('mongoose'),
  cheerio = require('cheerio'),
  _ = require('lodash');

var app = express();
app.set('port', process.env.PORT || 5000);
app.set('view engine', 'ejs');
app.use(bodyParser.json({ verify: verifyRequestSignature }));
app.use(express.static('public'));

/*
 * Open config/default.json and set your config values before running this code. 
 * You can also set them using environment variables.
 *
 */

// App Secret can be retrieved from the App Dashboard
const FB_APP_SECRET = (process.env.FB_APP_SECRET) ?
  process.env.FB_APP_SECRET :
  config.get('fb_appSecret');

// Arbitrary value used to validate a webhook
const FB_VALIDATION_TOKEN = (process.env.FB_VALIDATION_TOKEN) ?
  (process.env.FB_VALIDATION_TOKEN) :
  config.get('fb_validationToken');

// Generate a page access token for your page from the App Dashboard
const FB_PAGE_ACCESS_TOKEN = (process.env.FB_PAGE_ACCESS_TOKEN) ?
  (process.env.FB_PAGE_ACCESS_TOKEN) :
  config.get('fb_pageAccessToken');

const ALPHA_TOKEN = (process.env.ALPHA_TOKEN) ?
  (process.env.ALPHA_TOKEN) :
  config.get('alpha_vantage_token')

const HOST_URL = (process.env.HOST_URL) ?
  process.env.HOST_URL :
  config.get('host_url');

// make sure that everything has been properly configured
if (!(FB_APP_SECRET && FB_VALIDATION_TOKEN && FB_PAGE_ACCESS_TOKEN && ALPHA_TOKEN && HOST_URL)) {
  console.error("Missing config values");
  process.exit(1);
}


/*
 * Verify that the callback came from Facebook. Using the App Secret from 
 * your App Dashboard, we can verify the signature that is sent with each 
 * callback in the x-hub-signature field, located in the header.
 *
 * https://developers.facebook.com/docs/graph-api/webhooks#setup
 *
 */
function verifyRequestSignature(req, res, buf) {
  var signature = req.headers["x-hub-signature"];

  if (!signature) {
    // In DEV, log an error. In PROD, throw an error.
    console.error("Couldn't validate the signature.");
  } else {
    var elements = signature.split('=');
    var method = elements[0];
    var signatureHash = elements[1];

    var expectedHash = crypto.createHmac('sha1', FB_APP_SECRET)
      .update(buf)
      .digest('hex');

    //console.log("signatureHash: " + signatureHash);
    //console.log("expectedHash: " + expectedHash);

    if (signatureHash != expectedHash) {
      throw new Error("Couldn't validate the request signature.");
    }
  }
}

/*
 * Use your own validation token. Check that the token used in the Webhook 
 * setup is the same token used here.
 *
 */
app.get('/webhook', function (req, res) {
  if (req.query['hub.mode'] === 'subscribe' &&
    req.query['hub.verify_token'] === FB_VALIDATION_TOKEN) {
    // console.log("[app.get] Validating webhook");
    res.status(200).send(req.query['hub.challenge']);
  } else {
    console.error("Failed validation. Make sure the validation tokens match.");
    res.sendStatus(403);
  }
});

/*
 * All callbacks for Messenger are POST-ed. They will be sent to the same
 * webhook. Be sure to subscribe your app to your page to receive callbacks
 * for your page. 
 * https://developers.facebook.com/docs/messenger-platform/product-overview/setup#subscribe_app
 *
 */
app.post('/webhook', function (req, res) {
  // You must send back a status 200 to let the Messenger Platform know that you've
  // received the callback. Do that right away because the countdown doesn't stop when 
  // you're paused on a breakpoint! Otherwise, the request might time out. 
  res.sendStatus(200);

  var data = req.body;

  // Make sure this is a page subscription
  if (data.object == 'page') {
    // entries may be batched so iterate over each one
    data.entry.forEach(function (pageEntry) {
      var pageID = pageEntry.id;
      var timeOfEvent = pageEntry.time;

      // iterate over each messaging event
      pageEntry.messaging.forEach(function (messagingEvent) {

        let propertyNames = [];
        for (var prop in messagingEvent) { propertyNames.push(prop) }
        // console.log("[app.post] Webhook received a messagingEvent with properties: ", propertyNames.join());
        if (messagingEvent.message) {
          // someone sent a message
          receivedMessage(messagingEvent);

        } else if (messagingEvent.delivery) {
          // messenger platform sent a delivery confirmation
          receivedDeliveryConfirmation(messagingEvent);

        } else if (messagingEvent.postback) {
          // user replied by tapping one of our postback buttons
          receivedPostback(messagingEvent);

        } else {
          // console.log("[app.post] Webhook is not prepared to handle this message.");

        }
      });
    });
  }
});
/*
//POPULATE DATABASE WITH SHOPIFY JSON FILE 
// var products_url = 'https://52e82a861b0ca05d7541b01262a0da34:4cf5481969535398711eaba9d3b63ea0@dev-circle-toronto-hackathon.myshopify.com/admin/products.json';
shopify.product.list().then(
  (product_list) => {
    product_list.forEach(function (element) {
      _.split(element.tags.toLowerCase(), ', ').forEach(function (key) {
        if (product_tag_keywords.indexOf(key) == -1) {
          product_tag_keywords.push(key);
        }
      });
      Product.find({ 'id': element.id }, function (err, found) {
        if (!found) {
          var newProduct = {
            id: element.id,
            title: element.title,
            image_src: element.images[0].src,
            product_type: element.product_type,
            tags: _.split(element.tags.toLowerCase(), ', '),
            handle: element.handle
          };

          Product.create(newProduct, function (err, newProduct) {
            if (err) {
              console.log(err);
            } else {

              // console.log(newProduct);
            }
          })
        }
      }
      )

    }
    )
  }
)
*/

/*
const sectionButton = function (title, action, options) {
  var payload = options | {};
  payload = Object.assign(options, { action: action });
  return {
    type: 'postback',
    title: title,
    payload: JSON.stringify(payload)
  };
}
*?
/*
 * Message Event
 *
 * This event is called when a message is sent to your page. The 'message' 
 * object format can vary depending on the kind of message that was received.
 * Read more at https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-received
 * 
 */
async function receivedMessage(event) {
  console.log(event);
  var senderID = event.sender.id;
  var pageID = event.recipient.id;
  var timeOfMessage = event.timestamp;
  var message = event.message;
  var options = {
    host: 'graph.facebook.com',
    method: 'GET',
    path: '/v2.6/' + senderID + '?fields=first_name,last_name,profile_pic&access_token=' + FB_PAGE_ACCESS_TOKEN
  };
  console.log(senderID);
  // console.log("[receivedMessage] user (%d) page (%d) timestamp (%d) and message (%s)",
  // senderID, pageID, timeOfMessage, JSON.stringify(message));



  if (message.quick_reply) {
    // console.log("[receivedMessage] quick_reply.payload (%s)",
    // message.quick_reply.payload);
    handleQuickReplyResponse(event);
    return;
  }

  var messageText = message.text;
  var isEcho = message.is_echo;

  if (messageText && !isEcho) {

    var intent = firstEntity(message.nlp, 'intent');

    // if (intent && intent.confidence > 0.8 && intent.value == 'product_get') {
    //   sendHelpOptionsAsButtonTemplates(senderID);
    // }
    //sendTextMessage(senderID, message.text);
    console.log(message.text);
    stock_price(message.text, ALPHA_TOKEN, function (res) {
      console.log(res);
      sendTextMessage(senderID, res);
    });

  }
}

//SHOP API
/*
 * Someone tapped one of the Quick Reply buttons so 
 * respond with the appropriate content
 *
 */
function handleQuickReplyResponse(event) {
  // console.log( " [handleQuickReplyResponse]", event);
  var senderID = event.sender.id;
  var pageID = event.recipient.id;
  var message = event.message;
  var quickReplyPayload = message.quick_reply.payload;

  // console.log("[handleQuickReplyResponse] Handling quick reply response (%s) from sender (%d) to page (%d) with message (%s)",
  // quickReplyPayload, senderID, pageID, JSON.stringify(message));

  // use branched conversation with one interaction per feature (each of which contains a variable number of content pieces)
  respondToHelpRequestWithTemplates(senderID, quickReplyPayload);

}

/*
 * This response uses templateElements to present the user with a carousel
 * You send ALL of the content for the selected feature and they can 
 * swipe from side to side to see it
 *
 */

/*
 * Delivery Confirmation Event
 *
 * This event is sent to confirm the delivery of a message. Read more about 
 * these fields at https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-delivered
 *
 */
function receivedDeliveryConfirmation(event) {
  var senderID = event.sender.id; // the user who sent the message
  var recipientID = event.recipient.id; // the page they sent it from
  var delivery = event.delivery;
  var messageIDs = delivery.mids;
  var watermark = delivery.watermark;
  var sequenceNumber = delivery.seq;

  if (messageIDs) {
    messageIDs.forEach(function (messageID) {
      console.log("[receivedDeliveryConfirmation] Message with ID %s was delivered",
        messageID);
    });
  }

  // console.log("[receivedDeliveryConfirmation] All messages before timestamp %d were delivered.", watermark);
}

/*
 * Postback Event
 *
 * This event is called when a postback is tapped on a Structured Message. 
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/postback-received
 * 
 */
function receivedPostback(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfPostback = event.timestamp;

  // The 'payload' param is a developer-defined field which is set in a postback 
  // button for Structured Messages. 
  var payload = event.postback.payload;

  console.log("[receivedPostback] from user (%d) on page (%d) with payload ('%s') " +
    "at (%d)", senderID, recipientID, payload, timeOfPostback);
}

/*
 * Send a text message using the Send API.
 *
 */
function sendTextMessage(recipientId, messageText) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: messageText, // utf-8, 640-character max
      metadata: "DEVELOPER_DEFINED_METADATA"
    }
  };

  callSendAPI(messageData);
}

/*
 * Call the Send API. The message data goes in the body. If successful, we'll 
 * get the message id in a response 
 *
 */
function callSendAPI(messageData) {
  request({
    uri: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: FB_PAGE_ACCESS_TOKEN },
    method: 'POST',
    json: messageData

  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var recipientId = body.recipient_id;
      var messageId = body.message_id;

      if (messageId) {
        console.log("[callSendAPI] Successfully sent message with id %s to recipient %s",
          messageId, recipientId);
      } else {
        console.log("[callSendAPI] Successfully called Send API for recipient %s",
          recipientId);
      }
    } else {
      console.error("[callSendAPI] Send API call failed", response.statusCode, response.statusMessage, body.error);
    }
  });
}

/*
 * Send profile info. This will setup the bot with a greeting and a Get Started button
 */
function callSendProfile() {
  request({
    uri: 'https://graph.facebook.com/v2.6/me/messenger_profile',
    qs: { access_token: FB_PAGE_ACCESS_TOKEN },
    method: 'POST',
    json: {
      "greeting": [
        {
          "locale": "default",
          "text": `Hi there! I'm a bot here to assist you with Candyboxx's Shopify store. To get started, click the "Get Started" button or type "help".`
        }
      ],
      "get_started": {
        "payload": JSON.stringify({ action: 'QR_GET_PRODUCT_LIST', limit: 3 })
      },
      "whitelisted_domains": [
        HOST_URL
      ]
    }

  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      // console.log("[callSendProfile]: ", body);
      var result = body.result;
      if (result === 'success') {
        // console.log("[callSendProfile] Successfully sent profile.");
      } else {
        console.error("[callSendProfile] There was an error sending profile.");
      }
    } else {
      console.error("[callSendProfile] Send profile call failed", response.statusCode, response.statusMessage, body.error);
    }
  });
}

/*
 * Start server
 * Webhooks must be available via SSL with a certificate signed by a valid 
 * certificate authority.
 */
app.listen(app.get('port'), function () {
  console.log('[app.listen] Node app is running on port', app.get('port'));
  callSendProfile();
});

module.exports = app;

function firstEntity(nlp, name) {
  return nlp && nlp.entities && nlp.entities && nlp.entities[name] && nlp.entities[name][0];
}

function stock_api(type, symbol, interval = '5min', apikey, callback) {
  var request_string = `https://www.alphavantage.co/queryy?function=${type}&symbol=${symbol}&interval=${interval}&apikey=${apikey}`;
  console.log(request_string);
  request.get({
    url: request_string,
    json: true,
    headers: { 'User-Agent': 'request' }
  }, (err, res, data) => {
    if (err) {
      console.log('Error:', err);
    } else if (res.statusCode !== 200) {
      console.log('Status:', res.statusCode);
    } else {
      //console.log(data);
      return callback(data);
    }
  });
}

function stock_price(symbol, apikey, callback) {
  var type = 'TIME_SERIES_INTRADAY';
  var interval = '1min';
  function filter(res) {
    var data = res['Time Series (1min)']
    var last_price = data[Object.keys(data)[0]]['4. close']
    return callback(last_price);
  }
  stock_api(type, symbol, interval, apikey, filter);
  tmx_money(symbol, callback);

}


function tmx_money(symbol, callback) {
  var url = `https://web.tmxmoney.com/quote.php?qm_symbol=${symbol}`;
  request.get(url, function (err, response, html) {
    if (!err) {
      var page = cheerio.load(html);
      var price = page('.quote-price').text();
      console.log(price);
      callback(price);
    }

  });
}