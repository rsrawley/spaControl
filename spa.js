/*

+===============================================+
|                                               |
|  Balboa controller spa interface (in JS)      |
|                                               |
|  Written by Raphaël Srawley                   |
|                                               |
|  For use with Node.js ('cos he only bothered  |
|  to learn JS and finds it handy to have       |
|  front-end and back-end in one language...)   |
|                                               |
+===============================================+

Balboa motherboard Uses RS485 protocol :
*** YOU NEED A SPECIAL ADAPTER MODULE BOARD FOR SERIAL/RS485 TRANSLATION BETWEEN PI AND MOTHERBOARD ***
(see my research at https://docs.google.com/document/d/1s4A0paeGc89k6Try2g3ok8V9BcYm5CXhDr1ys0qUT4s/edit)

Reference: https://github.com/ccutrer/balboa_worldwide_app/wiki

==== Smart heating hours (in Canada with HydroOne): ====
Winter hours
Time of use: Nov 1 to April 30
7pm to 7am : 10.1 c/kWh off-peak
7pm to 11am : 20.8 c/kWh on-peak
11pm to 5pm : 14.4 c/kWh mid-peak
5pm to 7pm : 20.8 c/kWh on-peak

So let it cool off at 7am - sep temp to 85F
Set to heat at 7pm - set to 96F
========================================================

- Reminder to self: in order to see output on terminal and save it to file, use:
  node spa.js 2>&1 | tee test1 &

- Reminder to self:
  !!! Don't forget every number from the hot tub is in hexadecimal !!!
  (because 0x90 is not 90 in decimal)

- Reminder to self: (eventually figure out what you meant by line below...)
  Replace [ \t]+\n by \n to get rid of trailing white space
*/

// If you are not Raphaël, you might want to disable the following options (if left to true, the program should fail gracefully with warnings and continue)
const ENABLE = {
  TEXTING              : true, // Spa will send a text when temperature ready (requires some gmail setup)
  SURVEY               : true, // Link to Google Drive survey for comfort level (eventually analyze my responses to determine "best" wind, outside temp and spa temp conditions)
  WEATHER              : true, // Set this to false if you don't care about weather in web interface
  SAVE_ELECTRICITY     : true, // Lowers and raises spa set temperature based on time of day to save on electricity costs
  AB_TEMP_SENSOR       : false, // A/B temperature sensor (in and out of heater)
  REBOOT_LOSS_INTERNET : false // Normally I keep this disabled
}

// Current directory where main.js was launched
const path = __dirname;

// Module of helper functions that don't directly interact with spa, but do nice things (like weather and text notifications)
const helpers = require(`${path}/spaHelpers.js`);

// Functions to help debugging
const debugTools = require(`${path}/spaDebug.js`);

// Set up message translation matrix (codes must be unique as they are used to store data in spa{})
const codeMatrix = require(`${path}/spaCodes.js`);

// Set up file access
const fs = require('fs');

// Set up GPIO access
const gpio = require('onoff').Gpio;
const Vcc = new gpio(18,'high'); // Physical pin 12
const CTS = new gpio(23,'low'); // Physical pin 16 (CTS : Clear To Send pin)

// Release all GPIOs on exit
process.on('SIGINT', function () {
  Vcc.unexport();
  CTS.unexport();
  process.exit();
})

// Set up web server
const express = require('express'); // Web server
const app = express();
const server = require('http').createServer(app);
server.listen(9000); // Start the webserver on port 9000
app.use(express.static(__dirname + '/html')); // Tell the server location of the static web pages

