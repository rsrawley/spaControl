/*
Balboa controller spa interface
Uses RS485 protocol


Smart heating ?

Winter hours
Time of use: Nov 1 to April 30
7pm to 7am : 10.1 c/kWh off-peak
7pm to 11am : 20.8 c/kWh on-peak
11pm to 5pm : 14.4 c/kWh mid-peak
5pm to 7pm : 20.8 c/kWh on-peak

So let it cool off at 7am - sep temp to 85F
Set to heat at 7pm - set to 96F
*/

/* Use

node spa.js 2>&1 | tee test1 &

in order to see output on terminal and save it to file
*/

// Don't forget every number from the hot tub is in hexadecimal !!!

// Replace [ \t]+\n by \n to get rid of trailing white space

// Set up file access
const fs = require('fs');

// Set up command line access
cmd = require('node-cmd');

// Check every minute for internet connectivity
checkConnectivity(0);

function checkConnectivity(numFails) {
	cmd.get('ping -c 5 8.8.8.8',
		function(err, data, stderr){
			if (err) {
				numFails++;

				if (numFails == 5) {
					cmd.run('sudo ifdown wlan0 && sudo ifup wlan0')
				} else if (numFails == 10) {
					cmd.run('sudo reboot')
				}
			} else {
				numFails = 0
			}
			setTimeout(function(){checkConnectivity(numFails)},60000) // Every minute
    }
	)
}

// Set up GPIO access
let gpio = require('onoff').Gpio;
let Vcc = new gpio(18,'high'); // Physical pin 12
let RE_DE = new gpio(23,'low'); // Physical pin 16

// Release all GPIOs on exit
process.on('SIGINT', function () {
	Vcc.unexport();
	RE_DE.unexport();
	process.exit()
})

// Set up client requests for weather
let request = require("request");
fetchWeather(); // Initial call
setInterval(fetchWeather, 5 * 60000); // Every 5 minutes after that

function fetchWeather() {
	request({"url": "http://192.168.1.58:3000", "json": true}, function (error, response, body) {
		if (!error && response.statusCode === 200) {
			let abort = 0;
			let weather = {};
			let params = { // Weather parameters I want to pick up
				current : ["temperature","feelsLike","wind","windDir","windGust"],
				hourly : ["hour","icon","temperature","feelsLike","wind","windDir","windGust","POP","rain","snow"]
			};

			for (let key in params) {
				weather[key] = {}; // Avoid undefined
				for (let i=0; i<params[key].length; i++) {
					// If anything goes wrong with weather info lookup, do not update weather values
					if (body[key][params[key][i]] == undefined) {
						abort = 1;
						break
					}

					weather[key][params[key][i]] = body[key][params[key][i]];
				}
			}
			
			if (abort != 1) {
				spa.weather = weather;
				io.emit('data',{"id" : "weather", "value" : spa.weather}); // Send to all connected clients
			}
		}
	})
}


// Set up web server
const express = require('express'); // Web server
const app = express();
const server = require('http').createServer(app);
server.listen(9000); // Start the webserver on port 9000
app.use(express.static(__dirname + '/html')); // Tell the server location of the static web pages

// Web socket server
io = require('socket.io').listen(server);

io.on('connection', function(socket){
  // Initial connection: send all params to client that just connected
  for (let key in spa) {
		if (key != "outbox" && key != "temp") { // "temp" can be removed -- it's for helping finding codes
			io.emit('data',{"id" : key, "value" : spa[key]});
		}
	}

	// Send initial graph data
	io.emit('graphData',graphData);


  // Messages received
  socket.on('command', function(command) {
  	console.log('SOCKET.IO - Received message: ' + JSON.stringify(command));
		sendCommand(command.type,command.param,checkError);
  })
})


// Sends message back if an error in sending command
function checkError(error) {
	io.emit('error',error);
	console.log(error);
}


// Every minute, check the time is right and adjust (if spa turned off, or daylight saving change)
setInterval(function () {setTime()},60000)

