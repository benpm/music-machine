"use strict";

const express = require("express");
const request = require("request");

//Express app
const app = express();

//Keep track of recent 10 posts
var recents = [];

//Setup the Express app
app.use(express.json());
app.use(express.static("public"));

//Respond request
app.get("/list", (req, res) => {
    res.send(JSON.stringify(recents));
});

//Receive POST requests from IFTTT
app.post("/", (req, res) => {
    console.log(req.body);
    console.log(req.body["TrackName"]);
    recents.push(req.body);
    if (recents.length > 10)
        recents.shift();
    res.send("ok");
});

//Start the server
app.listen(8000);