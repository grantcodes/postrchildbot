'use strict';

const builder = require('botbuilder');
const cleanText = require('./clean-text');
const cleanUrl = require('./clean-url');
let micropub = null;

const h = [
  (session, results, next) => {
    builder.Prompts.choice(session, 'What sort of entry are you creating?', ['entry', 'card', 'event', 'cite']);
  }, (session, results, next) => {
    session.dialogData.data.h = results.response.entity;
    next();
  }
];

const name = [
  (session, results, next) => {
    builder.Prompts.text(session, 'Add a name (or skip)');
  }, (session, results, next) => {
    if (results && results.response && results.response != 'skip') {
      session.dialogData.data.name = cleanText(results.response, session.dialogData.source);
    }
    next();
  }
];

const summary = [
  (session, results, next) => {
    builder.Prompts.text(session, 'Add a summary (or skip)');
  }, (session, results, next) => {
    if (results && results.response && results.response != 'skip') {
      session.dialogData.data.summary = cleanText(results.response, session.dialogData.source);
    }
    next();
  }
];

const content = [
  (session, results, next) => {
    if (!session.dialogData.data.content) {
      builder.Prompts.text(session, 'Add content (or skip)');
    } else {
      next();
    }
  },
  (session, results, next) => {
    if (!session.dialogData.data.content && results && results.response && results.response != 'skip') {
      session.dialogData.data.content = cleanText(results.response, session.dialogData.source);
    }
    next();
  }
];

const published = [
  (session, results, next) => {
    builder.Prompts.time(session, 'Add published time 🕐 (you can say now)');
  },
  (session, results, next) => {
    if (results.response) {
      session.dialogData.data.published = builder.EntityRecognizer.resolveTime([results.response]);
    }
    next();
  }
];

const category = [
  (session, results, next) => {
    builder.Prompts.text(session, 'Add categories (space seperated or skip)');
  },
  (session, results, next) => {
    if (results && results.response && results.response != 'skip') {
      session.dialogData.data.category = results.response.split(' ');
    }
    next();
  }
];

const inReplyTo = [
  (session, results, next) => {
    builder.Prompts.text(session, 'Add in-reply-to (or skip)');
  },
  (session, results, next) => {
    if (results && results.response && results.response != 'skip') {
      session.dialogData.data['in-reply-to'] = cleanUrl(results.response);
    }
    next();
  }
];

const likeOf = [
  (session, results, next) => {
    builder.Prompts.text(session, 'Add like-of 👍 (or skip)');
  },
  (session, results, next) => {
    if (results && results.response && results.response != 'skip') {
      session.dialogData.data['like-of'] = cleanUrl(results.response);
    }
    next();
  }
];

const repostOf = [
  (session, results, next) => {
    builder.Prompts.text(session, 'Add repost-of 🔁 (or skip)');
  },
  (session, results, next) => {
    if (results && results.response && results.response != 'skip') {
      session.dialogData.data['repost-of'] = cleanUrl(results.response);
    }
    next();
  }
];

const photo = [
  (session, results, next) => {
    builder.Prompts.attachment(session, 'Attach an image 🔗');
  },
  (session, results, next) => {
    if (results && results.response && results.response[0] && results.response[0].contentUrl) {
      var attachment = results.response[0];
      session.dialogData.data.photo = results.response[0].contentUrl;
    }
    next();
  }
];

const photoConfirm = [
  (session, results, next) => {
    builder.Prompts.confirm(session, 'Do you want to add an image 📷 ?');
  },
  (session, results, next) => {
    if (results && results.response) {
      builder.Prompts.attachment(session, 'Attach an image 🔗');
    } else {
      next();
    }
  },
  (session, results, next) => {
    if (results && results.response && results.response[0] && results.response[0].contentUrl) {
      var attachment = results.response[0];
      session.dialogData.data.photo = results.response[0].contentUrl;
    }
    next();
  }
];

let syndicationOptions = [];
const mpSyndicateTo = [
  (session, results, next) => {
    session.sendTyping();
    micropub.options.micropubEndpoint = session.userData.micropub;
    micropub.options.token = session.userData.accessToken;
    micropub.query('syndicate-to').then((res) => {
      if (res['syndicate-to']) {
        syndicationOptions = res['syndicate-to'].map((option) => {
          if (typeof option == 'string') {
            return option;
          } else if (option.uid) {
            return option.uid;
          }
          return '';
        });
      }
      if (options.length > 0) {
        session.send('Add syndication options');
        for (var i = 0; i < options.length; i++) {
          session.send(`${i+1}: ${options[i]}`);
        }
        builder.Prompts.text(session, 'Type the numbers of the options you want (space seperated or skip)');
      } else {
        next();
      }
    }).catch(() => {
      next();
    });
  },
  (session, results, next) => {
    if (results && results.response && results.response != 'skip') {
      let syndication = [];
      const optionSelections = cleanText(results.response, session.message.source).split(' ');
      for (var i = 0; i < optionSelections.length; i++) {
        const index = parseInt(optionSelections[i]) - 1;
        if (syndicationOptions[index]) {
          syndication.push(syndicationOptions[index]);
        }
      }
      session.dialogData.data['mp-syndicate-to'] = syndication;
    }
    next();
  }
];

module.exports = function(micropubInstance) {
  micropub = micropubInstance;
  return {
    h: h,
    name: name,
    summary: summary,
    content: content,
    published: published,
    category: category,
    inReplyTo: inReplyTo,
    likeOf: likeOf,
    repostOf: repostOf,
    photo: photo,
    photoConfirm: photoConfirm,
    mpSyndicateTo: mpSyndicateTo,
  };
}
