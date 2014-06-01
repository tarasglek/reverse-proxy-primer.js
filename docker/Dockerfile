FROM        ubuntu:14.04
#based on https://github.com/luiselizondo/docker-varnish
MAINTAINER  Taras Glek taras@mozilla.com
 
ENV DEBIAN_FRONTEND noninteractive

# Update the package repository
RUN apt-get -qq update

# Install base system
RUN apt-get install -y varnish git

# Make our custom VCLs available on the container
ADD default.vcl /etc/varnish/default.vcl

ADD etc-default-varnish /etc/default/varnish

# Expose varnish port
EXPOSE 6081

ADD start.sh /start.sh
RUN chmod +x /start.sh
CMD ["/start.sh"]
