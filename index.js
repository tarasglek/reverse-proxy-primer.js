const http = require("http")
const fs = require("fs")
const url = require("url")
const crypto = require('crypto');

var objects = {};
var config = JSON.parse(fs.readFileSync(process.argv[2]))

function logentry(request, code, message) {
  var timestamp = (new Date()).toISOString();
  return request.connection.remoteAddress + " " + timestamp + " \""
    + request.method + " " + request.url + " " + request.headers["user-agent"]
    + "\" " +  code + " \"" + message + "\""
}

// make sure errors are not cached
function fail(request, response, code, message, rawmessage) {
  response.writeHead(code, {"Content-Type": "text/plain",
                            "Content-Length": message.length,
                            // X-REFRESH takes care of this for 404s that get replaced with content..eg it's ok to cache 404s =D
                            // "Cache-Control": "private, max-age=0",
                           });
  response.write(message);

  if (!rawmessage)
    rawmessage = message;

  console.error(logentry(request, code, rawmessage));
  response.end();
}

function xml_fail(request, response, code, message) {
  var xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Error><Code>Fail Code ', code, '</Code>',
    '<Message>', message, '</Message>',
    '<ArgumentValue>AWS xxxxxxxxxxxxxxxxxxxx:AWS foo:goo</ArgumentValue><ArgumentName>Authorization</ArgumentName><RequestId>DA4F9D654D285264</RequestId><HostId>6Rj2t4/EOBR2mDHR3Hk74zMMrnOX3PcU4uX659pzYriZKilfyEpjRdAqG/l3h81grIM+UeICkf0=</HostId></Error>'
  ]
  fail(request, response, code, xml.join(""), message);
}

function extract_key_from_auth(auth) {
  var a = auth.split(" ");
  if (a.length != 2)
    return null;
  if (a[0] != "AWS")
    return null;
  var b = a[1].split(":");
  if (b.length != 2)
    return null;
  return b[0];
}

// do the unix trick of opening a file
// then deleting it so we have a backing store that goes away
// when handle is closed or process crashes
function tmpfd(callback) {
  var name = "/tmp/" + crypto.randomBytes(4).readUInt32LE(0) + "." + crypto.randomBytes(4).readUInt32LE(0);
  fs.open(name, "wx+", function (err, fd) {
    if (err) {
      console.log(name + " temporary file already exists, trying a different name");
      return tmpfd(callback);
    }
    fs.unlink(name, function (err) {
      if (err)
        callback(err);
      callback(null, fd);
    });
  });
}

function cache(pathname, cached_entry, callback) {
  var options = { 
    "host":config.varnish.host,
    "port":config.varnish.port,
    "path":pathname,
    "headers":{
      "Accept-Encoding": "gzip",
      "Accept": "*/*",
      "user-agent": "reverse.proxy.js",
      "X-REFRESH": "DOIT" //magic varnish setting
    }
  }

  tmpfd(function (err, fd) {
    if (err)
      callback(err);
    
    cached_entry.fd = fd;
    var req = http.request(options, function(res) {
      var content_length = res.headers['content-length'] * 1
      var md5Hash = crypto.createHash('md5');

      res.on('data', function (chunk) {
        fs.write(fd, chunk, 0, chunk.length, null, function (err) {
          res.resume();
        })
        md5Hash.update(chunk);
        res.pause();
      });
      
      res.on('end', function () {
        var buf = new Buffer(content_length);
        fs.read(fd, buf, 0, content_length, 0, function (err, bytesRead, buf) {
          fs.close(fd);
          console.log(md5Hash.digest('base64'));
          // per http://stackoverflow.com/questions/13790259/buffer-comparison-in-node-js
          if (buf >= cached_entry.buffer && buf <= cached_entry.buffer) {
            callback(null, null);
          } else {
            //todo, issue a http request to remove entry from varnish
            var msg = "Failed to verify cache " + pathname;
            callback(new Error(msg));
          }
        })
      });
    });

    req.on('error', function(e) {
      callback(new Error('problem with request: ' + e.message));
    });

    req.end();
  })
}

function handlePut(request, response) {
  if (!('content-length' in request.headers)) {
    return xml_fail(request, response, 500, "Missing content-length header");
  }
  if (!('authorization' in request.headers)) {
    return xml_fail(request, response, 403, "Forbidden: Missing Authorization header");
  }
  
  var accessKeyId = extract_key_from_auth(request.headers['authorization'].toString());
  if (!accessKeyId)
    return xml_fail(request, response, 403, "Forbidden: Can't parse Authorization header");
  
  var pathname = url.parse(request.url).pathname;

  var a = pathname.split("/");

  if (a.length < 3)
    return xml_fail(request, response, 500, "Missing bucket name");
  var bucket_name = a[1];

  var bucket_rules = null;
  config.buckets.forEach(function (x) {
    if (x.bucket == bucket_name) {
      bucket_rules = x;
      return false;
    }
  })

  if (!bucket_rules)
    return xml_fail(request, response, 404, "Unknown bucket:" + bucket_name);

  if (bucket_rules.accessKeyId != accessKeyId)
    return xml_fail(request, response, 403, "Forbidden: Auth failed");

  var content_length = request.headers['content-length'] * 1
  var buf = new Buffer(content_length); 
  var start_timestamp = Date.now()
  var pos = 0;
  request.on('data', function(chunk) {
    chunk.copy(buf, pos);
    pos += chunk.length;
  }) 
  request.on('end', function() {
    var cached_entry = {"headers":{}, buffer:buf, timestamp: start_timestamp}
    for (var header in request.headers) {
      if (header.substr(0,8) == "content-")
        cached_entry.headers[header] = request.headers[header]
    }
    objects[pathname] = cached_entry;
    cache(pathname, cached_entry, function (err) {
      if (!err) {
        response.writeHead(200, {"Content-Length":0});
        console.log(logentry(request, 200,
                             cached_entry.headers["content-length"] + "b in " 
                             + (Date.now() - cached_entry.timestamp) + "ms"));

        response.end();
      } else {
        fail(request, response, 500, err.toString());
      }
      delete objects[pathname]
    });
  });
}

function handleGet(request, response) {
  var pathname = url.parse(request.url).pathname;
  if (!(pathname in objects))
    return fail(request, response, 404, "Can't find " + pathname);
  var cached_entry = objects[pathname];
  var headers = {"Cache-Control": "public, max-age=31556926"};
  for (var header in cached_entry.headers)
    headers[header] = cached_entry.headers[header]

  response.writeHead(200, headers);
  if (request.method == "GET")
    response.write(cached_entry.buffer);
  response.end();
  console.log(logentry(request, 200,
                       cached_entry.headers["content-length"] + "b in " 
                       + (Date.now() - cached_entry.timestamp) + "ms"));
}

http.createServer(function(request, response) {
  if (request.method == "PUT") {
    handlePut(request, response);
    return;
  } else if (request.method == "GET" || request.method == "HEAD") {
    return handleGet(request, response);
  } else {
    console.log("what is this method:"+request.method);
    return fail(request, response, 500, "what is this method:"+request.method);
  }
}).listen(config.port, config.host);

console.log("Static file server running at\n  => http://"+config.host+":" + config.port + "/\nCTRL + C to shutdown");
