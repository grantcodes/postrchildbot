const app = require("../lib/express");

app.get("*", (req, res) => {
  const { code } = req.query;
  res.render("auth.njk", { code });
});

module.exports = app;
