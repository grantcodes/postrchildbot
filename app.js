'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const nunjucks = require('nunjucks');
const builder = require('botbuilder');
const request = require('request');
const Microformats = require('microformat-node');
const qs = require('querystring');

// Setup express server for html site
const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

nunjucks.configure('views', {
  autoescape: true,
  express: app,
});

const appConfig = {
  port: process.env.port || process.env.PORT || 3978,
  url: process.env.URL || 'http://localhost:3978',
};

app.listen(appConfig.port, () => {
  console.log('%s listening to %s', app.name, appConfig.url);
});

// Create chat bot
const connector = new builder.ChatConnector({
  appId: process.env.MICROSOFT_APP_ID,
  appPassword: process.env.MICROSOFT_APP_PASSWORD
});
const bot = new builder.UniversalBot(connector);
const intents = new builder.IntentDialog();

app.post('/bot', connector.listen());

app.get('/', (req, res) => {
  res.render('home.njk');
});

app.get('/auth', (req, res) => {
  const me = req.query.me;
  const code = req.query.code;
  res.render('auth.njk', {code: code});
});

//=========================================================
// Bots Dialogs
//=========================================================

const regexes = {
  quickPost: /^(post\s)/i,
  quickJournal: /^(journal\s)/i,
};

bot.dialog('/', new builder.IntentDialog()
  .matchesAny([/^authenticate/i, /^authorize/i, /^auth/i], '/authenticate')
  .matchesAny([regexes.quickPost, /^post/i], '/instant-note')
  .matchesAny([regexes.quickJournal, /^journal/i], '/instant-journal')
  .matches(/^advancedpost/i, '/advanced-post')
  .matches(/^help/i, '/help')
  .matches(/^info/i, '/info')
  .onDefault(builder.DialogAction.send("I'm sorry. I didn't understand."))
);

