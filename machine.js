"use strict";

const KEYS = require("./keys.json");

const TumblrAPI = require("tumblr.js");
const SpotifyAPI = require("spotify-web-api-node");
const GeniusAPI = require("genius-api");
const LastFmAPI = require("last-fm");

const youtube = require("youtube-search");
const prompt = require("prompt");

const tumblr = TumblrAPI.createClient({credentials: KEYS.tumblr, returnPromises: true});
const spotify = new SpotifyAPI(KEYS.spotify);
const genius = new GeniusAPI(KEYS.genius.client_access_token);
const lastfm = new LastFmAPI(KEYS.lastfm.api_key);

// Frequency of polling for Spotify playlist changes
const pollFreq = 10 * 60 * 1000;

function getDescription(title, artist) {
    return new Promise((resolve, reject) => {
        genius.search(`${title} by ${artist}`).then((data) => {
            console.trace(data);
            if (data.hits.length > 0) {
                genius.song(data.hits[0].result.id, {text_format: "html"}).then((data) => {
                    console.trace(data);
                    resolve(data.song.description.html);
                }, reject);
            } else {
                resolve("");
            }
        }, reject);
    });
}

function getTags(title, artist) {
    return new Promise((resolve, reject) => {
        lastfm.trackInfo({name: title, artistName: artist}, (err, data) => {
            if (err) {
                reject(err);
            } else {
                console.trace(data);
                if (data.tags) {
                    resolve(data.tags);
                } else {
                    resolve([]);
                }
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
            console.trace(data);
            resolve(data.results[0].link);
        }, reject);
    });
}

function sendPost(title, artist, album, desc, tags, videoURL) {
    let caption = "";
    caption += `<p><b>${title}</b> by <b>${artist}</b></p>\n`;
    caption += `<p>from <i>${album}</i></p>\n`;
    if (desc.length > 9) {
        caption += `<p><blockquote>${desc.replace("\n\n", "<br>")}</blockquote></p>\n`
    }
    caption += `<p><a href="https://github.com/benpm/music-machine">[🎵]</a></p>`;

    return tumblr.createVideoPost(KEYS.tumblr.blog_id, {
        state: "queue",
        tags: ([title, artist].concat(tags, [album])).join(","),
        embed: videoURL,
        caption
    });
}

function pollPlaylist() {
    spotify.getPlaylistTracks(KEYS.spotify.playlistID, {
        limit: 5, offset: 0,
        fields: "items(added_at,track(uri,name,artists(name),album(name),external_urls))"
    }).then((data) => {
        const items = data.body.items;
        if (items.length > 0) {
            new Promise((resolve, reject) => {
                // Get metadata and post songs in playlist
                for (let i of items) {
                    let title = i.track.name;
                    let artist = i.track.artists[0].name;
                    Promise.all([
                        getDescription(title, artist),
                        getTags(title, artist),
                        getVideo(title, artist)
                    ]).then((r) => {
                        console.trace(r);
                        // Create Tumblr post
                        sendPost(title, artist, i.track.album.name, r[0], r[1], r[2]).then((r) => {
                            console.trace(r);
                            // Refresh access token
                            spotify.refreshAccessToken().then((r) => {
                                spotify.setAccessToken(r.body.access_token);
                                spotify.setRefreshToken(r.body.refresh_token);
                                resolve();
                            }, reject);
                        }, reject);
                    }, reject);
                }
            }).then(() => {
                // Remove the new songs
                spotify.removeTracksFromPlaylist(KEYS.spotify.playlistID,
                    items.map((i) => {return{uri: i.track.uri}})).then(console.trace, console.error);
            }, console.error);
        }
    }, console.error);
}

function main() {
    let authURl = spotify.createAuthorizeURL(
        ["playlist-modify-public", "playlist-modify-private", "playlist-read-private"],
        "music-machine");
    console.log(authURl);
    prompt.start();
    prompt.get("access_code").then((i) => {
        spotify.authorizationCodeGrant(i.access_code).then((r) => {
            console.trace(r.body);
            spotify.setAccessToken(r.body.access_token);
            spotify.setRefreshToken(r.body.refresh_token);
            setInterval(pollPlaylist, pollFreq);
        }, console.error);
    }, console.error);
}

main();