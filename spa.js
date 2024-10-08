/*


Fix line 266 setTime()





*/

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
	TEXTING 						 : true, // Spa will send a text when temperature ready (requires some gmail setup)
	SURVEY 							 : true, // Link to Google Drive survey for comfort level (eventually analyze my responses to determine "best" wind, outside temp and spa temp conditions)
	WEATHER 						 : true, // Set this to false if you don't care about weather in web interface
	SAVE_ELECTRICITY		 : true, // Lowers and raises spa set temperature based on time of day to save on electricity costs
	AB_TEMP_SENSOR			 : false, // A/B temperature sensor (in and out of heater)
	REBOOT_LOSS_INTERNET : false // Normally I keep this disabled
}

const path = __dirname; // Current directory where main.js was launched

// Set up file access
const fs = require('fs');

// Gmail setup (purely for sending "email to text" so that I can receive texts on cell phone when spa is ready)
const gmail = ENABLE.TEXTING && (function () {
	// See gmail.js file for details on spa.credentials file format
	let result;
	try {
		result = require(`${path}/gmail.js`)(`${path}/../spa.credentials`);
	} catch(err) {
		// An error here is not critical -- program will still function
		console.log("WARNING : Error when setting up gmail script.  Texting will not be available.");
		//console.log(err); // Uncomment to see detailed error
	}
	return result; // undefined if error
})()

const addressBook = ENABLE.TEXTING && (function () {
	/*
	- addressBook is a text file that matches IP addresses to emails
	- when a user asks for text notification in the web interface, the IP address is obtained 
	so that it can be matched up in the address book to an email address, and finally sent to an "email to text server"
	- text file has this format, one IP per line :
	{
	"192.168.1.someNumber" : "phoneNumber@someProvider",
	}
	*/
	let result;
	try {
		result = JSON.parse(fs.readFileSync(`${path}/../spa.addressbook`,'utf8'));
	} catch(err) {
		// An error here is not critical -- program will still function
		console.log("WARNING : Error parsing address book.  Texting will not be available.");
		//console.log(err); // Uncomment to see detailed error
	}
	return result; // undefined if error
})()


// Check every minute for internet connectivity, reset Pi if no internet (maybe something went wrong with wifi radio?)
if (ENABLE.REBOOT_LOSS_INTERNET) {
	checkConnectivity(0);
}
function checkConnectivity(numFails) {
	// Set up command line access
	cmd = require('node-cmd');

	cmd.get('ping -c 5 8.8.8.8',
		function(err, data, stderr){
			if (err) {
				numFails++;

				if (numFails == 5) {
				console.log("Toggling radios");
					cmd.run('sudo ip link set wlan0 down && sudo ip link set wlan0 up');
					console.log("Radios toggled");
				} else if (numFails == 10) {
					console.log("Attempting reboot");
					cmd.run('sudo reboot');
				}
			} else {
				numFails = 0;
			}
			setTimeout(function(){checkConnectivity(numFails)},60000); // Every minute
    }
	)
}


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

// Set up client requests for weather
/* Note : this is a weather server that I run on the same Pi.  It gets weather info
   from The Weather Network every 10 minutes and sends it out to any device that request it
   on my network.  That way, my devices always see the same JSON structure and my server can
   be modified if TWN ever catches on.

   If people are interested, I could make the weather repo public.
 */
let request;
if (ENABLE.WEATHER) {
	request = require("request2.0");
	setTimeout(fetchWeather,30000); // Initial call -- wait half a minute for weather service to start on Pi reboot
//	setTimeout(fetchWeather,0); // delete this line !!!
	setInterval(fetchWeather, 5 * 60000); // Every 5 minutes after that
}