// Web socket server setup
const io = require('socket.io').listen(server);
io.on('connection', function(socket){
  // Keep track of IP address for texting
  let ipAddress = socket.request.connection.remoteAddress.replace('::ffff:','');

  // Initial connection: send all params to client that just connected
  socket.emit('data',(({ outbox, temp, ...o }) => o)(spa)); // Clone spa object and remove key "outbox" and "temp" -- this is a very neat one liner!

  // Send initial graph data
  socket.emit('graphData',graphData);
  socket.emit('weather',spa.weather); // Send to all connected clients

  // Disable texting if texting setup failed
  if (! gmail || ! addressBook) {
    socket.emit('texting','disabled');
  }

  // Messages received
  socket.on('command', function(command) {
    debugTools.debug('SOCKET.IO - Received message: ' + JSON.stringify(command), 3, spa);

    if (command.type == "debugLevel") {
      spa.debug.level = command.param;
      socket.emit('data',{debug: spa.debug});
    } else {
      sendCommand(command.type,command.param,ipAddress);
    }
  })

  // Set up notificaton by text
  socket.on('notifyByText', function() {
    spa.notify[ipAddress] = {"ST":spa.ST, "time":Date.now()}; // Store set temp that was asked under IP address and the time as well
  })
})


// Store all items in memory
let spa = {
  outbox : [], // Messages waiting to be sent to spa
  notify : {}, // Ip addresses for text notification
  rates : {}, // Cooling and heating rates
  debug : { // Only for debugging
    level: 0, // 0 : no debug messages whatsoever on console to 4 : all debug messages (debug level is chosen in program at each output)
    deactivate: () => {setTimeout(() => {spa.debug.level = 0}, 10*60000)}, // Set debug level to zero after a certain time in case I forget and leave it logging
    allMessages: true,
    initialCommand: "", // Send this command when program first starts
    statusUpdatesRecord: true,
    bf06and07Messages: true, // Display bf 06 and bf 07 messages
    noColor: false, // Set to false for yellow highlighting, but then it shows escape characters in file
    raw: true // Set to true for pure hexadecimal (no showing previous settings for messages)
  },
  registration: {
    clear: function () {
      let parameters = {
        registered : false, // Will keep trying to register before sending anything
        channel : 0, // Channel to listen on
        clearToSend : "", // Clear to send message from board (format : *channel* bf 06)
        tries: 0,
        step: 1, // Which step of registration we are on (simplest way to avoid skipping steps)
        preferredChannel: "11", // Will try to register on this channel (or use it if already registered)
        preferredAlreadyActive : false,
        identifierCode : "ff ff" // This is a unique identifier (completely made up by me) that the board will use to reply (in case many devices registering at once)
      }
      spa.registration = {...spa.registration, ...parameters}; // Merge objects
    }
  },
  weather: {},
  lastChangeToTemp: 0, // Initialize to zero for saveElectricity function
  faults: {
    requested: false,
    timeoutHandle: undefined,
    firstSetup: true,
    details: [],
    messages : { // Starts at hex 15 (decimal 21)
      15: "Sensors are out of sync",
      16: "The water flow is low",
      17: "The water flow has failed",
      18: "The settings have been reset",
      19: "Priming Mode",
      20: "The clock has failed",
      21: "The settings have been reset",
      22: "Program memory failure",
      26: "Sensors are out of sync -- Call for service",
      27: "The heater is dry",
      28: "The heater may be dry",
      29: "The water is too hot",
      30: "The heater is too hot",
      31: "Sensor A Fault",
      32: "Sensor B Fault",
      34: "A pump may be stuck on",
      35: "Hot fault",
      36: "The GFCI test failed",
      37: "Standby Mode (Hold Mode)"
    }
  }
}
spa.debug.deactivate(); // After timer goes off, disable debugging
spa.testing = []; // Only used for testing (displaying changes in configs)

// Initialize registration variables
spa.registration.clear();

// Set up serial port
const SerialPort = require('serialport');
const Delimiter = require('@serialport/parser-delimiter');
const port = new SerialPort('/dev/ttyAMA0', { baudRate: 115200 }); // Talking to RS485 adapter on Pi's serial port uart0 (ttyAMA0 are physical pins 8 and 10)
const parser = port.pipe(new Delimiter({delimiter: Buffer.from('7e', 'hex') })); // Spa messages have 0x7e at beginning and end
parser.on('data', readData);

