# Special note !
Several developers have gotten together to work out the serial protocol. Check our work on this wiki :
https://github.com/ccutrer/balboa_worldwide_app/wiki

# My research on Google Docs
https://docs.google.com/document/d/1s4A0paeGc89k6Try2g3ok8V9BcYm5CXhDr1ys0qUT4s/edit?usp=drivesdk&authuser=0

# Initial steps
npm install serialport

sudo raspi-config

no to login over serial

yes to enable serial

# crontab
@reboot /home/pi/spaControl/startHotTub.sh

Uses port 9000
