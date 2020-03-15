const static = require("node-static");
const app = new static.Server("./app");
const port = Number(process.argv[2]) || process.env.PORT || 8080;

let tickets = [];

const cmd = "youtube-dl";

function escape(arg) {
    return `'${arg.replace(/'/g, `'\\''`)}'`;
}

function searchYoutube(q, response) {
	response.setHeader("Content-Type", "text/plain"); // necessary for firefox to read by chunks

	console.log("YouTube searching", q);
	q = escape(`ytsearch10:${q}`);
	const command = `${cmd} -j ${q} | jq "{id,title}" | jq -s .`;
	require("child_process").exec(command, {}, (error, stdout, stderr) => {
		if (error) {
			console.log("error", error);
			response.writeHead(500);
			response.end(error.message);
		} else {
			response.end(stdout);
		}
	});
}


function downloadYoutube(q, response) {
	response.setHeader("Content-Type", "text/plain"); // necessary for firefox to read by chunks

	console.log("YouTube downloading", q);
	let args = [
		"-f", "bestaudio",
		"-o", `${__dirname}/_youtube/%(title)s-%(id)s.%(ext)s`,
		q
	]
	let child = require("child_process").spawn(cmd, args);

	child.stdout.setEncoding("utf8").on("data", chunk => response.write(chunk));
	child.stderr.setEncoding("utf8").on("data", chunk => response.write(chunk));

	child.on("error", error => {
		console.log(error);
		response.writeHead(500);
		response.end(error.message);
	});

	child.on("close", code => {
		if (code != 0) { // fixme
		}
		response.end();
	});
}

function handleYoutubeSearch(url, response) {
	let q = url.searchParams.get("q");
	if (q) {
		searchYoutube(q, response);
	} else {
		response.writeHead(404);
		response.end();
	}
}

function handleYoutubeDownload(request, response) {
	let str = "";
	request.setEncoding("utf8");
	request.on("data", chunk => str += chunk);
	request.on("end", () => {
		let q = require("querystring").parse(str)["id"];
		if (q) {
			downloadYoutube(q, response);
		} else {
			response.writeHead(404);
			response.end();
		}
	});
}

function handleTicket(request, response) {
	request.resume().on("end", () => {
		let ticket = require("crypto").randomBytes(16).toString("hex");
		tickets.push(ticket);
		if (tickets.length > 10) { tickets.shift(); }

		let data = {ticket};
		response.setHeader("Content-Type", "application/json");
		response.end(JSON.stringify(data));
	});
}

function onRequest(request, response) {
	const url = new URL(request.url, "http://localhost");

	switch (true) {
		case request.method == "GET" && url.pathname == "/youtube":
			return handleYoutubeSearch(url, response);

		case request.method == "POST" && url.pathname == "/youtube":
			return handleYoutubeDownload(request, response);

		case request.method == "POST" && url.pathname == "/ticket":
			return handleTicket(request, response);

		default:
			return request.on("end", () => app.serve(request, response)).resume();
	}
}

function requestValidator(request) {
	let ticket = request.resourceURL.query["ticket"];
	let index = tickets.indexOf(ticket);
	if (index > -1) {
		tickets.splice(index, 1);
		return true;
	} else {
		return false;
	}
}

let httpServer = require("http").createServer(onRequest).listen(port);
require("ws2mpd").ws2mpd(httpServer, requestValidator);
require("ws2mpd").logging(false);