// Every 10 minutes, store spa temperature in array and write to file


function setTime() {
	if (spa.HH != undefined) { // Make sure we already have a connection
		// It's easier to use JS date objects to handle checking before and after midnight
		let currentDate = new Date();
		let hours = currentDate.getHours();
		let minutes = currentDate.getMinutes();

		let spaTime = new Date(2019,10,19,parseInt(spa.HH,16),parseInt(spa.MM,16)); // October 19, 2019 is an arbitrary date (I happened to work on this function that day)

		// As long as spa time is within +/- 1 min of actual time, we're not modifying it
		let lowerLimit = new Date(2019,10,19,hours,minutes - 1);
		let upperLimit = new Date(2019,10,19,hours,minutes + 1);
		if (!(spaTime.getTime() >= lowerLimit.getTime() && spaTime.getTime() <= upperLimit.getTime())) { // If not in right time, change it
			sendCommand("setTime",[hours,minutes],checkError);
//			console.log(lowerLimit,spaTime,upperLimit,spa.HH,spa.MM)
		}
	}
}

// Store all items in memory
let spa = {
	outbox : [], // Messages waiting to be sent to spa
};

spa.testing=[]; // Only used for testing (displaying changes in configs)

// Set up message translation matrix (codes must be unique as they are used to store data in spa{})
let incoming = { // Status update
	"ff af 13" : {
		"description" : "Status udpate",
						    //17 00 62 15 0a 00 00 00 00 08 0c 00 00 02 00 00 00 00 00 04 60 00 00 00 1e 00 00
		"codeLine" : "GF PF CT HH MM HM 00 TA TB FC HF PP 00 CP LF 00 00 00 00 CC ST TC 00 00 H2 00 00".split(" "),
		"codes" : {
			"GF" : "General flag (05 = on hold)", // set to 17 without A/B temperature sensor activated, set to 14 otherwise???
			"PF" : "Priming flag (on start, goes through different stages: 04,42,05,01,00 ---0x01 = Priming)",
			"CT" : "Current temperature (in F) -- 00 means no temp reading", // verified
			"HH" : "Hours", // verified
			"MM" : "Minutes", // verified
			"HM" : "Heating mode (0x00 = Ready, 0x01 = Rest, 0x03?? = Ready in rest))", // verified for 0 and 1
			"TA" : "Temp sensor A (inlet) (show hold remaining time if on hold : goes to 3c (60 min) first, then drops by 1 every minute)", // verified
			"TB" : "Temp sensor B (outlet)", // verified
			"FC" : "Filter cycle (04(low)/06(high) = cycle 1, 08(high) = cycle 2, ?? = both?? FC goes to 00 briefly when switching?)", // verified
			"HF" : "Heat flag (0x04 = on hold in temp range high, 0x0c = not heating (high), 0x2c = waiting (high), 0x1c = heating (high), subtract 4 from all values for low range)", // verified
			"PP" : "Pump status (0x02 for pump 1, 0x08 for pump 2, 0x0a for both -- added together)", // verified
			"CP" : "Circ pump (0x00 = off, 0x02 = on)", // verified
			"LF" : "Light flag (0x03 for on)", // verified
			"CF" : "Cleanup cycle flag (0x04 off, 0x0c for on)",
			"ST" : "Set temperature", // verified
			"TC" : "Temperature A/B flag (0x00 = off, 0x01  = on)", // verified
			"H2" : "Heat mode 2nd flag (0x00 = when HM is 01, 0x1e = when HM is 00, also goes to 00 if M8 set to off and goes back to 1e if M8 set to on)" // could be timer on m8?
		}
	},

	"10 bf 23" : { // Filter configuration
		"description" : "Filter configuration",
		"codeLine" : "1H 1M 1D 1E 2H 2M 2D 2E".split(" "),
		"codes" : {
			"1H" : "Filter 1 start hour (always 0-24)",
			"1M" : "Filter 1 start minute",
			"1D" : "Filter 1 duration hours",
			"1E" : "Filter 2 duration minutes",
			"2H" : "Filter 2 start hour, masking out the high order bit, which is used as an enable/disable flag (mod 128)",
			"2M" : "Filter 2 start minute",
			"2D" : "Filter 2 duration hours",
			"2E" : "Filter 2 duration minutes"
		}
	},

	"10 bf 24" : { // Control configuration 1 ***seems same as ff af 26***!!!!!!!
		"description" : "Control configuration 1",
						 	 // 64 c9 2c 00 4d 42 50 35 30 31 55 58 03 a8 2f 63 83 01 06 05 00
		"codeLine" : "00 00 00 00 B1 B2 B3 B4 B5 B6 B7 B8 00 00 00 00 00 00 00 00 00".split(" "),
		"codes" : {
			"B1 to B8" : "Motherboard model in ASCII"
		}
	},

	"10 bf 25" : { // Control configuration 2
		"description" : "Control configuration 2",
						 	 // 09 03 32 63 50 68 49 03 41 02
		"codeLine" : "00 00 00 00 00 00 00 00 00 00".split(" "),
		"codes" : {
		}
	},

	"10 bf 26" : { // Control configuration 3
		"description" : "Control configuration 3",
						 	 // 00 87 00 01 00 01 00 00 01 00 00 00 00 00 00 00 00 00
		"codeLine" : "00 00 RM TS TF CC 00 00 M8 00 00 00 00 00 00 00 00 00".split(" "),
		"codes" : {
			"RM" : "Reminders (0 = on, 1 = off)",
			"TS" : "Temperature scale (0 = Fahrenheit, 1 = Celsius)",
			"M8" : "M8 artificial intelligence (0 = off, 1 = on)",
			"TF" : "Time format flag (0 = 12h, 1 = 24h)",
			"CC" : "Cleaning cycle length (0 to 8, each integer is 0.5h increments)"
		}
	},

	"10 bf 2e" : { // Control configuration 4
		"description" : "Control configuration 4",
						 	 // 05 00 01 90 00 00
	},

	"10 bf 28" : { // Faults log
		"description" : "Faults log",
						 	 // 0c 0a 10 55 17 21 10 64 60 66
		"codeLine" : "TO EN EC ND FH FM FE FS FA FB".split(" "),
		"codes" : {
			"TO" : "Total number of entries", // verified
			"EN" : "Entry number (add one to hex number)", // verified
			"EC" : "Error code (see Spa Touch manual for list)", // verified
			"ND" : "Number of days ago", // verified
			"FH" : "Time (hour) of fault", // verified
			"FM" : "Time (minute) of fault", // verified
			"FE" : "Heat mode (01 = ready)", // verified
			"FS" : "Set temp", // verified
			"FA" : "Temp A", // verified
			"FB" : "Temp B" // verified
		}
	},

	"10 bf 2b" : { // GFCI test result
		"description" : "GFCI test result",
						 	 // 01
		"codeLine" : "GF".split(" "),
		"codes" : {
			"GF" : "GFCI test result (0 = not passed, 1 = passed)", // verified
		}
	}
}