function readData(data, testing) {
  //console.log(data)
  data = data.toString('hex').match(/../g); // Convert to hexadecimal string and then into two character array (each is a hex)

  // Extract message contents : length (first byte) and message type (next 3 bytes), etc.
  let message = {
    hex : data.join(" "), // Store complete HEX as single string for debugging
    byteCount : parseInt(data[0],16), // First byte is length (number of bytes in message)
    type : data.slice(1,4).join(" "), // Next 3 bytes is type of message (index 1 to 3)
    content : data.slice(4,-1), // Slice to the end (except the checksum); empty array if no content
    checksum : data.slice(-1).join() // Last byte is checksum
  }

  if (data.length == message.byteCount && checksum(data.slice(0,-1).join("")) == message.checksum) { // Check proper message length and checksum
    // For testing purposes
    debugTools.displayMessages(message.type, message.content, spa);

    // Translate message (Attention! Order of if statements matters for registration)
    if (message.type == spa.registration.existingClientQuery) { // Motherboard rebooted and is querying existing clients.  Let it know we have an existing channel!
      // Reset channel registration to force program to register again
      spa.registration.clear();
      debugTools.debug("Spa rebooted.  Attempting to register on a channel...", 1, spa);

    } else if (! spa.registration.preferredAlreadyActive) { // Prefer a certain channel first before trying to register on a new one
      // The intention for a "preferred channel" is to avoid ever increasing channel number assignments
      // when running spa program multiple times during testing...
      // The assumption here, of course, is that there is no other device that is using this channel!

      if (message.type == spa.registration.preferredChannel + " bf 06") { // CTS for our preferred channel, which means it's already registered so re-use it
        spa.registration.preferredAlreadyActive = true;
        spa.registration.registered = true; // Next step (new channel registration) will be skipped that way
        registerChannel(spa.registration.preferredChannel);
        debugTools.debug("Registering on preferred channel " + spa.registration.preferredChannel, 1, spa);
      }

      spa.registration.tries++;
      if (spa.registration.tries == 50) { // Check this many message before giving up on prefered channel -- will then try to register a new one
        spa.registration.preferredAlreadyActive = true;
        spa.registration.tries = 0; // Reset for next step : new channel request
      }

    } else if (! spa.registration.registered) { // If not yet registered, cannot send anything yet -- obtain own channel first
      if (message.type == spa.registration.clearToSend && spa.registration.step == 4) {
        // Finally board is broadcasting clear to send on new registered channel
        spa.registration.registered = true; // (step 5 - tell spa.js that we are registered)
        debugTools.debug("Registered on channel " + spa.registration.channel, 1, spa);

      } else if (spa.registration.channel != 0 && message.type == "fe bf 00" && spa.registration.step == 3) { // Spam acknowledgement until it clears
        spa.registration.acknowledge(); // (step 4 - send channel acknowledgement; for some reason, I have to keep spamming it as the board responds unregularly)
        spa.registration.step = 4;
        debugTools.debug("Sending channel acknowledge", 1, spa);
        spa.registration.tries++;

        if (spa.registration.tries > 100) {
          throw "Unable to register with main board."
        }

      } else if (message.type == "fe bf 02" && spa.registration.step == 2) { // ff bf 02 is main board channel assignment response   (step 3 - board response with channel)
        if (message.content[1] + " " + message.content[2] == spa.registration.identifierCode) {
          registerChannel(message.content[0]);
          spa.registration.step = 3;
        } else { // Main board sent response, but it's not for our identifier code
          spa.registration.clear();
          debugTools.debug("Possible conflict in requesting address, trying again.", 1, spa);
        }

      } else if (message.type == "fe bf 00" && spa.registration.step == 1) { // Step 1 - board request for new clients
        prepareMessage("fe bf 01 02 " + spa.registration.identifierCode)(); // (step 2 - new channel request with identifier code)
        spa.registration.step = 2;
        //prepareMessage("fe bf 01 02 76 57")();
        debugTools.debug("Sending new channel request", 1, spa);
      }

    } else if (message.type == spa.registration.clearToSend) { // "Ready for command" from board
      if (spa.outbox.length > 0) { // Messages ready to be sent ?
        spa.outbox[0](); // Execute first message function in the queue (and probably the only one)
        spa.outbox.shift(); // Remove message function from queue
      } else {
        spa.registration.nothingToSend();
      }

    } else if (message.type.split(" ").slice(-2).join(" ") == "bf 28") { // Faults logs (only keep last 2 hex, ignore channel number)
      const codeLine = codeMatrix[message.type].codeLine; // Order of codes
      const faultsLog = codeLine.reduce( (objToDate, key, i) => { // Build the object using reduce and two arrays (codeLine as keys and message.content as values)
        objToDate[key] = parseInt(message.content[i],16);
        return objToDate;
      }, {});

      if (spa.faults.requested) { // Requested all logs, storing them as each entry comes in
        storeLog(spa.faults.faultIndex);
      } else if (faultsLog.TO != 0 && (spa.faults.details.length == 0 || spa.faults.details[spa.faults.details.length - 1].hexString != message.content.join(""))) { // There are log entries and (nothing in memory OR the last one we have does not match the one that just came in)
        spa.faults.requested = true;
        storeLog(faultsLog.EN); // Current entry is latest error
      }

      function storeLog(faultIndex) {
        spa.faults.details[faultIndex] = {
          message: `${spa.faults.messages[faultsLog.EC]} (code ${faultsLog.EC})`,
          date: new Date(new Date(Date.now() - faultsLog.ND * 24 * 60 * 60 * 1000).setHours(faultsLog.FH, faultsLog.FM, 0, 0)).toLocaleString(), // Two new Date() as the first one returns timestamp
          temps: `Heat mode (hex): ${decToHex(faultsLog.FE)}, Set temperature: ${faultsLog.FS}, Temp A: ${faultsLog.FA}, Temp B: ${faultsLog.FB}`,
          hexString: message.content.join("") // For comparing errors to see if any new ones
        }

        clearTimeout(spa.faults.timeoutHandle); // Cancel timeout timer set in initiateTimer()

        // All done gathering logs ?
        if (faultIndex == 0) {
          spa.faults.requested = false;

          if (! spa.faults.firstSetup) { // Don't notify when getting logs on startup
            io.emit('data',{"faultsLog": spa.faults.details}) // Inform website
            helpers.textPhone(gmail, "ER"); // Store set temp that was asked under IP address
          } else {
            spa.faults.firstSetup = false;
          }

        } else { // Go on to next log down
          faultIndex--;
          initiateTimer(faultIndex);

          // You have 5 seconds to get current log entry or it tries again
          function initiateTimer(logEntry) {
            spa.faults.timeoutHandle = setTimeout( () => {
              debugTools.debug(`Timed out waiting for log entry ${logEntry} (hex: ${decToHex(logEntry)}).  Retrying.`, 1, spa);
              sendCommand("getFaults", logEntry);
              initiateTimer(logEntry);
            }, 5 * 1000);
          }

          sendCommand("getFaults", faultIndex);
          spa.faults.faultIndex = faultIndex;
        }
      }
  
    } else if (message.type in codeMatrix || message.type == "ff af 13")  { // I have a definition for this message type and it is not in the ignore list or it's the regular status update

      let codeLine = codeMatrix[message.type].codeLine; // Order of codes
      let codes = codeMatrix[message.type].codes; // Translation of codes

      // Go through message content and translate byte by byte
      if (codeLine != undefined) { // Has a code line been defined for this message type ?
        codeLine.forEach( (letterCode, i) => {
          if (letterCode in codes) { // If a code exists in codeLine, store in spa{}

            if (spa[letterCode] != message.content[i]) { // Only update if not the same value
              spa[letterCode] = message.content[i]; // Update items in memory
              io.emit('data',{[letterCode] : spa[letterCode]}); // Send to all connected clients

              // Text phone if set temp was reached
              if (letterCode == "CT") { // CT = current temperature
                for (let ipAddress in spa.notify) {
                  if (Date.now() > spa.notify[ipAddress].time + 6 * 3600 * 1000) { // More than 6 hours since asked for text, so delete
                    delete spa.notify[ipAddress]; // Remove the notification for that IP address
                  
                  } else if (spa.notify[ipAddress].ST == spa.CT) {
                    helpers.textPhone(gmail, "ST", ipAddress, parseInt(spa.CT,16), spa); // Store set temp that was asked under IP address
                    delete spa.notify[ipAddress]; // Remove the notification for that IP address
                  }
                }
              }
              
              // If CT OR ST changed, recompute estimated time based on set temperature ST
              if (["CT","ST"].includes(letterCode)) {
                helpers.estimatedTime(graphData, spa, io);
              }
            }
          }
        })
      }
    }
  }

  function registerChannel(channel) {
    if (parseInt(channel,16) > 47) { // 47 (2f in HEX) is the maximum channel number; however, the board happily tries to hand out higher ones, but it never queries them!
      channel = "2f"; // Hijack the last channel -- if the board is handing these out, you've been having way too much fun!
      console.log("WARNING: no unregistered channels available ! Hihacking last channel to get something, at least.")
    }
    spa.registration.channel = channel;
    spa.registration.clearToSend = channel + " bf 06";
    spa.registration.nothingToSend = prepareMessage(channel + " bf 07");
    spa.registration.acknowledge = prepareMessage(channel + " bf 03");
    spa.registration.existingClientQuery = channel + " bf 04";

    // Rename object keys in "codeMatrix" object that holds all codes with the proper channel number (stored as "xx" in file)
    for (let key in codeMatrix) {
      let newKey = key.replace("xx",channel);
      if (newKey != key) { // ff af 13 doesn't get changed (no "xx" in it)
        codeMatrix[newKey] = codeMatrix[key];
        delete codeMatrix[key];
      }
    }
  }
}


