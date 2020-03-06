# Initial steps
npm install serialport

sudo raspi-config

no to login over serial

yes to enable serial

# crontab
@reboot /home/pi/spaControl/startHotTub.sh
