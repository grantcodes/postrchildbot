const app = require("./lib/express");

app.get("*", (req, res) => {
  res.render("home.njk");
});

module.exports = app;