function sendCommand(requested, param, ipAddress) {
  // Some messages need config requests to be sent first

  // Default behaviour that "content" is undefined if no return value given for content in ifs
  let content;
  let prefix;

  if (requested == "toggleItem") { // verified
    prefix = "bf 11";    
    const allowed = {"pump1" : "04", "pump2" : "05", "lights" : "11", "heatMode" : "51", "tempRange" : "50", "hold" : "3c"};
    if (param in allowed) {
      content = allowed[param] + "00";
    }

  } else if (requested == "setTemp") { // verified
    prefix = "bf 20";    
    //range is 80-104 for F, 26-40 for C in high range
    //range is 50-80 for F, 10-26 for C in low range
    if ((param >= 50 && param <= 80 && ["00","08","28","18"].includes(spa.HF)) || (param >= 80 && param <= 104 && ["04","0c","2c","1c"].includes(spa.HF))) { // Using HF to figure out which range temperature is set (high/low)
      spa.lastChangeToTemp = Date.now(); // Keep track of when temperature was changed (because of saveElectricity() )
      content = decToHex(param);
    }

  } else if (requested == "setTime") { // Expects param to be in [HH,MM] format // verified
    prefix = "bf 21";
    if (param[0] >=0 && param[0] <=23 && param[1] >=0 && param[1] <= 59) { // Check hours and minutes within proper range
      content = decToHex(param[0]) + decToHex(param[1]);
    }
    
  } else if (requested == "filterConfigRequest") { // verified
    prefix = "bf 22";
    content = "01 00 00";

  } else if (requested == "controlConfigRequest1") { // verified
    prefix = "bf 22";
    content = "02 00 00";

  } else if (requested == "controlConfigRequest2") { // verified -- unknown what response means
    prefix = "bf 22";
    content = "04 00 00";
    
  } else if (requested == "controlConfigRequest3") { // verified
    prefix = "bf 22";
    content = "08 00 00";

  } else if (requested == "controlConfigRequest4") { // verified  -- unknown what response means
    prefix = "bf 22";
    content = "00 00 01";

  } else if (requested == "getFaults") { // verified
    prefix = "bf 22";
    if (param != undefined) {
      content = "20" + decToHex(param) + "00";
    } else {
      content = "20 ff 00"; // To get latest fault
    }

  } else if (requested == "getGfciTest") { // verified
    prefix = "bf 22";
    content = "80 00 00";

  } else if (requested == "setFilterTime") { // verified
    prefix = "bf 23";
    content = "80 00 00"; // not sure about this one, was commented out before refactoring

  } else if (requested == "setReminders") { // verified
    prefix = "bf 27";
    if (param == 0 || param == 1) { // 0 : on, 1 : off
      content = "00" + decToHex(param);
    }

  } else if (requested == "setTempScale") { // verified
    prefix = "bf 27";
    if (param == 0 || param == 1) { // 0 : Fahrenheit, 1 : Celsius
      content = "01" + decToHex(param);
    }

  } else if (requested == "setTimeFormat") { // verified
    prefix = "bf 27";
    if (param == 0 || param == 1) {
      content = "02" + decToHex(param);
    }

  } else if (requested == "setCleanCycle") { // verified
    prefix = "bf 27";
    if (param >= 0 && param <= 8) { // Each integer represents 30 min increments
      content = "03" + decToHex(param);
    }

  } else if (requested == "setM8") { // verified
    prefix = "bf 27";
    if (param == 0 || param == 1) {
      content = "06" + decToHex(param);
    }

  } else if (requested == "setABTemp") { // verified
    prefix = "bf e0";
    content = "03";

  } else if (requested == "test") { // only for testing!!!
    prefix = "";
    content =  param; // return the param!

  } else { // Invalid command otherwise
    return checkError(`Error in ${requested}: Command not recognized`);
  }

  // Verify valid parameters
  if (content == undefined) {
    return checkError(`Error in ${requested}: Invalid parameters`);
  }

  // Add to message ready to send queue (the message is a whole function)
  let channel = spa.registration.channel;
  if (requested == "test") {  // only for testing (sending commands directly from web page)
    channel = ""; // delete for test message purposes
  }
  spa.outbox.push(prepareMessage(channel + prefix + content, requested));

  // Sends message back if an error in sending command
  function checkError(error) {
    io.emit('error',error);
    console.log(error);
  }
}


