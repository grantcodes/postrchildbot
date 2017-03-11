const emoji = require('node-emoji');

function cleanText(text, service) {
  text = emoji.emojify(text);
  if ('slack' == service) {
    text = text.replace('<', '');
    text = text.replace('>', '');
  }
  return text;
}

module.exports = cleanText;
