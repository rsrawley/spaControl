#!/bin/bash

# Full path
DIR="/home/pi/spaControl"

# Path to forever command
FOREVER="/usr/bin/forever"

# Start app
cd /home/pi/spaControl
cp log log.bak
rm log

#/usr/bin/node spa.js >/dev/null 2>&1 >log &
$FOREVER start -m 10 --spinSleepTime 30000 -l $DIR/log $DIR/spa.js 2>&1 >forever.log
