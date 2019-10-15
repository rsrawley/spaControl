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
		if (key != "outbox") {
			socket.emit('data',{"id" : key, "value" : spa[key]});
		}
	}

  // Messages received
  socket.on('command', function(command) {
  	console.log('SOCKET.IO - Received message: ' + JSON.stringify(command));
		sendCommand(command.type,command.param,checkError);
  })
})


// Sends message back if an error in sending command
function checkError(error) {
	io.emit('error',error)
}


// Store all items in memory
let spa = {
	outbox : [] // Messages waiting to be sent to spa
};

// Set up message translation matrix (codes must be unique as they are used to store data in spa{})
let incoming = { // Status update
	"ff af 13" : { 
		"description" : "Status udpate",
						    //17 00 62 15 0a 00 00 00 00 08 0c 00 00 02 00 00 00 00 00 04 60 00 00 00 1e 00 00
		"codeLine" : "00 F1 CT HH MM F2 00 00 00 F3 F4 PP 00 CP LF 00 00 00 00 00 ST 00 00 00".split(" "),
		"codes" : {
			"F1" : "Flags 1 (0x01 = Priming)",
			"CT" : "Current temperature (in F)", // verified
			"HH" : "Hours", // verified
			"MM" : "Minutes", // verified
			"F2" : "Flags 2 (0x03 = Heating Mode (0 = Ready, 1 = Rest, 3 = Ready in rest))",
			"F3" : "Flags 3 (0x01 = Temperature scale or 0x02 = 24 hour time)",
			"F4" : "Flags 4 (0x30 = Heating or 0x04 = Temperature range (0=low, 1=high))",
			"PP" : "Pump status (0x02 for pump 1, 0x08 for pump 2)", // verified
			"CP" : "Circ pump (0x02 = on)",
			"LF" : "Light flag (0x03 for on)", // verified
			"ST" : "Set temperature" // verified
		}
	},
	
/*
08 10 bf 22 02 00 00 0a
1a 10 bf 24 64 c9 2c 00 4d 42 50 35 30 31 55 58 03 a8 2f 63 83 01 06 05 00 46
08 10 bf 22 08 00 00 8d
17 10 bf 26 00 87 00 00 00 01 00 00 01 00 00 00 00 00 00 00 00 00 6b
06 10 bf e0 03 0d
*/
	
	"10 bf 06" : {
		"description" : "Ready for command???" // Not confirmed
	},

	"10 bf 07" : {
		"description" : "No command to send???" // Not confirmed
	},

	"0a bf 94" : { // Control configuration?? Not confirmed
		
	},

	"0a bf 2e" : { // Control configuration 2?? Not confirmed
		
	}
}


// Set up serial port
const SerialPort = require('serialport');
const Delimiter = require('@serialport/parser-delimiter');
const port = new SerialPort('/dev/ttyAMA0', {
  baudRate: 115200
});
const parser = port.pipe(new Delimiter({ delimiter: Buffer.from('7e', 'hex') }));




/*
// delete all these lines below!!!!!


port.on('data', function (data) {
  console.log('Data:', data)
})

let parser ={on:function(){}}// delete this!!!!!!!!!!!!!!!!!
*/





parser.on('data', function(data) {
	data = data.hexSlice(); // Convert to hexadecimal string

	// Extract message length (first byte) and message type (next 3 bytes)
	let message = {
		"hex" : data.match(/../g).join(" "),
		"length" : parseInt(data.substr(0,2),16), // First byte is length (number of bytes in message) (2 characters in hex per byte, so number of characters is twice this number)
		"type" : data.substr(2,6), // Next 6 bytes is type of message
		"content" : data.substring(8,data.length-2).match(/../g), // Slice to the end (except the checksum) and put into array, split two characters at a time (the hex code)
		"checksum" : data.substr(-2,2) // Last byte is checksum
	}

//console.log(message.hex)	
	
	
	if (data.length == message.length*2 && checksum(data.substring(0,data.length-2)) == message.checksum) { // Check proper message length and checksum
		
		// Insert spaces every two characters to match "human readable" object type defined at top of program
		message.type = message.type.substr(0,2) + " " + message.type.substr(2,2) + " " + message.type.substr(4,2);
		
		// Translate message
		if (message.type == "10 bf 06" && spa.outbox.length > 0) { // "Ready for command" (I think??) and messages ready to be sent
			
			spa.outbox[0]() // Execute first message function in the queue (and probably the only one)
			spa.outbox.shift(); // Remove message function

		} else if (message.type in incoming) {
			
			let codeLine = incoming[message.type].codeLine; // Order of codes
			let codes = incoming[message.type].codes; // Translation of codes

if (incoming[message.type].description.search(/\?/) == -1) {
console.log(incoming[message.type].description, message.type + "|" + message.content.join(" "))
}
			
			// Go through message content and translate byte by byte
			if (codeLine != undefined) { // Has a code line been defined for this message type ?
				for (let i=0; i<message.length; i++) {
					if (codeLine[i] in codes) { // If a code exists in codeLine, store in spa{}
						spa[codeLine[i]] = parseInt(message.content[i],16) // Update items in memory
						io.emit('data',{"id" : codeLine[i], "value" : spa[codeLine[i]]}); // Send to all connected clients
					}
				}
			}
			
		} else {
			
			// All other messages not yet catalogued
			console.log(message.hex);
		}
	}
})


function sendCommand(request,param,callBackError) {
  let type;
  let content = "";
  
	if (request == "configRequest") {
  	type = "0a bf 04";
		
	} else if (request == "filterConfigRequest") {
  	type = "0a bf 22";
		content = "01 00 00";
		
	} else if (request == "toggleItem") {
  	type = "0a bf 11";
		
		let allowed = {"pump1" : "04", "pump2" : "05", "light" : "11", "heatMode" : "51", "tempRange" : "50"};
		if (param in allowed) {
			content = allowed[param] + "00";
		} else {
			callBackError("Error in toggleItem");
		}
		
	} else if (request == "setTemp") {
  	type = "0a bf 20";
		
		if (param >= 80 && param <= 104) {
			content = decHex(param);
		} else {
			callBackError("Error in setTemp");
		}
		
	} else if (request == "setTempScale") {
  	type = "0a bf 27";
		
		if (param == 0 || param == 1) { // 0 : Fahrenheit, 1 : Celsius
			content = decHex(param);
		} else {
			callBackError("Error in setTempScale");
		}
		
	} else if (request == "setTime") {  // Expects param to be in HH:MM format
  	type = "0a bf 21";
		param = param.split(":"); // Converts to an array with [0] as hours and [1] as minutes
		
		if (param[0] >=0 && param[1] <=23 && param[1] >=0 && param[1] <= 59) { // Check hours and minutes within proper range
			content = decHex(param[0]) + decHex(param[1]);
		} else {
			callBackError("Error in setTime");
		}
		
	} else if (request == "controlConfigRequest") {  // You must have previously sent general configuration request before sending this
  	type = "0a bf 22";
		content = "02 00 00";
	}
	
	let message = type + content;
	prepareMessage(message);
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
	spa.outbox.push(getTransmissionFunc(asciiString));
}


// Returns a function that needs to be executed when sending message
function getTransmissionFunc(asciiString) { 
	return 	function() {
		RE_DE.write(1, function() { // Switch RS485 module to transmit
			port.write(asciiString, 'ascii', function(err) {
			  if (err) {
			    return console.log('Error on write: ', err.message)
			  }

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