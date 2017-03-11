'use strict';

const fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');
const nunjucks = require('nunjucks');
const builder = require('botbuilder');
const request = require('request');
const Micropub = require('micropub-helper');
const cleanText = require('./lib/clean-text');
const cleanUrl = require('./lib/clean-url');
const micropubPromts = require('./lib/temp');

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

let micropub = new Micropub({
  clientId: appConfig.url,
  redirectUri: appConfig.url + '/auth',
  state: 'Super secret value',
});

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
  quickPost: /^post (.*)/i,
  quickJournal: /^journal (.*)/i,
};

bot.dialog('/', new builder.IntentDialog()
  .onBegin((session, args, next) => {
    session.send('Hello 🙋');
    session.send('I am the PostrChild bot 🤖 I am here to help you post to your micropub endpoint');
    if (!session.userData.micropub || !session.userData.accessToken) {
      session.send('It looks like your not set up to post yet let\'s get started with that');
      session.beginDialog('/authenticate');
    } else {
      session.send('It looks like you\'re already good to go 🙂 Just type "help" to see what I can do');
    }
  })
  .matchesAny([/^authenticate/i, /^authorize/i, /^auth/i], '/authenticate')
  .matchesAny([regexes.quickPost, /^post/i], '/instant-note')
  .matchesAny([regexes.quickJournal, /^journal/i], '/instant-journal')
  .matches(/^advancedpost/i, '/advanced-post')
  .matches(/^photo/i, '/photo')
  .matches(/^help/i, '/help')
  .matches(/^info/i, '/info')
  .onDefault(builder.DialogAction.send("🤷‍ I'm sorry. I didn't understand."))
);

bot.dialog('/instant-note', [
  (session, args, next) => {
    if (!session.userData.micropub || !session.userData.accessToken) {
      session.send('Whoa you dont seem to have an access token saved 🔐.');
      session.endDialog('Just type "authenticate" to get started');
    } else {
      session.dialogData.data = {};
      if (args && args.matched && args.matched[1] && args.matched[1].trim()) {
        let text = args.matched[1].trim();
        session.dialogData.data.content = cleanText(text, session.message.source);
      }
      next();
    }
  },
  ...micropubPromts.content,
  (session, results, next) => {
    session.sendTyping();
    micropub.options.micropubEndpoint = session.userData.micropub;
    micropub.options.token = session.userData.accessToken;
    micropub.create({
      h: 'entry',
      content: session.dialogData.data.content,
    }, 'form').then((url) => {
      const card = getSuccessCard(session, url, session.dialogData.content);
      session.endDialog(card);
    }).catch((err) => {
      session.send('Uh oh 😯. There was an error sending that');
      session.endDialog(JSON.stringify(err));
    });
  }
]);

bot.dialog('/instant-journal', [
  (session, args, next) => {
    if (!session.userData.micropub || !session.userData.accessToken) {
      session.send('Whoa you dont seem to have an access token saved 🔐.');
      session.endDialog('Just type "authenticate" to get started');
    } else {
      session.dialogData.data = {};
      if (args && args.matched && args.matched[1] && args.matched[1].trim()) {
        let text = args.matched[1].trim();
        session.dialogData.data.content = cleanText(text, session.message.source);
      }
      next();
    }
  },
  ...micropubPromts.content,
  (session, results) => {
    session.sendTyping();
    micropub.options.micropubEndpoint = session.userData.micropub;
    micropub.options.token = session.userData.accessToken;
    micropub.create({
      h: 'entry',
      content: session.dialogData.data.content,
      category: ['journal', 'private'],
    }, 'form').then((url) => {
      const card = getSuccessCard(session, url, session.dialogData.content);
      session.endDialog(card);
    }).catch((err) => {
      session.send('Uh oh 😯. There was an error sending that');
      session.endDialog(JSON.stringify(err));
    });
  }
]);

