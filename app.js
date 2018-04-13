const fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');
const nunjucks = require('nunjucks');
const builder = require('botbuilder');
const request = require('request');
const Micropub = require('micropub-helper');
const cleanText = require('./lib/clean-text');
const cleanUrl = require('./lib/clean-url');
const getMicropubPromts = require('./lib/prompts');
const Storage = require('./lib/storage');
const config = require('./lib/config');

// Setup express server for html site
const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

nunjucks.configure('views', {
  autoescape: true,
  express: app,
});

let micropub = new Micropub({
  clientId: config.get('url'),
  redirectUri: config.get('url') + '/auth',
  state: config.get('secret'),
});
const micropubPromts = getMicropubPromts(micropub);

app.listen(config.get('port'), () => {
  console.log('%s listening to %s', app.name, config.get('url'));
});

// Create chat bot
const connector = new builder.ChatConnector({
  appId: config.get('appId'),
  appPassword: config.get('appPassword'),
});
const storage = new Storage();
const bot = new builder.UniversalBot(connector).set('storage', storage);
const intents = new builder.IntentDialog();

app.post('/bot', connector.listen());

app.get('/', (req, res) => {
  res.render('home.njk');
});

app.get('/auth', (req, res) => {
  const me = req.query.me;
  const code = req.query.code;
  res.render('auth.njk', { code: code });
});

//=========================================================
// Bots Dialogs
//=========================================================

const regexes = {
  quickPost: /^post (.*)/i,
  quickJournal: /^journal (.*)/i,
  url: /(http(s)?:\/\/.)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/,
};

bot.dialog(
  '/',
  new builder.IntentDialog()
    .onBegin((session, args, next) => {
      if (!session.userData.micropub || !session.userData.accessToken) {
        session.send('Hello 🙋');
        session.send(
          'I am the PostrChild bot 🤖 I am here to help you post to your micropub endpoint',
        );
        session.replaceDialog('/authenticate');
      } else {
        next();
      }
    })
    .matchesAny([/^authenticate/i, /^authorize/i, /^auth/i], '/authenticate')
    .matchesAny([regexes.quickPost, /^post/i], '/instant-note')
    .matchesAny([regexes.quickJournal, /^journal/i], '/instant-journal')
    .matches(/^advancedpost/i, '/advanced-post')
    .matches(/^photo/i, '/photo')
    .matches(/^rsvp/i, '/rsvp')
    .matches(/^help/i, '/help')
    .matches(/^info/i, '/info')
    .matches(regexes.url, '/shared-url')
    .onDefault('/not-understood'),
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
        session.dialogData.data.content = cleanText(
          text,
          session.message.source,
        );
      }
      next();
    }
  },
  ...micropubPromts.content,
  (session, results, next) => {
    session.sendTyping();
    micropub.options.micropubEndpoint = session.userData.micropub;
    micropub.options.token = session.userData.accessToken;
    micropub
      .create(
        {
          h: 'entry',
          content: session.dialogData.data.content,
        },
        'form',
      )
      .then(url => {
        const card = getSuccessCard(
          session,
          url,
          session.dialogData.data.content,
        );
        session.endDialog(card);
      })
      .catch(err => {
        session.send('Uh oh 😯. There was an error sending that');
        session.endDialog(err.message);
      });
  },
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
        session.dialogData.data.content = cleanText(
          text,
          session.message.source,
        );
      }
      next();
    }
  },
  ...micropubPromts.content,
  (session, results) => {
    session.sendTyping();
    micropub.options.micropubEndpoint = session.userData.micropub;
    micropub.options.token = session.userData.accessToken;
    micropub
      .create(
        {
          h: 'entry',
          content: session.dialogData.data.content,
          category: ['journal', 'private'],
        },
        'form',
      )
      .then(url => {
        const card = getSuccessCard(
          session,
          url,
          session.dialogData.data.content,
        );
        session.endDialog(card);
      })
      .catch(err => {
        session.send('Uh oh 😯. There was an error sending that');
        session.endDialog(err.message);
      });
  },
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
      if (typeof args == 'string') {
        session.dialogData.data.photo = args;
      }
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
    const tempLocation = Math.random()
      .toString(36)
      .substring(7);
    request(session.dialogData.data.photo)
      .pipe(fs.createWriteStream(tempLocation))
      .on('error', () => {
        session.endDialog('Uh oh 😯. There was an error sending that');
      })
      .on('finish', () => {
        session.sendTyping();
        let post = Object.assign({}, session.dialogData.data);
        post.photo = fs.createReadStream(tempLocation);
        micropub
          .create(post, 'multipart')
          .then(url => {
            fs.unlink(tempLocation);
            const card = getSuccessCard(
              session,
              url,
              session.dialogData.data.content,
              session.dialogData.data.name,
            );
            session.endDialog(card);
          })
          .catch(err => {
            session.send('Uh oh 😯. There was an error sending that');
            session.endDialog(err.message);
          });
      });
  },
]);