// Some response codes have multiple aliases
incoming["ff af 26"] = incoming["10 bf 26"];

// Responses to ignore
let ignore = [
	"10 bf 06", // Ready to send command?
	"10 bf 07", // Nothing to send response from panel?
	"fe bf 00", // No idea, emitted every 1 second roughly
	"ff af 13" // Regular status updates (will be caught by functions, doesn't count as "response confirmation" from motherboard)
];

// Set up serial port
const SerialPort = require('serialport');
const Delimiter = require('@serialport/parser-delimiter');
const port = new SerialPort('/dev/ttyAMA0', {
  baudRate: 115200
});
const parser = port.pipe(new Delimiter({delimiter: Buffer.from('7e', 'hex') }));
parser.on('data', readData);

function readData(data) {
	data = data.hexSlice(); // Convert to hexadecimal string

	// Extract message length (first byte) and message type (next 3 bytes)
	let message = {
		"hex" : data.match(/../g).join(" "),
		"length" : parseInt(data.substr(0,2),16), // First byte is length (number of bytes in message) (2 characters in hex per byte, so number of characters is twice this number)
		"type" : data.substr(2,6), // Next 6 bytes is type of message
		"content" : data.substring(8,data.length-2).match(/../g), // Slice to the end (except the checksum) and put into array, split two characters at a time (the hex code)
		"checksum" : data.substr(-2,2) // Last byte is checksum
	}

	// In case no content in message (just contains length, message type and checksum)
	if (message.content == null) {
		message.content = []
	}

	if (data.length == message.length*2 && checksum(data.substring(0,data.length-2)) == message.checksum) { // Check proper message length and checksum

		// Insert spaces every two characters to match "human readable" object type defined at top of program
		message.type = message.type.substr(0,2) + " " + message.type.substr(2,2) + " " + message.type.substr(4,2);

		// For testing purposes
		displayMessages(message.type,message.content)

		// Has a message already been sent to motherboard ?
		// Verify that response is not in ignore list and is not the regular status update -- any other response will be deemed as confirmation of command received
		if (spa.readyToSend == "waiting on response"  && ignore.indexOf(message.type) == -1) {
			spa.readyToSend = "waiting on ready command";
			spa.waitingResponseTries = 0;
//console.log("response confirmation received")
		}

		// Translate message
		if (message.type == "10 bf 06" && spa.outbox.length > 0) { // "Ready for command" (I think??) and messages ready to be sent
//console.log(spa.readyToSend, spa.waitingResponseTries)

// spa.waitingResponseTries is used both to wait for ready command a few times AND for the response confirmation
			if ((spa.readyToSend == "waiting on ready command" && spa.waitingResponseTries == 0) || spa.waitingResponseTries == 30) { // Ready command received or no confirmation received, so giving up
//console.log("executing message function")
				spa.outbox[0](); // Execute first message function in the queue (and probably the only one)
				spa.outbox.shift(); // Remove message function from queue
				spa.readyToSend = "waiting on response";
				spa.waitingResponseTries = 0;

// I think the console.log() is significantly slowing down the timing and causing some message not to be sent at the right time...
			} else if (spa.readyToSend == "waiting on ready command") { // Wait for a few  "Ready command" before sending next message
				spa.waitingResponseTries++;

			} else if (spa.readyToSend == "waiting on response") {
				spa.waitingResponseTries += 1;

			} else { // control variables have not been initialized yet
				spa.readyToSend = "waiting on ready command"
				spa.waitingResponseTries = 0;
			}

		} else if ((message.type in incoming && ignore.indexOf(message.type) == -1) || message.type == "ff af 13")  { // I have a definition for this message type and it is not in the ignore list or it's the regular status update

			let codeLine = incoming[message.type].codeLine; // Order of codes
			let codes = incoming[message.type].codes; // Translation of codes

			// Go through message content and translate byte by byte
			if (codeLine != undefined) { // Has a code line been defined for this message type ?
				for (let i=0; i<message.length; i++) {
					if (codeLine[i] in codes) { // If a code exists in codeLine, store in spa{}
						spa[codeLine[i]] = message.content[i]; // Update items in memory
						io.emit('data',{"id" : codeLine[i], "value" : spa[codeLine[i]]}); // Send to all connected clients
					}
				}
			}
		}
	}
}


