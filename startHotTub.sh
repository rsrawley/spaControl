#!/bin/bash

# Redirect HTTP port 80 to 9000
sudo iptables -t nat -D PREROUTING -p tcp --dport 80 -j REDIRECT --to-ports 9000
sudo iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-ports 9000

# Start app
cd /home/pi/spaControl
/usr/bin/node spa.js >/dev/null 2>log& # optionally : >log