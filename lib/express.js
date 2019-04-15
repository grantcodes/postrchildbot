const { join } = require("path");
const express = require("express");
const bodyParser = require("body-parser");
const nunjucks = require("nunjucks");

// Setup express server for html site
const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

nunjucks.configure(join(__dirname, "../views"), {
  autoescape: true,
  express: app
});

app.set("views", join(__dirname, "../views"));

module.exports = app;