function fetchWeather() {
	request({"url": "http://192.168.1.58:3000", "json": true}, function (error, response, body) {
		if (!error && response.statusCode === 200 && body != undefined) {
			let params = { // Weather parameters I want to pick up
				current : ["icon","temperature","feelsLike","wind","windDir","windGust","high","low","sunrise","sunset","sunrise_gmt","sunset_gmt","airQualityIndex","airQualityLevel","moonRise","moonSet","moonPhase"],
				hourly : ["hour","milli","icon","temperature","feelsLike","wind","windDir","windGust","POP","rain","snow"]
			};

			for (let key in params) {
				if (!spa.weather[key]) { // Avoid undefined
					spa.weather[key] = {};
				}
				params[key].forEach(parameter => {
					if (body[key][parameter] != undefined) {
						spa.weather[key][parameter] = body[key][parameter];
					}
				});
			}

			io.emit('weather',spa.weather); // Send to all connected clients
		}
	})
}


// Set up web server
const express = require('express'); // Web server
const app = express();
const server = require('http').createServer(app);
server.listen(9000); // Start the webserver on port 9000
app.use(express.static(__dirname + '/html')); // Tell the server location of the static web pages


/* ==================
// EXPERIMENTAL : Interfacing with Google Home so that I can ask/set temperature with "OK Google"

// Set up API -- information request
app.get('/:getInfo',function(req,res,next) {
	let validReq = ["CT","ST"];

	if (req.params.apiRequest != undefined) { // Valid request
		if (validReq.includes(req.params.apiRequest)) {
			res.status(200).json(parseInt(spa[req.params.apiRequest],16));
		} else {
			res.status(400).json("Requested info type not available.  Available types are: " + validReq.toString())
		}
	}
})

// Set up API -- action request
app.get('/:action',function(req,res,next) {
	let validReq = ["ST"];

	if (req.params.apiRequest != undefined) { // Valid request
		if (validReq.includes(req.params.apiRequest)) {
			res.status(200).json("OK");
		} else {
			res.status(400).json("Requested forecast type not available.  Available types are: " + validReq.toString())
		}
	}
})
================== */

// Web socket server
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
	if (!gmail || !addressBook) {
		socket.emit('texting','disabled');
	}

  // Messages received
  socket.on('command', function(command) {
  	debug('SOCKET.IO - Received message: ' + JSON.stringify(command), 3);

  	if (command.type == "debugLevel") {
  		spa.debug.level = command.param;
  		socket.emit('data',{debug: spa.debug});
  	} else {
			sendCommand(command.type,command.param,checkError,ipAddress);
		}
  })

  // Set up notificaton by text
  socket.on('notifyByText', function() {
		spa.notify[ipAddress] = {"ST":spa.ST, "time":Date.now()}; // Store set temp that was asked under IP address and the time as well
  })
})


// Sends message back if an error in sending command
function checkError(error) {
	io.emit('error',error);
	console.log(error);
}


// Every minute, check the spa time is right and adjust (if spa turned off, or daylight saving change)
setInterval(function () {setTime()}, 5000); // 60000
function setTime() {
	if (spa.HH) { // Make sure we already have a connection
		let currentDate = new Date();
		let hours = currentDate.getHours();
		let minutes = currentDate.getMinutes();
		
		// As long as spa time is within +/- 1 min of actual time, we're not modifying it (computing difference between current time and spa time below)
		if (true || Math.abs((Date.now() - currentDate.setHours(parseInt(spa.HH,16),parseInt(spa.MM,16)))) > 1*60*1000) {
			sendCommand("setTime",[hours,minutes],checkError);
			console.log(hours,minutes)
		}
	}
}


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
	phone: ENABLE.TEXTING && gmail && addressBook, // If everything is ok and texting enabled, this will be true
	survey: ENABLE.SURVEY
}
spa.debug.deactivate(); // After timer goes off, disable debugging
spa.testing = []; // Only used for testing (displaying changes in configs)

// Initialize registration variables
spa.registration.clear();

// Set up message translation matrix (codes must be unique as they are used to store data in spa{})
let incoming = require(`${path}/spaCodes.js`).incoming;


// Set up serial port
const SerialPort = require('serialport');
const Delimiter = require('@serialport/parser-delimiter');
const port = new SerialPort('/dev/ttyAMA0', { baudRate: 115200 }); // Talking to RS485 adapter on Pi's serial port uart0 (ttyAMA0 are physical pins 8 and 10)
const parser = port.pipe(new Delimiter({delimiter: Buffer.from('7e', 'hex') })); // Spa messages have 0x7e at beginning and end
parser.on('data', readData);