bot.dialog('/shared-url', [
  (session, results, next) => {
    if (!session.userData.micropub || !session.userData.accessToken) {
      session.send('Whoa you dont seem to have an access token saved 🔐.');
      session.endDialog('Just type "authenticate" to get started');
    } else {
      let url = '';
      if (typeof results == 'string') {
        url = results;
      } else if (
        results &&
        results.matched &&
        results.matched[0] &&
        results.matched[0].trim()
      ) {
        let text = results.matched[0].trim();
        url = cleanUrl(text, session.message.source);
      }
      if (url && url.indexOf(session.userData.me) > -1) {
        session.dialogData.sharedUrl = url;
        session.send(
          'Looks like you want to do with a page on your own domain: "' +
            session.dialogData.sharedUrl +
            '" 🤷‍',
        );
        return session.replaceDialog('/modify-post', url);
        session.endDialog();
      } else if (url) {
        session.dialogData.sharedUrl = url;
        session.send(
          'Looks like you want to do something with the url "' +
            session.dialogData.sharedUrl +
            '" 🤷‍',
        );
        builder.Prompts.choice(session, 'What do you want to do?', [
          'like-of',
          'repost-of',
          'in-reply-to',
          'cancel',
        ]);
      } else {
        session.endDialog(
          "I thought that might be a url but I can't quite understand it",
        );
      }
    }
  },
  (session, results, next) => {
    if (results && results.response && results.response.entity) {
      const action = results.response.entity;
      if ('cancel' == action) {
        session.endDialog('Ok I have cancelled that');
      } else if ('like-of' == action) {
        session.dialogData.data = {
          h: 'entry',
          'like-of': session.dialogData.sharedUrl,
        };
      } else if ('repost-of' == action) {
        session.dialogData.data = {
          h: 'entry',
          'repost-of': session.dialogData.sharedUrl,
        };
      } else if ('in-reply-to' == action) {
        return session.replaceDialog('/send-reply', {
          'in-reply-to': session.dialogData.sharedUrl,
        });
      }
      next();
    } else {
      session.endDialog('Uh oh, something went wrong there 💔');
    }
  },
  (session, results, next) => {
    session.sendTyping();
    micropub.options.micropubEndpoint = session.userData.micropub;
    micropub.options.token = session.userData.accessToken;
    micropub
      .create(session.dialogData.data, 'form')
      .then(url => {
        const card = getSuccessCard(
          session,
          url,
          session.dialogData.data.content,
          session.dialogData.data.name,
        );
        session.endDialog(card);
      })
      .catch(err => {
        session.send('Uh oh 😯. There was an error sending that');
        session.endDialog(err.message);
      });
  },
]);

