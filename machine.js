"use strict";

const http = require("http");
const { parse } = require("querystring");

function httpHandler(req, res) {
    if (req.method == "POST") {
        let body = "";
        req.on("data", chunk => {
            body += chunk.toString(); // convert Buffer to string
        });
        req.on("end", () => {
            console.log(parse(body));
            res.end("ok");
        });
    } else {
        res.end("hello");
    }
}

const server = http.createServer(httpHandler);
server.on("error", console.error);

server.listen(80);