function cleanUrl(url) {
  url = url.trim();
  if (url.charAt(0) == '<') {
    url = url.substr(1);
  }
  if (url.charAt(url.length - 1) == '>') {
    url = url.substring(0, url.length - 1);
  }
  return url;
}

module.exports = cleanUrl;