// Converts a decimal into a hexadecimal
function decToHex(number) {
  return parseInt(number,10).toString(16).padStart(2,"0");
}


// Adjust spa time if necessary
function setTime() {
  if (spa.HH) { // Make sure we already have a connection
    let currentDate = new Date();
    let hours = currentDate.getHours();
    let minutes = currentDate.getMinutes();
    
    // As long as spa time is within +/- 1 min of actual time, we're not modifying it (computing difference between current time and spa time below)
    if (Math.abs((Date.now() - currentDate.setHours(parseInt(spa.HH,16),parseInt(spa.MM,16)))) > 1*60*1000) {
      sendCommand("setTime",[hours,minutes]);
    }
  }
}


// Get message ready for sending and returns a function for sending message
function prepareMessage(data, debugMessage) {
  // Remove all spaces
  data = data.replace(/ /g, '');

  // Compute length of final message (+1 for length byte and +1 for checksum byte)
  let length = data.length/2 + 2;
  data = length.toString(16).padStart(2,"0") + data;

  // Compute CRC8 checksum
  data = data + checksum(data);

  // Append message start and end bytes
  data = "7e" + data + "7e";

  // Return a function that needs to be executed when sending message
  return (function(hexString, debugMessage) {
    if (debugMessage == undefined) {
      debugMessage = "";
    }

    return function() {
      CTS.write(1, function() { // Switch RS485 module to transmit
        port.write(Buffer.from(hexString, 'hex'), 'hex', function(err) {
          if (err) {
            return console.log('Error on write: ', err.message);
          }

          if (spa.debug.bf06and07Messages || ! /bf0[67]/.test(hexString)) { // Don't display ack messages unless debugging
            debugTools.debug(`Sending: ${hexString.match(/../g).slice(2,-2).join(" ")} (${debugMessage})`, 3, spa);          
          }

          // Switch RS485 module back to receive
          setTimeout(function(){ CTS.write(0) }, 1); // Apparently shutting off CTS too quickly breaks transmission
        })
      })
    }
  })(data, debugMessage);
}


