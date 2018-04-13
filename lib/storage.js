const Datastore = require('nedb');
const db = new Datastore({ filename: './data.db', autoload: true });

module.exports = class Storage {
  constructor() {
    this.getData = this.getData.bind(this);
    this.saveData = this.saveData.bind(this);
    this.deleteData = this.deleteData.bind(this);
  }

  getData(context, callback) {
    let data = {
      userData: null,
      privateConversationData: null,
      conversationData: null,
    };
    if (context.userId && context.persistUserData) {
      db.findOne({ _id: context.userId }, (err, user) => {
        if (!err && user) {
          if (context.conversationId && user.conversations) {
            if (
              user.conversations[context.conversationId] &&
              user.conversations[context.conversationId].private
            ) {
              data.privateConversationData = JSON.parse(
                user.conversations[context.conversationId].private,
              );
            }
          }
          if (
            user.conversations &&
            context.persistConversationData &&
            context.conversationId
          ) {
            if (
              user.conversations[context.conversationId] &&
              user.conversations[context.conversationId].data
            ) {
              data.conversationData = JSON.parse(
                user.conversations[context.conversationId].data,
              );
            }
          }
          data.userData = user;
        }
        callback(null, data);
      });
    } else {
      callback(null, data);
    }
  }

  saveData(context, data, callback) {
    let update = {
      $set: {},
    };
    if (context.userId) {
      if (context.persistUserData) {
        update.$set = data.userData;
      }
      if (context.conversationId) {
        const key = `conversations.${context.conversationId}.private`;
        update.$set[key] = JSON.stringify(data.privateConversationData);
      }
    }
    if (context.persistConversationData && context.conversationId) {
      const key = `conversations.${context.conversationId}.data`;
      update.$set[key] = JSON.stringify(data.conversationData);
    }
    db.update(
      { _id: context.userId },
      update,
      { upsert: true },
      (err, num, upsert) => {
        callback(null);
      },
    );
  }

  deleteData(context) {
    db.remove({ _id: context.userId }, {}, (err, numRemoved) => {});
  }
};
