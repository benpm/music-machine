"use strict";

const KEYS = require("./keys.json");

const TumblrAPI = require("tumblr.js");
const SpotifyAPI = require("spotify-web-api-node");
const GeniusAPI = require("genius-api");
const LastFmAPI = require("last-fm");

const youtube = require("youtube-search");
const prompt = require("prompt");

// Check that config is popualated
for (let serviceKey of Object.keys(KEYS)) {
    for (let key of Object.keys(KEYS[serviceKey])) {
        if (!KEYS[serviceKey][key]) {
            console.error(
                `config item ${serviceKey}.${key} is not set!` +
                ` make sure to populate everything in keys.json!`);
            process.exit(1);
        }
    }
}

const tumblr = TumblrAPI.createClient({credentials: KEYS.tumblr, returnPromises: true});
const spotify = new SpotifyAPI(KEYS.spotify);
const genius = new GeniusAPI(KEYS.genius.client_access_token);
const lastfm = new LastFmAPI(KEYS.lastfm.api_key);

const cache = require("node-file-cache").create();

function handleError(response) {
    console.error(response);
    console.trace();
    throw Error();
}

// Frequency of polling for Spotify playlist changes
const pollFreq = 45 * 60 * 1000;

function getDescription(title, artist) {
    return new Promise((resolve, reject) => {
        genius.search(`${title} by ${artist}`).then((data) => {
            if (data.hits.length > 0) {
                genius.song(data.hits[0].result.id, {text_format: "html"}).then((data) => {
                    console.log(`(${title} by ${artist}): got desc of length ${data.song.description.html.length}`);
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
                if (data.tags) {
                    resolve(data.tags);
                    console.log(`(${title} by ${artist}): got tags [${data.tags.join(", ")}]`);
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
            console.log(`(${title} by ${artist}): got video ${data.results[0].link}`);
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
    caption += `<p style="text-align: right;"><a href="https://github.com/benpm/music-machine">[🎵]</a></p>`;

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
                    console.log(`--> new spotify track: (${title} by ${artist})`);
                    Promise.all([
                        getDescription(title, artist),
                        getTags(title, artist),
                        getVideo(title, artist)
                    ]).then((r) => {
                        console.log(`(${title} by ${artist}): got all data`);
                        // Create Tumblr post
                        sendPost(title, artist, i.track.album.name, r[0], r[1], r[2]).then((r) => {
                            console.log(`(${title} by ${artist}): posted to tumblr`);
                            resolve();
                        }, reject);
                    }, reject);
                }
            }).then(() => {
                // Remove the new songs
                spotify.removeTracksFromPlaylist(KEYS.spotify.playlistID,
                    items.map((i) => {return{uri: i.track.uri}})).then(
                        () => console.log(`--> removed ${items.length} from playlist`), handleError);
            }, handleError);
        }
    }, handleError);
}

function refreshTokens(handler = handleError) {
    // Refresh access token
    return spotify.refreshAccessToken().then((r) => {
        console.log("--> refreshed spotify access token");
        spotify.setAccessToken(r.body.access_token);
        cache.set("access_token", r.body.access_token);
        cache.set("expires_in", r.body.expires_in);
    }, handler);
}

function spotifyRequestOAuth() {
    let authURl = spotify.createAuthorizeURL(
        ["playlist-modify-public", "playlist-modify-private", "playlist-read-private"],
        "music-machine");
    console.log("--> visit the following URL then copy the access code below");
    console.log(authURl);
    prompt.start();
    prompt.get("access_code").then((i) => {
        spotify.authorizationCodeGrant(i.access_code).then((r) => {
            console.log("--> got spotify access token");
            spotify.setAccessToken(r.body.access_token);
            cache.set("access_token", r.body.access_token);
            spotify.setRefreshToken(r.body.refresh_token);
            cache.set("refresh_token", r.body.refresh_token);
            cache.set("expires_in", r.body.expires_in);
            pollPlaylist();
            setInterval(pollPlaylist, pollFreq);
            setInterval(refreshTokens, (r.body.expires_in / 2) * 1000);
        }, handleError);
    }, handleError);
}

function main() {
    if (cache.get("access_token") && cache.get("refresh_token")) {
        console.log("--> attempting spotify login with cached tokens");
        spotify.setAccessToken(cache.get("access_token"));
        spotify.setRefreshToken(cache.get("refresh_token"));
        refreshTokens(console.warn).then(
            (r) => {
                console.log("--> it worked!");
                pollPlaylist();
                setInterval(pollPlaylist, pollFreq);
                setInterval(refreshTokens, (cache.get("expires_in") / 2) * 1000);
            },
            () => {
                console.log("--> failed log in with cached tokens");
                spotifyRequestOAuth();
            }
        )
    } else {
        spotifyRequestOAuth();
    }
}

main();