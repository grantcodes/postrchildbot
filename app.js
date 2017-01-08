'use strict';

const restify = require('restify');
const plugins = require('restify-plugins');
const builder = require('botbuilder');
const request = require('request');
const Microformats = require('microformat-node');
const qs = require('querystring');

// Setup Restify Server
const server = restify.createServer();
server.use(plugins.acceptParser(server.acceptable));
server.use(plugins.queryParser());
server.use(plugins.bodyParser());
server.listen(process.env.port || process.env.PORT || 3978, () => {
  console.log('%s listening to %s', server.name, process.env.URL);
});

// Create chat bot
const connector = new builder.ChatConnector({
  appId: process.env.MICROSOFT_APP_ID,
  appPassword: process.env.MICROSOFT_APP_PASSWORD
});
const bot = new builder.UniversalBot(connector);
const intents = new builder.IntentDialog();

server.post('/bot', connector.listen());

server.get('/auth', (req, res, next) => {
  const me = req.query.me;
  const code = req.query.code;
  res.send('Paste this code into the chat: ' + code);
  return next();
});

//=========================================================
// Bots Dialogs
//=========================================================

const regexes = {
  quickPost: /^(post\s)/i,
};

bot.dialog('/', new builder.IntentDialog()
  .matchesAny([/^authenticate/i, /^authorize/i], '/authenticate')
  .matches(regexes.quickPost, '/instant-note')
  .matches(/^post/i, '/instant-note')
  // .matches(/^quickpost/i, '/instant-note')
  .matches(/^advancedpost/i, '/advanced-post')
  .onDefault(builder.DialogAction.send("I'm sorry. I didn't understand."))
);

bot.dialog('/instant-note', [
  (session, args, next) => {
    if (!session.userData.micropub || !session.userData.accessToken) {
      session.send('Whoa you dont seem to have an access token saved.');
      session.endDialog('Just type "authenticate" to get started');
    } else {
      if (session.message.text && session.message.text.match(regexes.quickPost)) {
        session.dialogData.content = session.message.text.replace(regexes.quickPost, '');
        next();
      } else {
        builder.Prompts.text(session, 'What do you want to post?');
      }
    }
  },
  (session, results, next) => {
    if (results.response) {
      session.dialogData.content = results.response;
    }
    if (session.dialogData.content.length > 140) {
      const extraLength = session.dialogData.content.length - 140;
      builder.Prompts.confirm(session, 'Whoa this post is ' + extraLength +' characters too long for twitter. Is that ok?');
    } else {
      next();
    }
  },
  (session, results) => {
    if (results.response === false) {
      session.endDialog('Ok I have cancelled that post. Feel free to try again');
    } else {
      session.endDialog('Sending post');
      micropub(session, {
        h: 'entry',
        content: session.dialogData.content,
      }).then((card) => {
        session.endDialog(card);
      }).catch((err) => {
        session.send('Uh oh. There was an error sending that');
        session.endDialog(JSON.stringify(err));
      });
    }
  }
]);

bot.dialog('/advanced-post', [
  (session, next) => {
    session.dialogData.data = {};
    builder.Prompts.choice(session, 'What sort of entry are you creating?', ['entry', 'card', 'event', 'cite']);
  },
  (session, results, next) => {
    session.dialogData.data.h = results.response.entity;
    builder.Prompts.text(session, 'Add a name (or skip)');
  },
  (session, results, next) => {
    if (results && results.response && results.response != 'skip') {
      session.dialogData.data.name = results.response;
    }
    builder.Prompts.text(session, 'Add a summary (or skip)');
  },
  (session, results, next) => {
    if (results && results.response && results.response != 'skip') {
      session.dialogData.data.summary = results.response;
    }
    builder.Prompts.text(session, 'Add content (or skip)');
  },
  (session, results, next) => {
    if (results && results.response && results.response != 'skip') {
      session.dialogData.data.content = results.response;
    }
    builder.Prompts.time(session, 'Add published time (you can say now)');
  },
  (session, results, next) => {
    if (results.response) {
      session.dialogData.data.published = builder.EntityRecognizer.resolveTime([results.response]);
    }
    builder.Prompts.text(session, 'Add categories (space seperated or skip)');
  },
  (session, results, next) => {
    if (results && results.response && results.response != 'skip') {
      session.dialogData.data.category = results.response.split(' ');
    }
    getSyndication(session).then((options) => {
      builder.Prompts.text(session, 'Any sydication options? Write any of ' + options.join(' ') + ' (space seperated or skip)');
    }).catch(() => {
      next();
    });
  },
  (session, results, next) => {
    if (results && results.response && results.results != 'skip') {
      session.dialogData.data['mp-syndicate-to'] = results.response.split(' ');
    }
    session.send(JSON.stringify(session.dialogData.data));
  }
]);

