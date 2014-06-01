FROM        ubuntu:14.04
#based on https://github.com/luiselizondo/docker-varnish
MAINTAINER  Taras Glek taras@mozilla.com
 
ENV DEBIAN_FRONTEND noninteractive

#speed up apt
RUN perl -pi -e s/archive.ubuntu.com/us-west-2.ec2.archive.ubuntu.com/g /etc/apt/sources.list

# Update the package repository
RUN apt-get -qq update

# Install base system
RUN apt-get install -y varnish git nodejs npm

# Varnish setup
ADD default.vcl /etc/varnish/default.vcl

ADD etc-default-varnish /etc/default/varnish

# Expose varnish port
EXPOSE 6081

# nodejs setup
RUN git clone https://github.com/tarasglek/reverse-proxy-primer.js && cd reverse-proxy-primer.js && npm install


ADD start.sh /start.sh
RUN chmod +x /start.sh
CMD ["/start.sh"]
