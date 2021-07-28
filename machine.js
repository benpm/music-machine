"use strict";

const KEYS = require("./keys.json");

const TumblrAPI = require("tumblr.js");
const SpotifyAPI = require("spotify-web-api-node");
const GeniusAPI = require("genius-api");
const LastFmAPI = require("last-fm");

const youtube = require("youtube-search");

const tumblr = TumblrAPI.createClient({credentionals: KEYS.tumblr, returnPromises: true});
const spotify = new SpotifyAPI(KEYS.spotify);
const genius = new GeniusAPI(KEYS.genius.client_access_token);
const lastfm = new LastFmAPI(KEYS.lastfm.api_key);


// Frequency of polling for Spotify playlist changes
const pollFreq = 60 * 1000;

function getDescription(title, artist) {
    return new Promise((resolve, reject) => {
        genius.search(`${title} by ${artist}`).then((data) => {
            console.debug(data);
            if (data.hits.length > 0) {
                genius.song(data.hits[0].result.id).then((data) => {
                    console.debug(data);
                    resolve(data.song.description);
                }, reject);
            } else {
                resolve("");
            }
        }, reject);
    });
}

function getTags(title, artist) {
    return new Promise((resolve, reject) => {
        lastfm.trackInfo({track: title, artist}, (err, data) => {
            if (err) {
                reject(err);
            } else {
                console.debug(data);
                resolve(data.track.toptags.map((t) => t.name));
            }
        });
    });
}

function getVideo(title, artist) {
    return new Promise((resolve, reject) => {
        youtube(`${title} ${artist}`, {
            key: KEYS.youtube.api_key,
            maxResults: 1,
            type: "video",
            videoCategoryId: 10 // Music category
        }).then((data) => {
            console.debug(data);
            resolve(data.results[0].link);
        }, reject);
    });
}

function sendPost(title, artist, album, desc, tags, videoURL) {
    let caption = "";
    caption += `<p><b>${title}</b> by <b>${artist}</b></p>\n`;
    caption += `<p>from <i>${album}</i></p>\n`;
    if (desc.length > 4) {
        caption += `<p><blockquote>${desc.replace("\n\n", "<br>")}</blockquote></p>\n`
    }
    caption += `<p><a href="https://github.com/benpm/music-machine">[🎵]</a></p>`;

    tumblr.postRequest(`blog/${KEYS.tumblr.blog_id}/post`, {
        type: "video",
        state: "queue",
        tags: [title, artist] + tags + [album],
        embed: videoURL,
        caption
    }).then(console.debug, console.error);
}

function pollPlaylist() {
    spotify.getPlaylistTracks(KEYS.spotify.playlistID, {
        limit: 200, offset: 0,
        fields: "items(added_at,track(uri,name,artists(name),album(name),external_urls))"
    }).then((data) => {
        const items = data.body.items;
        if (items.length > 0) {
            // Remove the new songs
            spotify.removeTracksFromPlaylist(KEYS.spotify.playlistID,
                items.map((i) => {uri: i.track.uri})).catch(console.error);
            // Get metadata for new songs
            for (let i of items) {
                let title = i.track.name;
                let artist = i.track.artists[0].name;
                Promise.all([
                    getDescription(title, artist),
                    getTags(title, artist),
                    getVideo(title, aritst)
                ]).then((r) => {
                    console.debug(r);
                    sendPost(title, artist, album, r[0], r[1], r[2]);
                }, console.error);
            }
        }
    }, console.error);
}

function main() {
    setInterval(pollPlaylist, pollFreq);
}

main();