function sendCommand(requested,param,callBackError) {
	console.log(requested)
  // Some messages need config requests to be sent first
  let type;
  let content = "";

	if (requested == "toggleItem") { // verified
  	type = "10 bf 11";

		let allowed = {"pump1" : "04", "pump2" : "05", "lights" : "11", "heatMode" : "51", "tempRange" : "50", "hold" : "3c"};
		if (param in allowed) {
			content = allowed[param] + "00";
		} else {
			return callBackError("Error in " + requested);
		}

	} else if (requested == "setTemp") { // verified
  	type = "10 bf 20";
//range is 80-104 for F, 26-40 for C in high range
//range is 50-80 for F, 10-26 for C in low range
		if (param >= 50 && param <= 104) { // how to know if in low/high range???
			content = decHex(param);
			spa.lastChangeToTemp = new Date().getTime(); // Keep track of when temperature was changed (because of savElectricity() )
		} else {
			return callBackError("Error in " + requested);
		}

	} else if (requested == "setTime") {  // Expects param to be in [HH,MM] format // verified
  	type = "10 bf 21";

		if (param[0] >=0 && param[0] <=23 && param[1] >=0 && param[1] <= 59) { // Check hours and minutes within proper range
			content = decHex(param[0]) + decHex(param[1]);
		} else {
			return callBackError("Error in " + requested);
		}

	} else if (requested == "filterConfigRequest") { // verified
  	type = "10 bf 22";
		content = "01 00 00";

	} else if (requested == "controlConfigRequest1") { // verified
  	type = "10 bf 22";
		content = "02 00 00";

	} else if (requested == "controlConfigRequest2") { // verified -- unknown what response means
  	type = "10 bf 22";
		content = "04 00 00";

	} else if (requested == "controlConfigRequest3") {  // verified
  	type = "10 bf 22";
		content = "08 00 00";

	} else if (requested == "controlConfigRequest4") { // verified  -- unknown what response means
  	type = "10 bf 22";
		content = "00 00 01";

	} else if (requested == "getFaults") {
  	type = "10 bf 22";
		content = "20 ff 00";

  	if (param != undefined) {
  		content = "20" + decHex(param) + "00"
  	}

	} else if (requested == "getGfciTest") {  // verified
  	type = "10 bf 22";
		content = "80 00 00";

	} else if (requested == "setFilterTime") {  // verified
  	//type = "10 bf 23";
		//content = "80 00 00";

	} else if (requested == "setReminders") { // verified
  	type = "10 bf 27";
		if (param == 0 || param == 1) { // 0 : on, 1 : off
			content = "00" + decHex(param);
		} else {
			return callBackError("Error in " + requested);
		}

	} else if (requested == "setTempScale") { // verified
  	type = "10 bf 27";

		if (param == 0 || param == 1) { // 0 : Fahrenheit, 1 : Celsius
			content = "01" + decHex(param);
		} else {
			return callBackError("Error in " + requested);
		}

	} else if (requested == "setTimeFormat") { // verified
  	type = "10 bf 27";

		if (param == 0 || param == 1) {
			content = "02" + decHex(param);
		} else {
			return callBackError("Error in " + requested);
		}

	} else if (requested == "setCleanCycle") { // verified
  	type = "10 bf 27";

		if (param >= 0 && param <= 8) { // Each integer represents 30 min increments
			content = "03" + decHex(param);
		} else {
			return callBackError("Error in " + requested);
		}

	} else if (requested == "setM8") {  // verified
  	type = "10 bf 27";
		if (param == 0 || param == 1) {
			content = "06" + decHex(param);
		} else {
			return callBackError("Error in " + requested);
		}

	} else if (requested == "setABTemp") {  // verified
  	type = "10 bf e0";
		content = "03";

	} else if (requested == "test") {  // only for testing (sending commands directly from web page)
		type = param;
	}

	prepareMessage(type + content);
}


