const urlParser = require('url').parse;
const qsParser = require('querystring').parse;

 function isURL(str) {
  var urlRegex = '^(?!mailto:)(?:(?:http|https|ftp)://)(?:\\S+(?::\\S*)?@)?(?:(?:(?:[1-9]\\d?|1\\d\\d|2[01]\\d|22[0-3])(?:\\.(?:1?\\d{1,2}|2[0-4]\\d|25[0-5])){2}(?:\\.(?:[0-9]\\d?|1\\d\\d|2[0-4]\\d|25[0-4]))|(?:(?:[a-z\\u00a1-\\uffff0-9]+-?)*[a-z\\u00a1-\\uffff0-9]+)(?:\\.(?:[a-z\\u00a1-\\uffff0-9]+-?)*[a-z\\u00a1-\\uffff0-9]+)*(?:\\.(?:[a-z\\u00a1-\\uffff]{2,})))|localhost)(?::\\d{2,5})?(?:(/|\\?|#)[^\\s]*)?$';
  var url = new RegExp(urlRegex, 'i');
  return str.length < 2083 && url.test(str);
}

function cleanUrl(url) {
  url = url.trim();
  if (url.charAt(0) == '<') {
    url = url.substr(1);
  }
  if (url.charAt(url.length - 1) == '>') {
    url = url.substring(0, url.length - 1);
  }
  if (url.indexOf('facebook.com/l') > -1) {
    const parsedUrl = urlParser(url);
    const params = qsParser(parsedUrl.query);
    if (params.u && isURL(params.u)) {
      url = params.u;
    }
  }
  return url;
}

module.exports = cleanUrl;