// Finds the CRC-8 checksum for the given message (in hexstring)
function checksum(hexstring) {
  // web site for CRC checksum : http://www.sunshine2k.de/coding/javascript/crc/crc_js.html

  let TABLE = [
    0x00, 0x07, 0x0e, 0x09, 0x1c, 0x1b, 0x12, 0x15, 0x38, 0x3f, 0x36, 0x31, 0x24, 0x23, 0x2a, 0x2d,
    0x70, 0x77, 0x7e, 0x79, 0x6c, 0x6b, 0x62, 0x65, 0x48, 0x4f, 0x46, 0x41, 0x54, 0x53, 0x5a, 0x5d,
    0xe0, 0xe7, 0xee, 0xe9, 0xfc, 0xfb, 0xf2, 0xf5, 0xd8, 0xdf, 0xd6, 0xd1, 0xc4, 0xc3, 0xca, 0xcd,
    0x90, 0x97, 0x9e, 0x99, 0x8c, 0x8b, 0x82, 0x85, 0xa8, 0xaf, 0xa6, 0xa1, 0xb4, 0xb3, 0xba, 0xbd,
    0xc7, 0xc0, 0xc9, 0xce, 0xdb, 0xdc, 0xd5, 0xd2, 0xff, 0xf8, 0xf1, 0xf6, 0xe3, 0xe4, 0xed, 0xea,
    0xb7, 0xb0, 0xb9, 0xbe, 0xab, 0xac, 0xa5, 0xa2, 0x8f, 0x88, 0x81, 0x86, 0x93, 0x94, 0x9d, 0x9a,
    0x27, 0x20, 0x29, 0x2e, 0x3b, 0x3c, 0x35, 0x32, 0x1f, 0x18, 0x11, 0x16, 0x03, 0x04, 0x0d, 0x0a,
    0x57, 0x50, 0x59, 0x5e, 0x4b, 0x4c, 0x45, 0x42, 0x6f, 0x68, 0x61, 0x66, 0x73, 0x74, 0x7d, 0x7a,
    0x89, 0x8e, 0x87, 0x80, 0x95, 0x92, 0x9b, 0x9c, 0xb1, 0xb6, 0xbf, 0xb8, 0xad, 0xaa, 0xa3, 0xa4,
    0xf9, 0xfe, 0xf7, 0xf0, 0xe5, 0xe2, 0xeb, 0xec, 0xc1, 0xc6, 0xcf, 0xc8, 0xdd, 0xda, 0xd3, 0xd4,
    0x69, 0x6e, 0x67, 0x60, 0x75, 0x72, 0x7b, 0x7c, 0x51, 0x56, 0x5f, 0x58, 0x4d, 0x4a, 0x43, 0x44,
    0x19, 0x1e, 0x17, 0x10, 0x05, 0x02, 0x0b, 0x0c, 0x21, 0x26, 0x2f, 0x28, 0x3d, 0x3a, 0x33, 0x34,
    0x4e, 0x49, 0x40, 0x47, 0x52, 0x55, 0x5c, 0x5b, 0x76, 0x71, 0x78, 0x7f, 0x6a, 0x6d, 0x64, 0x63,
    0x3e, 0x39, 0x30, 0x37, 0x22, 0x25, 0x2c, 0x2b, 0x06, 0x01, 0x08, 0x0f, 0x1a, 0x1d, 0x14, 0x13,
    0xae, 0xa9, 0xa0, 0xa7, 0xb2, 0xb5, 0xbc, 0xbb, 0x96, 0x91, 0x98, 0x9f, 0x8a, 0x8d, 0x84, 0x83,
    0xde, 0xd9, 0xd0, 0xd7, 0xc2, 0xc5, 0xcc, 0xcb, 0xe6, 0xe1, 0xe8, 0xef, 0xfa, 0xfd, 0xf4, 0xf3
  ];

  let crc = 2;

  for (let i=0; i<hexstring.length/2; i++) {
    const byte = parseInt(hexstring.substr(i*2,2),16);
    crc = TABLE[(crc ^ byte) & 0xff] & 0xff;
  }
  crc^=2;

  return crc.toString(16).padStart(2,"0");
}

