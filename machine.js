"use strict";

const keys = require("./keys.json");
const express = require("express");
const request = require("request");
const port = 8000;
var queue = {};
var counter = 0;

//Send to IFTTT tumblr recipe if ready
function sendIfReady(index) {
    let song = queue[index];
    song.stepsRemaining -= 1;
    if (song.stepsRemaining == 0) {
        console.log("Sending", song);
        request.post({
            uri: `https://maker.ifttt.com/trigger/post_song/with/key/${keys.ifttt}`,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                value1: song.trackURL,
                value2: song.description,
                value3: [song.artistName, song.trackName, song.trackName].concat(song.genreTags).join(",")
            })
        });
        delete queue[index];
    }
}

//Handler wrapper
function wrapHandler(handler, index) {
    return (error, response, body) => {
        if (error) {
            console.error(error);
        } else {
            handler(index, JSON.parse(body));
            sendIfReady(index);
        }
    };
}

//Genius API search handlers
function geniusSongInfo(index, json) {
    let rawDesc = json.response.song.description.plain
    if (rawDesc.length < 4 || !queue[index]) {
        console.error("Genius song info failed");
        return;
    }
    let desc = rawDesc.replace("\n\n", "<br>");
    queue[index].description += `<p>${desc}</p>`;
}
function geniusSearch(index, json) {
    if (json.response.hits.length == 0) {
        console.error("ERROR GeniusSearch:", json.message);
        sendIfReady(index);
        return;
    }
    let songID = json.response.hits[0].result.id;
    request.get(`https://api.genius.com/songs/${songID}?text_format=plain&` +
        `access_token=${keys.genius}`,
        wrapHandler(geniusSongInfo, index));
}

//Last.fm search handler
function lastfmSearch(index, json) {
    if (json["error"]) {
        console.error("ERROR LastFM search:", json.message);
        sendIfReady(index);
        return;
    }

    //Add tags to the song info
    for (const tagInfo of json.toptags.tag.slice(0, 4)) {
        queue[index].genreTags.push(tagInfo.name);
    }
}

//Main
function main() {
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

        //Populate song info object
        queue[counter] = {
            trackName: req.body["TrackName"],
            artistName: req.body["ArtistName"],
            trackURL: req.body["TrackURL"],
            albumName: req.body["AlbumName"],
            description: `<p><b>${req.body["TrackName"]}</b> by <b>${req.body["ArtistName"]}</b></p><p>From ${req.body["AlbumName"]}</p>`,
            genreTags: [],
            stepsRemaining: 3
        };

        //Search Genius for track info
        let searchQuery = (req.body["TrackName"] + " " + req.body["ArtistName"].split(", ")[0]).replace(" ", "%20");
        request.get(`https://api.genius.com/search?q=${searchQuery}&` +
            `access_token=${keys.genius}`,
            wrapHandler(geniusSearch, counter));

        //Search Last.fm for genre tags
        let searchTrack = req.body["TrackName"].replace(" ", "+");
        let searchArtist = req.body["ArtistName"].replace(" ", "+");
        request.get(`http://ws.audioscrobbler.com/2.0/?method=track.gettoptags&artist=${searchArtist}&track=${searchTrack}&` +
            `api_key=${keys.lastfm}&format=json`,
            wrapHandler(lastfmSearch, counter));

        //Increment
        counter += 1;
    });

    //Start the server
    app.listen(port);
}

//Check for keys
if (keys["genius"] && keys["ifttt"] & keys["lastfm"]) {
    console.error("Missing valid keys! Add your API keys to keys.json");
} else {
    main();
    console.log("Serving on port", port);
}