bot.dialog('/instant-note', [
  (session, args, next) => {
    if (!session.userData.micropub || !session.userData.accessToken) {
      session.send('Whoa you dont seem to have an access token saved.');
      session.endDialog('Just type "authenticate" to get started');
    } else {
      if (session.message.text && session.message.text.match(regexes.quickPost)) {
        let text = session.message.text.replace(regexes.quickPost, '');
        session.dialogData.content = cleanText(text, session.message.source);
        next();
      } else {
        builder.Prompts.text(session, 'What do you want to post?');
      }
    }
  },
  (session, results, next) => {
    if (results.response) {
      session.dialogData.content = cleanText(results.response, session.message.source);
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
      session.send('Sending post');
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

bot.dialog('/instant-journal', [
  (session, args, next) => {
    if (!session.userData.micropub || !session.userData.accessToken) {
      session.send('Whoa you dont seem to have an access token saved.');
      session.endDialog('Just type "authenticate" to get started');
    } else {
      if (session.message.text && session.message.text.match(regexes.quickJournal)) {
        let text = session.message.text.replace(regexes.quickJournal, '');
        session.dialogData.content = cleanText(text, session.message.source);
        next();
      } else {
        builder.Prompts.text(session, 'What do you want to journal?');
      }
    }
  },
  (session, results) => {
    if (results.response) {
      session.dialogData.content = cleanText(results.response, session.message.source);
    }
    session.send('Sending journal entry');
    micropub(session, {
      h: 'entry',
      content: session.dialogData.content,
      category: ['journal', 'private'],
    }).then((card) => {
      session.endDialog(card);
    }).catch((err) => {
      session.send('Uh oh. There was an error sending that');
      session.endDialog(JSON.stringify(err));
    });
  }
]);

bot.dialog('/advanced-post', [
  (session, next) => {
    session.dialogData.data = {};
    session.dialogData.source = false;
    if (session.message && session.message.source) {
      session.dialogData.source = session.message.source;
    }
    builder.Prompts.choice(session, 'What sort of entry are you creating?', ['entry', 'card', 'event', 'cite']);
  },
  (session, results, next) => {
    session.dialogData.data.h = results.response.entity;
    builder.Prompts.text(session, 'Add a name (or skip)');
  },
  (session, results, next) => {
    if (results && results.response && results.response != 'skip') {
      session.dialogData.data.name = cleanText(results.response, session.dialogData.source);
    }
    builder.Prompts.text(session, 'Add a summary (or skip)');
  },
  (session, results, next) => {
    if (results && results.response && results.response != 'skip') {
      session.dialogData.data.summary = cleanText(results.response, session.dialogData.source);
    }
    builder.Prompts.text(session, 'Add content (or skip)');
  },
  (session, results, next) => {
    if (results && results.response && results.response != 'skip') {
      session.dialogData.data.content = cleanText(results.response, session.dialogData.source);
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
    builder.Prompts.text(session, 'Add in-reply-to (or skip)');
  },
  (session, results, next) => {
    if (results && results.response && results.response != 'skip') {
      session.dialogData.data['in-reply-to'] = cleanUrl(results.response);
    }
    builder.Prompts.text(session, 'Add like-of (or skip)');
  },
  (session, results, next) => {
    if (results && results.response && results.response != 'skip') {
      session.dialogData.data['like-of'] = cleanUrl(results.response);
    }
    builder.Prompts.text(session, 'Add repost-of (or skip)');
  },
  (session, results, next) => {
    if (results && results.response && results.response != 'skip') {
      session.dialogData.data['repost-of'] = cleanUrl(results.response);
    }
    builder.Prompts.confirm(session, 'Do you want to add an image?');
  },
  (session, results, next) => {
    if (results && results.response) {
      builder.Prompts.attachment(session, 'Attach an image');
    } else {
      next();
    }
  },
  (session, results, next) => {
    if (results && results.response && results.response[0] && results.response[0].contentUrl) {
      // results.response[0].name;
      // results.response[0].contentType;
      // results.response[0].contentUrl;
      session.dialogData.data.photo = results.response[0].contentUrl;
    }
    next();
  },
  (session, results, next) => {
    getSyndication(session).then((options) => {
      builder.Prompts.text(session, 'Any sydication options? Write any of ' + options.join(' ') + ' (space seperated or skip)');
    }).catch(() => {
      next();
    });
  },
  (session, results, next) => {
    if (results && results.response && results.response != 'skip') {
      session.dialogData.data['mp-syndicate-to'] = cleanText(results.response, session.message.source).split(' ');
    }
    session.send('Sending post');
    micropub(session, session.dialogData.data).then((card) => {
      session.endDialog(card);
    }).catch((err) => {
      session.send('Uh oh. There was an error sending that');
      session.endDialog(JSON.stringify(err));
    });
  }
]);

bot.dialog('/authenticate', [
  (session) => {
    session.send('Hello there! Lets get started with authenticating me with your site');
    builder.Prompts.text(session, 'What is your domain?');
  },
  (session, results) => {
    const userUrl = cleanUrl(results.response);
    session.send(`Ok I'll try to authenticate at ${results.response}`);
    request.get(userUrl, (err, response, body) => {
      if (err) {
        console.log(err);
        session.endDialog('There was an error accessing your site');
      }
      if (!body) {
        session.endDialog('Your site did not return a body');
      }

      Microformats.get({
        html: body,
      }, (err, mfData) => {
        if (err) {
          console.log(err);
          session.endDialog('There was an error getting your microformats data');
        }

        if (mfData && mfData.rels && mfData.rels.authorization_endpoint && mfData.rels.token_endpoint && mfData.rels.micropub) {
          session.userData.authEndpoint = mfData.rels.authorization_endpoint[0];
          session.userData.tokenEndpoint = mfData.rels.token_endpoint[0];
          session.userData.micropub = mfData.rels.micropub[0];
          session.userData.me = userUrl;
          var authParams = {
            me: userUrl,
            client_id: appConfig.url,
            redirect_uri: appConfig.url + '/auth',
            response_type: 'code',
            scope: 'post',
          };

          var authUrl = mfData.rels.authorization_endpoint + '?' + qs.stringify(authParams);
          session.send(`Ok visit this link to authorize me: ${authUrl}`);
          builder.Prompts.text(session, 'Paste the code you get back to me');
        } else {
          session.endDialog('Your site seems to be missing a required endpoint');
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
      client_id: appConfig.url,
      redirect_uri: appConfig.url + '/auth',
    };
    request.post(session.userData.tokenEndpoint, {
      form: form,
    }, (err, response, body) => {
      if (err) {
        console.log(err);
        session.endDialog('There was an error verifying your code.');
      }

      if (response && response.statusCode !== 200) {
        console.log(response.body);
        session.send('There was an error verifying your code:');
        session.endDialog(response.body);
      }

      var bodyData = qs.parse(body);

      if (!bodyData.me) {
        session.endDialog('Malformed response from authorization server.');
      }

      session.userData.accessToken = bodyData.access_token;
      session.endDialog('Ok I am now authenticated and ready to send micropub requests');
    });
  }
]);

bot.dialog('/help', [
  (session) => {
    session.send('Here\'s what I can do:');
    const helpCard = new builder.Message(session)
      .attachments([
        new builder.HeroCard(session)
          .title('PostrChild Help')
          .buttons([
            builder.CardAction.imBack(session, 'post', 'Post a simple note'),
            builder.CardAction.imBack(session, 'journal', 'Post a simple note with the categories journal and private'),
            builder.CardAction.imBack(session, 'advancedpost', 'Post an advanced post'),
            builder.CardAction.imBack(session, 'auth', 'Authenticate with your micropub endpoint'),
            builder.CardAction.imBack(session, 'help', 'Show this help message'),
          ])
      ]);
    session.send(helpCard);
    session.endDialog('Or to quickly post a note just prepend your content with the post keyword and it will be posted instantly (post ****)');
  },
]);

bot.dialog('/info', [
  (session) => {
    session.send('Let me tell you a little bit about myself.');
    session.send('I am a chatbot developed by Grant Richmond - https://grant.codes');
    session.send('I am built in nodejs and run on the Microsoft BotFramework.');
    session.send('You can see my source code and contribute improvements and fixes on GitHub https://github.com/terminalpixel/postrchildbot');
    session.endDialog('You might find a little more information on my website: https://postrchild.tpxl.io');
  },
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

function cleanUrl(url) {
  url = url.trim();
  if (url.charAt(0) == '<') {
    url = url.substr(1);
  }
  if (url.charAt(url.length - 1 == '>')) {
    url = url.substring(0, url.length - 1);
  }
  return url;
}

function cleanText(text, service) {
  if ('slack' == service) {
    text = text.replace('<', '');
    text = text.replace('>', '');
  }
  return text;
}