//
// ********** MAIN PROGRAM **********
//

// Gmail setup (purely for sending "email to text" so that I can receive texts on cell phone when spa is ready)
const gmail = ENABLE.TEXTING && helpers.getGmail(path);
// For text notifications
const addressBook = ENABLE.TEXTING && helpers.getAddressBook(fs, path);

// If everything is ok and texting enabled, this will be true
spa.phone = ENABLE.TEXTING && gmail && addressBook;

// Survey yes or no
spa.survey = ENABLE.SURVEY;

// Set up weather requests
if (ENABLE.WEATHER) {
  helpers.initWeather(spa, io);
}

// Check for electricity savings time (7am to 7pm)
if (ENABLE.SAVE_ELECTRICITY) {
  helpers.setTimer({
    on:  2, // Turn it on at 2am
    off: 19 // Turn it off at 7pm
  }, spa);
}

// Active A/B temperature readings
if (ENABLE.AB_TEMP_SENSOR) {
  setTimeout(function() {
    if (spa.TC == "00") { // Only send command if not activated (it's a toggle command)
      sendCommand("setABTemp");
      debugTools.debug("A/B temperature sensor activated", 1, spa);
    } else {
      debugTools.debug("A/B temperature sensor already active", 1, spa);
    }
  },3000)
}


