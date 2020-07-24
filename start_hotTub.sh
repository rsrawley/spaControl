#!/bin/bash

# Start app
cd /home/pi/spaControl
cp log log.bak
/usr/bin/node spa.js >/dev/null 2>&1 >log &
