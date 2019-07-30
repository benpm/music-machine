"use strict";

const express = require("express");
const request = require("request");

//Genius API search handlers
function geniusSongInfo(error, response, body) {
    let result = JSON.parse(body);
    console.log(result.response.song.description.plain);
}
function geniusSearch(error, response, body) {
    let result = JSON.parse(body);
    let songID = result.response.hits[0].result.id;
    request.get(`https://api.genius.com/songs/${songID}?text_format=plain&` +
        "access_token=BTvxaxYdfn2Lc40gr2uS8703AZw4GsGJAg7UzXcAzbiIUgVPrMSAenCs0DQdzlkS",
        geniusSongInfo);
}

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
    recents.push(req.body);
    if (recents.length > 10)
        recents.shift();
    res.send("ok");

    //Search Genius for track info
    let searchQuery = (req.body["TrackName"] + " " + req.body["ArtistName"]).replace(" ", "%20");
    request.get(`https://api.genius.com/search?q=${searchQuery}&` +
        "access_token=BTvxaxYdfn2Lc40gr2uS8703AZw4GsGJAg7UzXcAzbiIUgVPrMSAenCs0DQdzlkS",
        geniusSearch);
});

//Start the server
app.listen(8000);