#!/bin/sh -e
file=@curl.sh
bucket=releng-sscache-logs
resource="/${bucket}/${file}"
contentType="application/x-compressed-tar"
dateValue=`date -R`
stringToSign="PUT\n\n${contentType}\n${dateValue}\n${resource}"
s3Key=xxxxxxxxxxxxxxxxxxxx
s3Secret=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
signature="AWS foo:goo" #`echo -en ${stringToSign} | openssl sha1 -hmac ${s3Secret} -binary | base64`
echo "curl -X PUT --data ${file} -H \"Host: ${bucket}.s3.amazonaws.com\" -H \"Date: ${dateValue}\" -H \"Content-Type: ${contentType}\" -H \"Authorization: AWS ${s3Key}:${signature}\" https://${bucket}.s3.amazonaws.com/${file}"
