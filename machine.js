"use strict";

const http = require("http");

function httpHandler(req, res) {
    if (req.method == "POST") {
        let body = "";
        req.on("data", chunk => {
            body += chunk.toString(); // convert Buffer to string
        });
        req.on("end", () => {
            let data = null;
            try {
                data = JSON.parse(body)
                console.log(data);
            } catch (error) {
                console.error("Could not parse!", error);
            }
            res.end("ok");
        });
    } else {
        res.end("hello");
    }
}

const server = http.createServer(httpHandler);
server.on("error", console.error);

server.listen(80);