function displayMessages(type,content) {
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

	//let ignore = [];

	if (check1 != check2 || ignore.indexOf(type) == -1) {  // Let's see what's changed with the last update
		let output = [];

		for (let i=0; i<content.length;i++) {

			if (spa.testing[type][i] != content[i]) {
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
}


// Converts a decimal into a hexadecimal
function decHex(number) {
	return parseInt(number,10).toString(16).padStart(2,"0")
}


// Get message ready for sending and add it to outbox queue
function prepareMessage(data) {
	// Remove all spaces
	data = data.replace(/ /g, '');

	// Compute length of final message (+1 for length byte and +1 for checksum byte)
	let length = data.length/2 + 2;
	data = length.toString(16).padStart(2,"0") + data;

	// Compute CRC8 checksum
	let crc = checksum(data);
	data = data + crc;

	// Append message start and end bytes
	data = "7e" + data + "7e";

	// Change HEX string to ASCII characters
	let asciiString="";
	for (let i=0; i<data.length/2; i++) {
		asciiString = asciiString + String.fromCharCode(parseInt(data.substr(i*2,2),16))
	}

	// Add to message ready to send queue (the message is a whole function)
	spa.outbox.push(getTransmissionFunc(asciiString,data));
}


// Returns a function that needs to be executed when sending message
function getTransmissionFunc(asciiString,hexString) {
	return 	function() {
		RE_DE.write(1, function() { // Switch RS485 module to transmit
			port.write(asciiString, 'ascii', function(err) {
			  if (err) {
			    return console.log('Error on write: ', err.message)
			  }

				console.log("Sending: " + hexString);

			  // Switch RS485 module back to receive
			  RE_DE.write(0);
			})
		})
	}
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

console.log("Ready");

// Get some data for various settings (I still don't know what some of the responses mean...)
setTimeout(function() {
	for (let i=0; i<=1; i++) { // Do this twice in case it doesn't go through first time for some reason
		sendCommand("filterConfigRequest","",checkError);
		sendCommand("controlConfigRequest1","",checkError);
		sendCommand("controlConfigRequest2","",checkError);
		sendCommand("controlConfigRequest3","",checkError);
		sendCommand("controlConfigRequest4","",checkError);
	}
},2000);

// Active A/B temperature readings
setTimeout(function() {
	if (spa.TC == "00") { // Only send command if not activated (it's a toggle command)
		sendCommand("setABTemp","",checkError);
		console.log("A/B temperature sensor activated")
	} else {
		console.log("A/B temperature sensor already active")
	}
},3000)


// *************** Graph set up ***************

// Read file to get data (if it exists)
//let graphData = fs.readFileSync('graphData','utf8', function(err,data) {
let graphData = [];
fs.readFile('graphData','utf8', function(err,data) {
	if (err) {
		console.log("Error reading graph data from file OR file does not exist.")
	} else {
		console.log("Graph data was read from file.");
		graphData = JSON.parse(data);
	}
});

// Read temperatures every 5 minutes for graph
setInterval(function() {
	// Data format ['Time','Spa','Exterior','Heating']
	let heatStatus = 0;
	if (["2c","1c","28","18"].includes(spa.HF)) {
		heatStatus = 1
	}

	// Time to nearest minute[0], spa temperature[1], outside temperature[2], heat status[3]
	graphData.push([Math.round(new Date().getTime()/1000/60)*60,parseInt(spa.CT,16),parseInt(spa.weather.temperature,10),heatStatus]);

	// Keep only last 24 hours data (12 data points per hour and 24 h)
	if (graphData.length >= 288) {
		graphData.shift()
	}

	io.emit('graphData',graphData);
	
	// Find last time period heating was on
	
	
	// Compute delta time and delta temp for heating rate
	
	// Find last time temperature was at highest and heating started OR time for lowest temperature started
	let last = graphData.length-1;
	let heatingPeriods = [];
	let coolingPeriods = [];
	
	// Is it heating or not?
	if (graphData[last][3] == 1) {
		heatingPeriods.unshift(last)
	} else {
		coolingPeriods.unshift(last)
	}
	
	for (let i=last-1; i>=0; i--) { // Go backwards through the array, skipping the very last one
		// Check if heating and that we're still in a heating period
		if (graphData[i][3] == 1 && heatingPeriods[0]<coolingPeriods[0]) {
			heatingPeriods.unshift(i)
			coolingPeriods.unshift(i+1)
		} else {
			heatingPeriods.unshift(i+1)
			coolingPeriods.unshift(i)
		}
	}
	
	// Compute delta time and delta temp for cooling rate

	// example : 
	
},5*60000);

// Save to file every hour
setInterval(function() {
	fs.writeFile('graphData', JSON.stringify(graphData), 'utf8', function(err) {
  	if (err) {
  		console.log("Error saving graph data.")
  	} else {
  		console.log('Graph data saved.');
  	}
	});
},60*60000);




// Check for electricity savings time (7am to 7pm)
setTimer(2,1); // Initial call to turn it on at 2am
setTimer(19,0); // Initial call to turn it off at 7pm

function setTimer(hour,saveElectricityFlag) {
	let currentTime = new Date().getTime();
	let shutOffTime = new Date().setHours(hour,0,0,0); // Set it to 7am/7pm same day

	let timeDelay = shutOffTime - currentTime;

	if (timeDelay <= 0) { // 7am/7pm is in the past, so add 24 h
		timeDelay = timeDelay + 24*60*60*1000
	}

	setTimeout(getTimeoutFunc(hour,saveElectricityFlag),timeDelay);
}

function getTimeoutFunc(hour,saveElectricityFlag) {	
	return function() {
		saveElectricity(saveElectricityFlag);
		setTimer(hour,saveElectricityFlag);
	}
}

function saveElectricity(activate) {
	// More than 2 hours since last temperature change
	if (new Date().getTime() - spa.lastChangeToTemp > 2 * 60 * 60 * 1000) {
		if (activate == 1) {
			sendCommand("setTemp",80,checkError); // Lower temperature to 80 F to save electricity
		} else {
			sendCommand("setTemp",96,checkError); // Raise temperature back to 96 F to heat it back up during cheap time
		}
	}
}



function polysolve(valeurs,degree) {
  // Référence : https://arachnoid.com/sage/polynomial.html
  let n = valeurs.length; // Nombre de données
  
  // Prendre les valeurs de x and la 1e colonne et y dans la 2e
  let x = [], y = [];
  for (let i=0; i<n; i++) {
    x[i] = valeurs[i][0];
    y[i] = valeurs[i][1];
  }
  
  let m = []; // Matrice à résoudre
  for (let r=0; r<=degree; r++) { // Row (r)
    m[r] = []
    
    for (let c=0; c<=degree; c++) { // Column (c)
      m[r][c] = 0
      
      for (let i=0; i<n; i++) { // Somme jusqu'à n-1
        m[r][c] = m[r][c] + Math.pow(x[i],r+c) // x[i]^(r+c)
      }
    }
  }
  
  // On rajoute la matrice à droite comme une colonne dans la matrice à gauche  
  for (let r=0; r<=degree; r++) { // Row (r)
    let somme = 0;
    
    for (let i=0; i<n; i++) { // Somme jusqu'à n-1
      somme = somme + Math.pow(x[i],r)*y[i]
    }
    m[r].push(somme);
  }
  
  // Il faut résoudre la matrice avec élimination Gauss-Jordan
  for (let i=0; i<=degree; i++) {
    let coeff = m[i][i];

    for (let c=0; c<=degree+1; c++) { // Column (c)
      m[i][c] = m[i][c] / coeff // Ajuster tous les coefficients pour avoir un 1 dans la colonne qu'on veut résoudre
    }
    
    // Ajuster toute la matrice pour avoir des zéros partout dans la colonne, sauf celle qu'on vient d'ajuster ci-haut
    for (let r=0; r<=degree; r++) {  // Row (r)
      if (r != i) {
        let coeff = m[r][i];
        
        for (let c=0; c<=degree+1; c++) { // Column (c)
          m[r][c] = m[r][c] - coeff * m[i][c]
        }        
      }
    }
  }
  
  // Valeur de retour
  let coefficients = [];
  
  for (let i=0; i<=degree; i++) {
    coefficients.push(m[i][degree+1])
  }
	
  return coefficients // Array qui contient les coefficients de x^0 à x^n
}