// Check every minute for internet connectivity, reset Pi if no internet (maybe something went wrong with wifi radio?)
ENABLE.REBOOT_LOSS_INTERNET && helpers.checkConnectivity(0);

// Setup weather graph data
let graphData = [];
helpers.initGraph(fs, path, spa, io, graphData);

// Every minute, check the spa time is right and adjust (if spa turned off, or daylight saving change)
setInterval(function () {setTime()}, 60 * 1000);

// Display startup messages
console.log("Running on " + new Date());
console.log("with the following parameters:")
for (let key in ENABLE) {
  console.log(`${key} : ${ENABLE[key]}`);
}

// Get some data for various settings (I still don't know what some of the responses mean...)
setTimeout( () => {
  sendCommand("filterConfigRequest");
  sendCommand("controlConfigRequest1");
  sendCommand("controlConfigRequest2");
  sendCommand("controlConfigRequest3");
  sendCommand("controlConfigRequest4");

  if (spa.debug.initialCommand != "") {
    sendCommand("test",spa.debug.initialCommand);
  }
}, 1 * 1000); // 1 sec

// Initial call to get fault log, then every 5 minutes
setTimeout( () => sendCommand("getFaults"), 1 * 1000);
setInterval( () => sendCommand("getFaults"), 5 * 60 * 1000); // 5 min

/*
// For testing!!!
let counter=0;
setInterval(function(){sendCommand("test","11 bf "+decToHex(counter));counter++;},500);
*/

//debugTools.test(); // one line to comment out -- just for testing!!!