bot.dialog('/authenticate', [
  (session) => {
    session.send('Hello there! Lets get started with authenticating me with your site');
    builder.Prompts.text(session, 'What is your domain?');
  },
  (session, results) => {
    const userUrl = results.response;
    session.send(`Ok I'll try to authenticate at ${results.response}`);
    request.get(userUrl, (err, response, body) => {
      if (err) {
        session.send('There was an error accessing your site');
        console.log(err);
        session.endDialog();
      }
      if (!body) {
        session.send('Your site did not return a body');
        session.endDialog();
      }

      Microformats.get({
        html: body,
      }, (err, mfData) => {
        if (err) {
          session.send('There was an error getting your microformats data');
          console.log(err);
          session.endDialog();
        }

        if (mfData && mfData.rels && mfData.rels.authorization_endpoint && mfData.rels.token_endpoint && mfData.rels.micropub) {
          session.userData.authEndpoint = mfData.rels.authorization_endpoint[0];
          session.userData.tokenEndpoint = mfData.rels.token_endpoint[0];
          session.userData.micropub = mfData.rels.micropub[0];
          session.userData.me = userUrl;
          var authParams = {
            me: userUrl,
            client_id: process.env.URL,
            redirect_uri: process.env.URL + '/auth',
            response_type: 'code',
            scope: 'post',
          };

          var authUrl = mfData.rels.authorization_endpoint + '?' + qs.stringify(authParams);
          session.send(`Ok visit this link to authorize me: ${authUrl}`);
          builder.Prompts.text(session, 'Paste the code you get back to me');
        } else {
          session.send('Your site seems to be missing a required endpoint');
          session.endDialog();
        }
      });
    });
  },
  (session, results) => {
    const code = results.response;
    const form = {
      me: session.userData.me,
      code: code,
      scope: 'post',
      client_id: process.env.URL,
      redirect_uri: process.env.URL + '/auth',
    };
    request.post(session.userData.tokenEndpoint, {
      form: form,
    }, (err, response, body) => {
      if (err) {
        session.send('There was an error verifying your code.');
        console.log(err);
        session.endDialog();
      }

      if (response && response.statusCode !== 200) {
        session.send('There was an error verifying your code:');
        session.send(response.body);
        console.log(response.body);
        session.endDialog();
      }

      var bodyData = qs.parse(body);

      if (!bodyData.me) {
        session.send('Malformed response from authorization server.');
        session.endDialog();
      }

      session.userData.accessToken = bodyData.access_token;
      session.send('Ok I am now authenticated and ready to send micropub requests');
      session.endDialog();
    });
  }
]);

function micropub(session, data) {
  return new Promise((fulfill, reject) => {
    const options = {};
    options.url = session.userData.micropub;
    options.headers = {
      Authorization: `Bearer ${session.userData.accessToken}`,
    };
    options.form = data;
    request.post(options, (err, httpResponse, body) => {
      if (err || httpResponse.statusCode != 201) {
        console.log(err);
        console.log('Status code: ' + httpResponse.statusCode);
        reject(err);
      } else {
        let url = '';
        if (httpResponse && httpResponse.headers && httpResponse.headers.Location) {
          url = httpResponse.headers.Location;
        }
        const card = new builder.Message(session)
          .textFormat(builder.TextFormat.xml)
          .attachments([
            new builder.HeroCard(session)
              .title('Post Successful')
              .subtitle(data.name)
              .text(data.content)
              .tap(builder.CardAction.openUrl(session, url))
          ]);
        fulfill(card);
      }
    });
  });
}

function getSyndication(session) {
  return new Promise((fulfill, reject) => {
    const options = {};
    options.url = session.userData.micropub;
    options.headers = {
      Authorization: `Bearer ${session.userData.accessToken}`,
    };
    options.qs = {
      q: 'syndicate-to',
    };
    request.get(options, (err, httpResponse, body) => {
      if (err || httpResponse.statusCode != 200) {
        reject();
      } else {
        const result = qs.parse(body);
        fulfill(result['syndicate-to[]']);
      }
    });
  });
}
