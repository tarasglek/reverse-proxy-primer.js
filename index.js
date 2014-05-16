const http = require("http")
const fs = require("fs")
const url = require("url")

var objects = {};
var config = JSON.parse(fs.readFileSync(process.argv[2]))

function fail(response, code, message) {
  response.writeHead(code, {"Content-Type": "text/plain"});
  response.write(message);
  response.end();
}

function xml_fail(response, code, message) {
  var xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Error><Code>Fail Code ' + code + '</Code>',
    '<Message>'+ message+ '</Message>',
    '<ArgumentValue>AWS xxxxxxxxxxxxxxxxxxxx:AWS foo:goo</ArgumentValue><ArgumentName>Authorization</ArgumentName><RequestId>DA4F9D654D285264</RequestId><HostId>6Rj2t4/EOBR2mDHR3Hk74zMMrnOX3PcU4uX659pzYriZKilfyEpjRdAqG/l3h81grIM+UeICkf0=</HostId></Error>'
  ]
  fail(response, code, xml.join("\n"));
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
    response.writeHead(200, {"Content-Length":0});
    objects[pathname] = buf;
    response.end();
  });
}

function handleGet(request, response) {
  var pathname = url.parse(request.url).pathname;
  if (!(pathname in objects))
    return fail(response, 404, "Can't find " + path);
  var buf = objects[pathname];
  response.writeHead(200, {"Content-Length":buf.length});
  response.write(buf);
  response.end();
  console.log(Object.keys(objects))
  delete objects[pathname];
  console.log(Object.keys(objects))
}

http.createServer(function(request, response) {
  console.log(""+Object.keys(objects).length + " objects in memory");
  console.log(request.method, request.url)
  console.log(request.headers);
  if (request.method == "PUT") {
    handlePut(request, response);
    return;
  } else if (request.method == "GET") {
    return handleGet(request, response);
  } else {
    console.log("what is this method:"+request.method);
    fail(response, 500, "what is this method:"+request.method);
  }
}).listen(config.port, config.host);

console.log("Static file server running at\n  => http://"+config.host+":" + config.port + "/\nCTRL + C to shutdown");