bot.dialog('/send-reply', [
  (session, results, next) => {
    session.dialogData.data = {
      h: 'entry',
      'in-reply-to': results['in-reply-to'],
    };
    next();
  },
  ...micropubPromts.content,
  ...micropubPromts.published,
  ...micropubPromts.photoConfirm,
  (session, results, next) => {
    session.sendTyping();
    micropub.options.micropubEndpoint = session.userData.micropub;
    micropub.options.token = session.userData.accessToken;
    micropub
      .create(session.dialogData.data, 'form')
      .then(url => {
        const card = getSuccessCard(
          session,
          url,
          session.dialogData.data.content,
        );
        session.endDialog(card);
      })
      .catch(err => {
        session.send('Uh oh 😯. There was an error sending the response');
        session.endDialog(err.message);
      });
  },
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
    micropub
      .create(session.dialogData.data, 'multipart')
      .then(url => {
        const card = getSuccessCard(
          session,
          url,
          session.dialogData.data.content,
          session.dialogData.data.name,
        );
        session.endDialog(card);
      })
      .catch(err => {
        session.send('Uh oh 😯. There was an error sending that');
        session.endDialog(err.message);
        console.log(err);
      });
  },
]);

bot.dialog('/rsvp', [
  (session, results, next) => {
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
  ...micropubPromts.inReplyTo,
  (session, results, next) => {
    session.sendTyping();
    micropub.options.micropubEndpoint = session.userData.micropub;
    micropub.options.token = session.userData.accessToken;
    if (
      session.dialogData.data.rsvp &&
      session.dialogData.data['in-reply-to']
    ) {
      micropub
        .create(session.dialogData.data, 'form')
        .then(url => {
          const card = getSuccessCard(
            session,
            url,
            'RSVP sent to ' + session.dialogData.data['in-reply-to'],
          );
          session.endDialog(card);
        })
        .catch(err => {
          session.send('Uh oh 😯. There was an error sending that');
          session.endDialog(err.message);
        });
    } else {
      session.endDialog(
        'Oh dear 😞. RSVP was missing in-reply-to or rsvp option',
      );
    }
  },
]);

bot.dialog('/authenticate', [
  session => {
    session.send('Lets get started with authenticating me with your site');
    builder.Prompts.text(session, 'What is your domain?');
  },
  (session, results) => {
    session.sendTyping();
    const userUrl = cleanUrl(results.response);
    session.send(`Ok I'll try to authenticate at ${userUrl}`);
    micropub.options.me = userUrl;
    micropub
      .getAuthUrl()
      .then(url => {
        session.send(`Ok visit this link to authorize me 🔏: ${url}`);
        builder.Prompts.text(session, 'Paste the code you get back to me ');
      })
      .catch(err => session.endDialog(err.message));
  },
  (session, results) => {
    const code = results.response;
    session.sendTyping();
    micropub
      .getToken(results.response)
      .then(token => {
        console.log(token);
        session.userData.accessToken = token;
        session.userData.micropub = micropub.options.micropubEndpoint;
        session.userData.me = micropub.options.me;
        session.endDialog(
          'Ok I am now authenticated and ready to send micropub requests 🎉',
        );
      })
      .catch(err => session.endDialog(err.message));
  },
]);

bot.dialog('/modify-post', [
  (session, args, next) => {
    if (!session.userData.micropub || !session.userData.accessToken) {
      session.send('Whoa you dont seem to have an access token saved 🔐.');
      session.endDialog('Just type "authenticate" to get started');
    } else {
      if (typeof args == 'string') {
        session.dialogData.url = args;
      }
      micropub.options.micropubEndpoint = session.userData.micropub;
      micropub.options.token = session.userData.accessToken;
      builder.Prompts.choice(session, 'What do you want to do?', [
        'update',
        'delete',
        'undelete',
        'cancel',
      ]);
    }
  },
  (session, results, next) => {
    switch (results.response.entity) {
      case 'delete': {
        micropub
          .delete(session.dialogData.url)
          .then(res => {
            session.endDialog("Ok that's in the trash now 🗑");
          })
          .catch(err => {
            session.endDialog('Uh oh 😯. There was an error removing that');
          });
        break;
      }
      case 'undelete': {
        micropub
          .undelete(session.dialogData.url)
          .then(res => {
            session.endDialog('I have risen that post from the dead now! 👹');
          })
          .catch(err => {
            session.endDialog(
              "My powers are weak. I couldn't resurrect that post. 🥀",
            );
          });
        break;
      }
      case 'update': {
        session.dialogData.data = {};
        session.send('Cool, lets make some ch-ch-changes 💇');
        next();
        break;
      }
      default: {
        session.endDialog('Uh oh 😯. There was an error somewhere');
      }
    }
  },
  ...micropubPromts.name,
  ...micropubPromts.summary,
  ...micropubPromts.content,
  ...micropubPromts.category,
  ...micropubPromts.photoConfirm,
  (session, results, next) => {
    session.sendTyping();
    var updateObject = {
      replace: {},
    };
    for (var property in session.dialogData.data) {
      if (Array.isArray(session.dialogData.data[property])) {
        updateObject.replace[property] = session.dialogData.data[property];
      } else {
        updateObject.replace[property] = [session.dialogData.data[property]];
      }
    }

    micropub
      .update(session.dialogData.url, updateObject)
      .then(res => {
        session.endDialog('Post updated 👍');
      })
      .catch(err => {
        session.endDialog('Uh oh 😯. There was an error sending that');
      });
  },
]);

bot.dialog(
  '/not-understood',
  new builder.SimpleDialog((session, results) => {
    console.log('Did not understand this request:');
    console.log(session.message);
    try {
      if (session.message.attachments && session.message.attachments[0]) {
        let attachment = session.message.attachments[0];
        if (
          attachment.contentType &&
          attachment.contentUrl &&
          attachment.contentType.indexOf('image') > -1
        ) {
          const sharedPhoto = cleanUrl(attachment.contentUrl);
          session.replaceDialog('/photo', sharedPhoto);
        }
      } else if (session.message.sourceEvent.message.attachments[0]) {
        let attachment = session.message.sourceEvent.message.attachments[0];
        console.log('Message has an attachment:');
        console.log(attachment);
        if (attachment.url) {
          const sharedUrl = cleanUrl(attachment.url);
          session.replaceDialog('/shared-url', sharedUrl);
        } else {
          throw 'not understood';
        }
      }
    } catch (err) {
      session.endDialog("🤷‍ I'm sorry. I didn't understand.");
    }
  }),
);

bot.dialog('/help', [
  session => {
    session.send("Here's what I can do ℹ:");
    const helpCard = new builder.Message(session).attachments([
      new builder.HeroCard(session)
        .title('PostrChild Help')
        .buttons([
          builder.CardAction.imBack(session, 'post', 'Post a simple note'),
          builder.CardAction.imBack(
            session,
            'journal',
            'Post a simple note with the categories journal and private',
          ),
          builder.CardAction.imBack(
            session,
            'advancedpost',
            'Post an advanced post',
          ),
          builder.CardAction.imBack(
            session,
            'auth',
            'Authenticate with your micropub endpoint',
          ),
          builder.CardAction.imBack(session, 'help', 'Show this help message'),
        ]),
    ]);
    session.send(helpCard);
    session.endDialog(
      'Or to quickly post a note just prepend your content with the post keyword and it will be posted instantly (post ****)',
    );
  },
]);

bot.dialog('/info', [
  session => {
    session.send('Let me tell you a little bit about myself.');
    session.send(
      'I am a chatbot 🤖 developed by Grant Richmond 👨🏻‍💻 - https://grant.codes',
    );
    session.send(
      'I am built 🛠 in nodejs and run on the Microsoft BotFramework.',
    );
    session.send(
      'You can see my source code and contribute improvements and fixes 🏥 on GitHub https://github.com/terminalpixel/postrchildbot',
    );
    session.endDialog(
      'You might find a little more information on my website: https://postrchild.tpxl.io',
    );
  },
]);

function getSuccessCard(session, url, text = false, subtitle = false) {
  const response = new builder.Message(session);

  let message = '## Post Successful';

  if (subtitle) {
    message += '\n\n ### ' + subtitle;
  }

  if (text) {
    message += '\n\n' + text;
  }

  if (url) {
    message += '\n\n' + `[View Post](${url})`;
    // TODO: Maybe add option to delete it?
    // response.suggestedActions(
    //   builder.SuggestedActions.create(session, [
    //     builder.CardAction.imBack(session, 'action=delete', 'Delete'),
    //   ]),
    // );
  }

  response.text(message);

  return response;
}