bot.dialog('/photo', [
  (session, args, next) => {
    if (!session.userData.micropub || !session.userData.accessToken) {
      session.send('Whoa you dont seem to have an access token saved 🔐.');
      session.endDialog('Just type "authenticate" to get started');
    } else {
      session.dialogData.data = {
        h: 'entry',
      };
      next();
    }
  },
  ...micropubPromts.photo,
  ...micropubPromts.name,
  ...micropubPromts.content,
  (session, results, next) => {
    session.sendTyping();
    micropub.options.micropubEndpoint = session.userData.micropub;
    micropub.options.token = session.userData.accessToken;
    const tempLocation = Math.random().toString(36).substring(7);
    request(session.dialogData.data.photo)
      .pipe(fs.createWriteStream(tempLocation))
      .on('error', () => {
        session.endDialog('Uh oh 😯. There was an error sending that');
      })
      .on('finish', () => {
        session.sendTyping();
        let post = Object.assign({}, session.dialogData.data);
        post.photo = fs.createReadStream(tempLocation);
        micropub.create(post, 'multipart').then((url) => {
          fs.unlink(tempLocation);
          const card = getSuccessCard(session, url, session.dialogData.data.content, session.dialogData.data.name);
          session.endDialog(card);
        }).catch((err) => {
          session.send('Uh oh 😯. There was an error sending that');
          session.endDialog(JSON.stringify(err));
        });
      })
  }
]);

bot.dialog('/advanced-post', [
  (session, results, next) => {
    if (!session.userData.micropub || !session.userData.accessToken) {
      session.send('Whoa you dont seem to have an access token saved 🔐.');
      session.endDialog('Just type "authenticate" to get started');
    } else {
      session.dialogData.data = {};
      session.dialogData.source = false;
      if (session.message && session.message.source) {
        session.dialogData.source = session.message.source;
      }
      next();
    }
  },
  ...micropubPromts.h,
  ...micropubPromts.name,
  ...micropubPromts.summary,
  ...micropubPromts.content,
  ...micropubPromts.published,
  ...micropubPromts.category,
  ...micropubPromts.inReplyTo,
  ...micropubPromts.likeOf,
  ...micropubPromts.repostOf,
  ...micropubPromts.photoConfirm,
  ...micropubPromts.mpSyndicateTo,
  (session, results, next) => {
    session.sendTyping();
    micropub.options.micropubEndpoint = session.userData.micropub;
    micropub.options.token = session.userData.accessToken;
    micropub.create(session.dialogData.data, 'multipart').then((url) => {
      const card = getSuccessCard(session, url, session.dialogData.data.content, session.dialogData.data.name);
      session.endDialog(card);
    }).catch((err) => {
      session.send('Uh oh 😯. There was an error sending that');
      session.endDialog(JSON.stringify(err));
    });
  }
]);

bot.dialog('/authenticate', [
  (session) => {
    session.send('Lets get started with authenticating me with your site');
    builder.Prompts.text(session, 'What is your domain?');
  },
  (session, results) => {
    session.sendTyping();
    const userUrl = cleanUrl(results.response);
    session.send(`Ok I'll try to authenticate at ${userUrl}`);
    micropub.options.me = userUrl;
    micropub.getAuthUrl()
      .then((url) => {
        session.send(`Ok visit this link to authorize me 🔏: ${url}`);
        builder.Prompts.text(session, 'Paste the code you get back to me ');
      })
      .catch((err) => session.endDialog(err));
  },
  (session, results) => {
    const code = results.response;
    session.sendTyping();
    micropub.getToken(results.response)
      .then((token) => {
        console.log(token);
        session.userData.accessToken = token;
        session.userData.micropub = micropub.options.micropubEndpoint;
        session.endDialog('Ok I am now authenticated and ready to send micropub requests 🎉');
      })
      .catch((err) => session.endDialog(err));
  }
]);

bot.dialog('/help', [
  (session) => {
    session.send('Here\'s what I can do ℹ:');
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
    session.send('I am a chatbot 🤖 developed by Grant Richmond 👨🏻‍💻 - https://grant.codes');
    session.send('I am built 🛠 in nodejs and run on the Microsoft BotFramework.');
    session.send('You can see my source code and contribute improvements and fixes 🏥 on GitHub https://github.com/terminalpixel/postrchildbot');
    session.endDialog('You might find a little more information on my website: https://postrchild.tpxl.io');
  },
]);

function getSuccessCard(session, url, text = false, subtitle = false) {
  let card = new builder.HeroCard(session).title('Post Successful');
  if (url) {
    card.tap(builder.CardAction.openUrl(session, url));
  }
  if (text) {
    card.text(text);
  }
  if (subtitle) {
    card.subtitle(subtitle);
  }
  const response = new builder.Message(session)
    .textFormat(builder.TextFormat.xml)
    .attachments([card]);
  return response;
}
