# Usage
```

# install dependencies
npm install

# Launch s3 compat layer
# by default this listens on port 8080. So varnish works without config changes
nodejs index.js config/server.json

#Launch varnish
# by default this listens on port 6081
/etc/init.d/varnish start

#Upload some file
#s3 layer forwards that to varnish
#by default varnish lets PUT requests go through
nodejs s3upload.js config/varnish_s3upload.json README.md

#verify varnish cache
curl http://localhost:6081/foo-bucket/README.md

