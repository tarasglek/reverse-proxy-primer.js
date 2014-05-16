var fs = require("fs");
const AWS = require('aws-sdk');

var config = JSON.parse(fs.readFileSync(process.argv[2]));
var s3 = new AWS.S3(config.aws);
var filename = process.argv[3];

var obj = {Key: filename, Body: fs.readFileSync(filename), Bucket:config.bucket};

s3.putObject(obj, function (err, ret) {
  if (err)
    throw err;
  console.log("Done", ret);
});
