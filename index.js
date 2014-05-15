var http = require("http"),
    url = require("url")
    port = process.argv[2] || 8888;

function fail(response, code, message) {
  response.writeHead(code, {"Content-Type": "text/plain"});
  response.write(message);
  response.end();
}

var objects = {};

function handleUpload(request, response) {
  if (!('content-length' in request.headers)) {
    return fail(response, 500, "Missing content-length header");
  }
  var content_length = request.headers['content-length'] * 1
  var buf = new Buffer(content_length); 
  console.log(buf.length)
  var pos = 0;
  request.on('data', function(chunk) {
    chunk.copy(buf, pos);
    pos += chunk.length;
  }) 
  request.on('end', function() {
    response.writeHead(200, {"Content-Length":0});
    var path = url.parse(request.url).pathname;
    objects[path] = buf;
    response.end();
  });
}

function handleGet(request, response) {
  var path = url.parse(request.url).pathname;
  if (!(path in objects))
    return fail(response, 404, "Can't find " + path);
  var buf = objects[path];
  response.writeHead(200, {"Content-Length":buf.length});
  response.write(buf);
  response.end();
  console.log(Object.keys(objects))
  delete objects[path];
  console.log(Object.keys(objects))
}

http.createServer(function(request, response) {
  console.log(""+Object.keys(objects).length + " objects in memory");
  console.log(request.headers);
  if (request.method == "PUT") {
    handleUpload(request, response);
    return;
  } else if (request.method == "GET") {
    return handleGet(request, response);
  } else {
    console.log("what is this method:"+request.method);
    fail(response, 500, "what is this method:"+request.method);
  }
}).listen(parseInt(port, 10));

console.log("Static file server running at\n  => http://localhost:" + port + "/\nCTRL + C to shutdown");
