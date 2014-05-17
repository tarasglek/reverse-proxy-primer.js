const http = require("http")
const fs = require("fs")
const url = require("url")

var objects = {};
var config = JSON.parse(fs.readFileSync(process.argv[2]))

// make sure errors are not cached
function fail(response, code, message) {
  response.writeHead(code, {"Content-Type": "text/plain",
                            "Content-Length": message.length,
                            // X-REFRESH takes care of this for 404s that get replaced with content..eg it's ok to cache 404s =D
                            // "Cache-Control": "private, max-age=0",
                           });
  response.write(message);
  console.log("fail", code);
  response.end();
}

function xml_fail(response, code, message) {
  var xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Error><Code>Fail Code ', code, '</Code>',
    '<Message>', message, '</Message>',
    '<ArgumentValue>AWS xxxxxxxxxxxxxxxxxxxx:AWS foo:goo</ArgumentValue><ArgumentName>Authorization</ArgumentName><RequestId>DA4F9D654D285264</RequestId><HostId>6Rj2t4/EOBR2mDHR3Hk74zMMrnOX3PcU4uX659pzYriZKilfyEpjRdAqG/l3h81grIM+UeICkf0=</HostId></Error>'
  ]
  fail(response, code, xml.join(""));
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

function cache(pathname, cached_entry, callback) {
  var options = { 
    "host":config.varnish.host,
    "port":config.varnish.port,
    "path":pathname,
    "headers":{
      "Accept-Encoding":"gzip",
      "Accept":"*/*",
      "X-REFRESH": "DOIT" //magic varnish setting
    }
  }
  var req = http.request(options, function(res) {
    var content_length = res.headers['content-length'] * 1
    var buf = new Buffer(content_length); 
    var pos = 0;

    res.on('data', function (chunk) {
      chunk.copy(buf, pos);
      pos += chunk.length;
    });
    
    res.on('end', function () {
      if (buf.toString() == cached_entry.buffer.toString()) {
        console.log("Cached " + pathname);
        callback(null, null);
      } else {
        var msg = "Failed to cache " + pathname;
        console.log(msg);
        callback(new Error(msg));
      }
    });
  });

  req.on('error', function(e) {
    console.log('problem with request: ' + e.message);
  });

  req.end();
}

function handlePut(request, response) {
  if (!('content-length' in request.headers)) {
    return xml_fail(response, 500, "Missing content-length header");
  }
  if (!('authorization' in request.headers)) {
    return xml_fail(response, 403, "Forbidden: Missing Authorization header");
  }
  
  var accessKeyId = extract_key_from_auth(request.headers['authorization'].toString());
  if (!accessKeyId)
    return xml_fail(response, 403, "Forbidden: Can't parse Authorization header");
  
  var pathname = url.parse(request.url).pathname;

  var a = pathname.split("/");
  console.log(JSON.stringify(a))
  if (a.length < 3)
    return xml_fail(response, 500, "Missing bucket name");
  var bucket_name = a[1];

  var bucket_rules = null;
  config.buckets.forEach(function (x) {
    if (x.bucket == bucket_name) {
      bucket_rules = x;
      return false;
    }
  })

  if (!bucket_rules)
    return xml_fail(response, 404, "Unknown bucket:" + bucket_name);

  console.log(JSON.stringify(bucket_rules.accessKeyId,accessKeyId));
  if (bucket_rules.accessKeyId != accessKeyId)
    return xml_fail(response, 403, "Forbidden: Auth failed");

  var content_length = request.headers['content-length'] * 1
  var buf = new Buffer(content_length); 
  console.log(buf.length)
  var pos = 0;
  request.on('data', function(chunk) {
    chunk.copy(buf, pos);
    pos += chunk.length;
  }) 
  request.on('end', function() {
    var cached_entry = {"headers":{}, buffer:buf}
    for (var header in request.headers) {
      if (header.substr(0,8) == "content-")
        cached_entry.headers[header] = request.headers[header]
    }
    objects[pathname] = cached_entry;
    cache(pathname, cached_entry, function (err) {
      if (!err) {
        response.writeHead(200, {"Content-Length":0});
        response.end();
      } else {
        fail(response, 500, err.toString());
      }
      delete objects[pathname]
    });
  });
}

function handleGet(request, response) {
  var pathname = url.parse(request.url).pathname;
  if (!(pathname in objects))
    return fail(response, 404, "Can't find " + pathname);
  var cached_entry = objects[pathname];
  var headers = {"Cache-Control": "public, max-age=31556926"};
  for (var header in cached_entry.headers)
    headers[header] = cached_entry.headers[header]

  response.writeHead(200, headers);
  if (request.method == "GET")
    response.write(cached_entry.buffer);
  response.end();
  console.log("sent", pathname);
}

http.createServer(function(request, response) {
  console.log(""+Object.keys(objects).length + " objects in memory");
  console.log(request.method, request.url)
  console.log(request.headers);
  if (request.method == "PUT") {
    handlePut(request, response);
    return;
  } else if (request.method == "GET" || request.method == "HEAD") {
    return handleGet(request, response);
  } else {
    console.log("what is this method:"+request.method);
    fail(response, 500, "what is this method:"+request.method);
  }
}).listen(config.port, config.host);

console.log("Static file server running at\n  => http://"+config.host+":" + config.port + "/\nCTRL + C to shutdown");
