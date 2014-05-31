# Revese Caching
This node app lives behind a varnish proxy and populates the varnish cache with S3 put requests

For now uploads are cached in memory. On failure to upload, no retries are attempted.

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

# Problems

* Varnish behaves weirdly(eg goes back to server) if there is a prior request that 404ed
* Seems to depend on headers matching exactly
* Eg 'Accept: */*' matters
* Solution to this and other issues is forced expiry for warming cache. See Configuration section below

memory storage seems to result in a lot of problems.
persistent storage sucks too(failed to recover, segfaulted)

# Configuration

https://www.varnish-cache.org/trac/wiki/VCLExampleHashAlwaysMiss