function readData(data,testing) {
  //console.log(data)
	data = data.toString('hex'); // Convert to hexadecimal string

	// Extract message contents : length (first byte) and message type (next 3 bytes), etc.
	let message = {
		"hex" : data.match(/../g).join(" "), // Store complete HEX for debugging
		"length" : parseInt(data.substr(0,2),16), // First byte is length (number of bytes in message) (2 characters in hex per byte, so number of characters is twice this number)
		"type" : data.substr(2,6), // Next 6 bytes is type of message
		"content" : data.substring(8,data.length-2).match(/../g) || [], // Slice to the end (except the checksum) and put into array, split two characters at a time (the hex code); empty array if no content
		"checksum" : data.substr(-2,2) // Last byte is checksum
	}

	if (data.length == message.length*2 && checksum(data.substring(0,data.length-2)) == message.checksum) { // Check proper message length and checksum
		// Insert spaces every two characters to match "human readable" object type defined at top of program
		message.type = message.type.match(/../g).join(" "); //message.type.substr(0,2) + " " + message.type.substr(2,2) + " " + message.type.substr(4,2);

		// For testing purposes
		displayMessages(message.type,message.content);

		// Translate message (Attention! Order of if statements matters for registration)
		if (message.type == spa.registration.existingClientQuery) { // Motherboard rebooted and is querying existing clients.  Let it know we have an existing channel!
			// Reset channel registration to force program to register again
			spa.registration.clear();
			debug("Spa rebooted.  Attempting to register on a channel...",1);

		} else if (! spa.registration.preferredAlreadyActive) { // Prefer a certain channel first before trying to register on a new one
			// The intention for a "preferred channel" is to avoid ever increasing channel number assignments
			// when running spa program multiple times during testing...
			// The assumption here, of course, is that there is no other device that is using this channel!

			if (message.type == spa.registration.preferredChannel + " bf 06") { // CTS for our preferred channel, which means it's already registered so re-use it
				spa.registration.preferredAlreadyActive = true;
				spa.registration.registered = true; // Next step (new channel registration) will be skipped that way
				registerChannel(spa.registration.preferredChannel);
				debug("Registering on preferred channel " + spa.registration.preferredChannel, 1);
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
				debug("Registered on channel " + spa.registration.channel, 1);

			}	else if (spa.registration.channel != 0 && message.type == "fe bf 00" && spa.registration.step == 3) { // Spam acknowledgement until it clears
				spa.registration.acknowledge(); // (step 4 - send channel acknowledgement; for some reason, I have to keep spamming it as the board responds unregularly)
				spa.registration.step = 4;
				debug("Sending channel acknowledge", 1);
				spa.registration.tries++;

				if (spa.registration.tries > 100) {
					throw "Unable to register with main board."
				}

			} else if (message.type == "fe bf 02" && spa.registration.step == 2) { // ff bf 02 is main board channel assignment response	 (step 3 - board response with channel)
				if (message.content[1] + " " + message.content[2] == spa.registration.identifierCode) {
					registerChannel(message.content[0]);
					spa.registration.step = 3;
				} else { // Main board sent response, but it's not for our identifier code
					spa.registration.clear();
					debug("Possible conflict in requesting address, trying again.", 1);
				}

			} else if (message.type == "fe bf 00" && spa.registration.step == 1) { // Step 1 - board request for new clients
				prepareMessage("fe bf 01 02 " + spa.registration.identifierCode)(); // (step 2 - new channel request with identifier code)
				spa.registration.step = 2;
				//prepareMessage("fe bf 01 02 76 57")();
				debug("Sending new channel request", 1);
			}

		} else if (message.type == spa.registration.clearToSend) { // "Ready for command" from board
				if (spa.outbox.length > 0) { // Messages ready to be sent ?
					spa.outbox[0](); // Execute first message function in the queue (and probably the only one)
					spa.outbox.shift(); // Remove message function from queue
				} else {
					spa.registration.nothingToSend();
				}

		} else if (message.type in incoming || message.type == "ff af 13")  { // I have a definition for this message type and it is not in the ignore list or it's the regular status update

			let codeLine = incoming[message.type].codeLine; // Order of codes
			let codes = incoming[message.type].codes; // Translation of codes

			// Go through message content and translate byte by byte
			if (codeLine != undefined) { // Has a code line been defined for this message type ?
				for (let i=0; i<message.length; i++) {
					if (codeLine[i] in codes) { // If a code exists in codeLine, store in spa{}

						if (spa[codeLine[i]] != message.content[i]) { // Only update if not the same value
							spa[codeLine[i]] = message.content[i]; // Update items in memory
							io.emit('data',{[codeLine[i]] : spa[codeLine[i]]}); // Send to all connected clients

							// Text phone if set temp was reached
							if (codeLine[i] == "CT") { // CT = current temperature
								for (let ipAddress in spa.notify) {
									if (Date.now() > spa.notify[ipAddress].time + 6 * 3600 * 1000) { // More than 6 hours since asked for text, so delete
										delete spa.notify[ipAddress]; // Remove the notification for that IP address
									} else if (spa.notify[ipAddress].ST == spa.CT) {
										textPhone("ST",ipAddress,parseInt(spa.CT,16)); // Store set temp that was asked under IP address
										delete spa.notify[ipAddress]; // Remove the notification for that IP address
									}
								}
							}

							if (["CT","ST"].includes(codeLine[i])) {
								estimatedTime(); // If CT OR ST changed, recompute estimated time based on set temperature ST
							}
						}
					}
				}
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

		// Rename object keys in "incoming" object that holds all codes with the proper channel number (stored as "xx" in file)
		for (let key in incoming) {
			let newKey = key.replace("xx",channel);
			if (newKey != key) { // ff af 13 doesn't get changed (no "xx" in it)
				incoming[newKey] = incoming[key];
				delete incoming[key];
			}
		}
	}
}


//////////////////////////////// For forcing messages for testing only !!!
//test(); // one line to comment out
function test() {
	setTimeout(function(){
	//setInterval(function(){
		console.log("testing now");
		//let data="ffaf1314005f0e1600006060040c000002000000000004600100001e0000"
		let data="11bf04"
	  //                  CT

		// Compute length of final message (+1 for length byte and +1 for checksum byte)
		let length = data.length/2 + 2;
		data = length.toString(16).padStart(2,"0") + data;

		// Compute CRC8 checksum
		let crc = checksum(data);
		data = data + crc;

		readData(Buffer.from(data,'hex'),1)
	},8000)
}
////////////////////////////////


////////////////////////////////
// This is purely for making debugging hex messages easier to see (differences between messages will be highlighted)
function displayMessages(type,content) {
	let noColor = spa.debug.noColor;
	let raw = spa.debug.raw;true;
	let output = "";
	if (spa.testing[type] == undefined) {
		spa.testing[type] = []
	}

	// Don't want to see status update because only time changed
	let check1 = spa.testing[type].join(" ");
	let check2 = content.join(" ");

	if (type == "ff af 13"  ) {
		// Cut out the hours and minutes
		check1 = check1.slice(0,9) + check1.slice(15);
		check2 = check2.slice(0,9) + check2.slice(15);
	}

	// Codes to ignore while debugging
	let ignore = [];
	if (spa.debug.level < 3) { ignore.push("ff af 13","fe bf 00") };
	if (spa.debug.level < 2) { ignore.push("") };
	if (spa.debug.level < 1) { ignore.push("") };
/*
	if (! spa.debug.bf06and07Messages && ! type.match(/bf 0[67]/)) {
		console.log(spa.debug.bf06and07Messages,type.match(/bf 0[67]/)==true)
		return // Ignore bf 06 and 07 messages
	}
*/
	if (spa.debug.level == 4 || (spa.debug.level > 0 && (ignore.indexOf(type) == -1) && ! type.match(/bf 0[67]/))) { // Ignore CTS from other channels and anything in ignore list
		if (! raw) {
			if (check1 != check2) {  // Let's see what's changed with the last update
				let output = [];

				for (let i=0; i<content.length;i++) {

					if (spa.testing[type][i] != content[i] && ! noColor) {
						output.push("\033[93m" + content[i] + "\033[37m") // splash of yellow color
					} else {
						output.push(content[i])
					}
				}

				if (incoming[type] != undefined) {
					console.log("type: ",type," (",incoming[type].description,")")
				} else {
					console.log("type: ",type)
				}

				if (spa.testing[type].length > 0 || output.length > 0) {
					console.log("old: ",spa.testing[type].join(" "));
					console.log("new: ",output.join(" "));
				}
				if (incoming[type] != undefined && incoming[type].codeLine != undefined) {
					console.log("code:",incoming[type].codeLine.join(" "))
				}

				spa.testing[type] = [...content]; // clone array
			}
		} else if ((spa.debug.level > 0 && ! type.match(/bf 0[67]/) && type != "ff af 13") || spa.debug.allMessages || (spa.debug.statusUpdatesRecord && type == "ff af 13" && ! type.match(/bf 0[67]/))) {		
			console.log(type,content.join(" "));
		}
	}
}

function debug(message, level) {
	if (level <= spa.debug.level) {
		console.log(message);
	}
}
////////////////////////////////


// Email to text function: some cell phone carriers allow sending an email to a phone number that will be converted to a SMS
function textPhone(messageType,ipAddress,messageContent) {
	let messageTemplate = {
		"ST" : `Hot tub has reached ${messageContent} F.\nOutdoor ${spa.weather.current.temperature} C, feels like ${spa.weather.current.feelsLike} C.\nWind ${spa.weather.current.wind} kph, gusting ${spa.weather.current.wind} kph.${takeaHat()}`
	}

	if (ipAddress in addressBook) {
		console.log("Texting phone number listed under " + ipAddress);
		gmail({
			"recipient" : addressBook[ipAddress],
			"message"   : messageTemplate[messageType]
		})
	}

	// Determines whether to recommend to take a hat or not
	function takeaHat() {
		if (spa.weather.current.temperature <= 0 && spa.weather.current.wind >= 10) {
			return "\nTake a hat!"
		}
		return "" // Return nothing if conditions not met
	}
}


function sendCommand(requested,param,callBackError,ipAddress) {
  // Some messages need config requests to be sent first
  let type;
  let content = "";

	if (requested == "toggleItem") { // verified
  	type = "bf 11";

		let allowed = {"pump1" : "04", "pump2" : "05", "lights" : "11", "heatMode" : "51", "tempRange" : "50", "hold" : "3c"};
		if (param in allowed) {
			content = allowed[param] + "00";
		} else {
			return callBackError("Error in " + requested);
		}

	} else if (requested == "setTemp") { // verified
  	type = "bf 20";
		//range is 80-104 for F, 26-40 for C in high range
		//range is 50-80 for F, 10-26 for C in low range
		if ((param >= 50 && param <= 80 && ["00","08","28","18"].includes(spa.HF)) || (param >= 80 && param <= 104 && ["04","0c","2c","1c"].includes(spa.HF))) { // Using HF to figure out which range temperature is sett (high/low)
			content = decHex(param);
			spa.lastChangeToTemp = Date.now(); // Keep track of when temperature was changed (because of saveElectricity() )
		} else {
			return callBackError("Error in " + requested);
		}

	} else if (requested == "setTime") {  // Expects param to be in [HH,MM] format // verified
  	type = "bf 21";

		if (param[0] >=0 && param[0] <=23 && param[1] >=0 && param[1] <= 59) { // Check hours and minutes within proper range
			content = decHex(param[0]) + decHex(param[1]);
		} else {
			return callBackError("Error in " + requested);
		}

	} else if (requested == "filterConfigRequest") { // verified
  	type = "bf 22";
		content = "01 00 00";

	} else if (requested == "controlConfigRequest1") { // verified
  	type = "bf 22";
		content = "02 00 00";

	} else if (requested == "controlConfigRequest2") { // verified -- unknown what response means
  	type = "bf 22";
		content = "04 00 00";

	} else if (requested == "controlConfigRequest3") {  // verified
  	type = "bf 22";
		content = "08 00 00";

	} else if (requested == "controlConfigRequest4") { // verified  -- unknown what response means
  	type = "bf 22";
		content = "00 00 01";

	} else if (requested == "getFaults") {
  	type = "bf 22";
		content = "20 ff 00";

  	if (param != undefined) {
  		content = "20" + decHex(param) + "00"
  	}

	} else if (requested == "getGfciTest") {  // verified
  	type = "bf 22";
		content = "80 00 00";

	} else if (requested == "setFilterTime") {  // verified
  	//type = "bf 23";
		//content = "80 00 00";

	} else if (requested == "setReminders") { // verified
  	type = "bf 27";
		if (param == 0 || param == 1) { // 0 : on, 1 : off
			content = "00" + decHex(param);
		} else {
			return callBackError("Error in " + requested);
		}

	} else if (requested == "setTempScale") { // verified
  	type = "bf 27";

		if (param == 0 || param == 1) { // 0 : Fahrenheit, 1 : Celsius
			content = "01" + decHex(param);
		} else {
			return callBackError("Error in " + requested);
		}

	} else if (requested == "setTimeFormat") { // verified
  	type = "bf 27";

		if (param == 0 || param == 1) {
			content = "02" + decHex(param);
		} else {
			return callBackError("Error in " + requested);
		}

	} else if (requested == "setCleanCycle") { // verified
  	type = "bf 27";

		if (param >= 0 && param <= 8) { // Each integer represents 30 min increments
			content = "03" + decHex(param);
		} else {
			return callBackError("Error in " + requested);
		}

	} else if (requested == "setM8") {  // verified
  	type = "bf 27";
		if (param == 0 || param == 1) {
			content = "06" + decHex(param);
		} else {
			return callBackError("Error in " + requested);
		}

	} else if (requested == "setABTemp") {  // verified
  	type = "bf e0";
		content = "03";
	}

	if (requested == "test") {  // only for testing (sending commands directly from web page)
		type = param;
		prepareMessage(type, requested)();
	} else {
		type = spa.registration.channel + type;

		// Add to message ready to send queue (the message is a whole function)
		spa.outbox.push(prepareMessage(type + content, requested));
	}
}


// Converts a decimal into a hexadecimal
function decHex(number) {
	return parseInt(number,10).toString(16).padStart(2,"0");
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
						debug(`Sending: ${hexString.match(/../g).slice(2,-2).join(" ")} (${debugMessage})`, 3);					
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

console.log("Running on " + new Date());
console.log("with the following parameters:")
for (let key in ENABLE) {
	console.log(`${key} : ${ENABLE[key]}`);
}

// Get some data for various settings (I still don't know what some of the responses mean...)
setTimeout( () => {
	sendCommand("filterConfigRequest","",checkError);
	sendCommand("controlConfigRequest1","",checkError);
	sendCommand("controlConfigRequest2","",checkError);
	sendCommand("controlConfigRequest3","",checkError);
	sendCommand("controlConfigRequest4","",checkError);

	if (spa.debug.initialCommand != "") {
		sendCommand("test",spa.debug.initialCommand,checkError);
	}
}, 1000);

/*
let counter=0;
setInterval(function(){sendCommand("test","11 bf "+decHex(counter));counter++;},500);
*/

// Active A/B temperature readings
if (ENABLE.AB_TEMP_SENSOR) {
	setTimeout(function() {
		if (spa.TC == "00") { // Only send command if not activated (it's a toggle command)
			sendCommand("setABTemp","",checkError);
			debug("A/B temperature sensor activated", 1);
		} else {
			debug("A/B temperature sensor already active", 1);
		}
	},3000)
}


// *************** Graph set up ***************

// Read file to get data (if it exists)
//let graphData = fs.readFileSync('graphData','utf8', function(err,data) {
let graphData = [];
fs.readFile('graphData','utf8', function(err,data) {
	if (err) {
		console.log("WARNING: Error reading graph data from file OR file does not exist.")
	} else {
		debug("Graph data was read from file.", 1);
		graphData = JSON.parse(data);
		graphData = graphData.filter(dataPoint => (Date.now() - new Date(dataPoint[0]*1000))<=24*60*60*1000); // Only retain last 24 hours worth of data (only useful if program was not working for quite a while and so not gathering data -- it messes with the graph!)
	}
});

// Read temperatures every 5 minutes for graph
setTimeout(function(){
	setInterval(function() {
		// Sometimes on boot, the weather service is not ready to give out weather when spa.js is started, so the weather is undefined
		if (! spa.weather.current.temperature) {
			return // Abort function -- no weather data
		}

		// Data format ['Time','Spa','Exterior','Heating']
		let heatStatus = 0;
		if (["2c","1c","28","18"].includes(spa.HF)) {
			heatStatus = 1
		}

		// Time to nearest minute[0], spa temperature[1], outside temperature[2], heat status[3]
		graphData.push([Math.round(new Date().getTime()/1000/60)*60,parseInt(spa.CT,16),parseInt(spa.weather.current.temperature,10),heatStatus]);

		// Keep only last 24 hours data (12 data points per hour and 24 h) -- 5 minutes resolution
		if (graphData.length >= 288) {
			graphData.shift()
		}

		io.emit('graphData',graphData);
	},5*60000);
}, 5 * 60000 - Date.now() % (5 * 60000)); // Start recording graph data at the nearest 5 min interval


// Save to file every hour
setInterval(function() {
	fs.writeFile('graphData', JSON.stringify(graphData), 'utf8', function(err) {
  	if (err) {
  		console.log("Error saving graph data.")
  	} else {
  		//console.log('Graph data saved.');
  	}
	});
},60*60000);


// Check for electricity savings time (7am to 7pm)
if (ENABLE.SAVE_ELECTRICITY) {
	setTimer(2,1,true); // Initial call to turn it on at 2am
	setTimer(19,0,true); // Initial call to turn it off at 7pm
}
function setTimer(hour,saveElectricityFlag,firstCall) {
	let currentTime = new Date().getTime();
	let runTime = new Date().setHours(hour,0,0,0); // Set it to 7am/7pm same day

	let timeDelay = runTime - currentTime;

	if (timeDelay <= 0) { // 7am/7pm is in the past, so add 24 h
		timeDelay = timeDelay + 24*60*60*1000;
	}

	// More than 2 hours since last temperature change to activate lower temp, otherwise do nothing (user set a temp and expects it to stay that way...)
	if (!firstCall) {
		if (saveElectricityFlag == 1 && Date.now() - spa.lastChangeToTemp > 2 * 60 * 60 * 1000) {
			sendCommand("setTemp",80,checkError); // Lower temperature to 80 F to save electricity
		} else if (saveElectricityFlag == 0) {
			sendCommand("setTemp",96,checkError); // Raise temperature back to 96 F to heat it back up during cheap time
		}
	}
  setTimeout(() => setTimer(hour, saveElectricityFlag, false), timeDelay);
}


// Figures out how much time to heat the hot tub
function estimatedTime() {
	// Compute delta time and delta temp for heating rate
	let periods = [[],[]]; // [0,1 : cooling/heating][ [ [time,temperature],[time,temperature] ] , [ [time,temperature],[time,temperature] ] ]
	let lastHeatingRead;

	// Pick out heating and cooling periods
	for (let i = 0; i < graphData.length; i++) {
		// If it's not heating, it's cooling
		if (graphData[i][3] != lastHeatingRead) {
			periods[graphData[i][3]].push([])
		}
		periods[graphData[i][3]][periods[graphData[i][3]].length - 1].push([graphData[i][0],graphData[i][1]]);

		lastHeatingRead = graphData[i][3];
	}

	// Find the longest periods of cooling and heating
	let maxLength = [0,0];
	let longestInterval = [-1,-1]; // Set -1 to detect if it was modified
	for (let i = 0; i <=1; i++) {
		for (let j = 0; j < periods[i].length; j++) {
			if (periods[i][j].length > maxLength[i]) {
				maxLength[i] = periods[i][j].length;
				longestInterval[i] = j;
			}
		}
	}

	// Compute delta time and delta temp for cooling/heating rate (should be in deg F per second)
	for (let i = 0; i <=1; i++) {
		if (longestInterval[i] != -1) { // If we found an interval
			spa.rates[["cool","heat"][i]] = polysolve(periods[i][longestInterval[i]],1)[1] * 60; // Only pick out the slope, mutiply by 60 for per minute rate
		}
	}

	let deltaT = parseInt(spa.ST,16) - parseInt(spa.CT,16);
	let rate = 0;

	if (deltaT > 0) { // We're heating
		rate = spa.rates.heat
	} else if (deltaT < 0) { // We're letting it cool
		rate = spa.rates.cool
	}

	let time = new Date();
	if (rate != 0) {
		time.setMinutes(time.getMinutes() + deltaT/rate);
		spa.estimatedTime = `(${time.getHours().toString().padStart(2,"0")}:${time.getMinutes().toString().padStart(2,"0")})`;
		spa.deltaT = deltaT; // Just for something to check for background color in script.js
	} else {
		spa.estimatedTime = "";
	}

	io.emit('data',{estimatedTime : spa.estimatedTime}); // Converting date objet to HH:MM

	// Polynomial best fit solver (written by Raphaël Srawley -- yes, he speaks French too!)
	function polysolve(valeurs,degree) {
	  // Référence : https://arachnoid.com/sage/polynomial.html
	  // S'attend à un tableau de tableaux (de données) : [ [x1,y1] , [x2,y2] , ... ]

	  // Prendre les valeurs de x and la 1e colonne et y dans la 2e
	  let x = valeurs.map(donnee => donnee[0]);
	  let y = valeurs.map(donnee => donnee[1]);

	  let m = []; // Matrice à résoudre
	  for (let r=0; r<=degree; r++) { // Row (r)
	    m[r] = [];

	    for (let c=0; c<=degree; c++) { // Column (c)
	      m[r][c] = x.reduce((accumulator, currentValue) => accumulator + currentValue**(r+c), 0); // m[r][c] = m[r][c] + Math.pow(x[i],r+c) // x[i]^(r+c)
	    }
	  }

	  // On rajoute la matrice à droite comme une colonne dans la matrice à gauche
	  for (let r=0; r<=degree; r++) { // Row (r)
	    m[r].push(valeurs.reduce((accumulator, coord) => accumulator + coord[0]**r*coord[1], 0)); // somme = somme + Math.pow(x[i],r)*y[i];
	  }

	  // Il faut résoudre la matrice avec élimination Gauss-Jordan
	  for (let i=0; i<=degree; i++) {
	    let coeff = m[i][i];

	    for (let c=0; c<=degree+1; c++) { // Column (c)
	      m[i][c] = m[i][c] / coeff; // Ajuster tous les coefficients pour avoir un 1 dans la colonne qu'on veut résoudre
	    }

	    // Ajuster toute la matrice pour avoir des zéros partout dans la colonne, sauf celle qu'on vient d'ajuster ci-haut
	    for (let r=0; r<=degree; r++) {  // Row (r)
	      if (r != i) {
	        let coeff = m[r][i];

	        for (let c=0; c<=degree+1; c++) { // Column (c)
	          m[r][c] = m[r][c] - coeff * m[i][c];
	        }
	      }
	    }
	  }

	  // Valeur de retour
	  let coefficients = [];
	  for (let i=0; i<=degree; i++) {
	    coefficients.push(m[i][degree+1]);
	  }

	  return coefficients; // Array qui contient les coefficients de x^0 à x^n
	}
}
