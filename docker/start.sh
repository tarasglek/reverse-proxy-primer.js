#!/bin/sh
#/usr/sbin/varnishd -P /var/run/varnishd.pid -a :6081 -T localhost:6082 -u varnish -g varnish -f /etc/varnish/default.vcl -S /etc/varnish/secret -s file,/var/lib/varnish//varnish_storage.bin,200M -F
/etc/init.d/varnish start
cd reverse-proxy-primer.js && nodejs index.js config/server.json

