// Set up GPIO access
let gpio = require('onoff').Gpio;
//let Vcc = new gpio(18,'high'); // Physical pin 12
let RE = new gpio(23,'low'); // Physical pin 16
let DE = new gpio(24,'low'); // Physical pin 18

// Release all GPIOs on exit
process.on('SIGINT', function () {
	Vcc.unexport();
	RE.unexport();
	DE.unexport();
	process.exit()
})


// Set up message translation matrix
let translate = {
	"ffaf13" : {
		"description" : "Status udpate",
		"codeLine" : "00 F1 CT HH MM F2 00 00 00 F3 F4 PP 00 CP LF 00 00 00 00 00 ST 00 00 00".split(" "),
		"codes" : {
			"F1" : "Flags 1 (0x01 = Priming)",
			"CT" : "Current temperature (in F)",
			"HH" : "Hours",
			"MM" : "Minutes",
			"F2" : "Flags 2 (0x03 = Heating Mode (0 = Ready, 1 = Rest, 3 = Ready in rest))",
			"F3" : "Flags 3 (0x01 = Temperature scale or 0x02 = 24 hour time)",
			"F4" : "Flags 4 (0x30 = Heating or 0x04 = Temperature range (0=low, 1=high))",
			"PP" : "Pump status (0x03 for pump 1, 0x12 for pump 2)",
			"CP" : "Circ pump (0x02 = on)",
			"LF" : "Light flag (0x03 for on)",
			"ST" : "Set temperature"
		}
	},
	
/*	"10bf06" : {
		"description" : "Unknown1",
	},
*/	
	"" : {
		
	}
}

// Set up serial port

let temp=0;

const SerialPort = require('serialport');
const Delimiter = require('@serialport/parser-delimiter');
const port = new SerialPort('/dev/ttyAMA0', {
  baudRate: 115200
});
const parser = port.pipe(new Delimiter({ delimiter: Buffer.from('7e', 'hex') }));
parser.on('data', function(data) {
	data = data.hexSlice(); // Convert to hexadecimal string

	//data = "20ffaf131403610c2d000a6161040c000002000000000124600100001e00004a"

	// Extract message length (first byte) and message type (next 3 bytes)
	let message = {
		"hex" : data.match(/../g).join(" "),
		"length" : parseInt(data.substr(0,2),16), // Number of bytes (2 characters in hex per byte, so number of characters is twice this number)
		"type" : data.substr(2,6),
		"content" : data.substr(8).match(/../g) // Slice to the end and put into array, split two characters at a time (the hex code)
	}

	if (data.length != message.length*2) {
		console.log("Message length error!", data.length, message.length*2)
	} else {
		// Translate message
		if (message.type in translate) {
			console.log(translate[message.type].description)

			let codeLine = translate[message.type].codeLine; // Order of codes
			let codes = translate[message.type].codes; // Translation of codes
			// Go through message content and translate byte by byte
			for (let i=0; i<message.length; i++) {
				if (codeLine[i] in codes) { // If a code exists in codeLine, try to display it
					if (codeLine[i] == "ST") {
					console.log(codes[codeLine[i]] + " ==> " + parseInt(message.content[i],16))
					}
				}
			}
		}
	}



// For testing only:
	console.log("Data: " + message.hex)
let ignore = ["10bf06","10bf07","febf00","ffaf13"]
if (message.type in ignore) {
//	console.log("Data: " + message.hex)
}
if (message.type == "10bf06" && temp==0) {
	// web site for CRC checksum : http://www.sunshine2k.de/coding/javascript/crc/crc_js.html
	//	sendData('0610bf2061c9') //06 10 bf 20 61 c9
  sendData('10bf2060') //06 10 bf 20 61 c9

		temp++

}

})


function sendData(data) {

// when sending data: prepare the message first, then wait for opportunity to send it (wait for 10bf06 message)
// need to double check how reliable messsage sending is
// when switching back to listening, might get a message length error at first since we might be coming back in
//    in the middle of a message


	console.log("Sending: " + data); // For testing only
	
	// Compute length of final message (+1 for length byte and +1 for checksum byte)
	let length = data.length/2 + 2;
	data = length.toString(16).padStart(2,"0") + data;

	// Computer CRC checksum
	let crc = checksum(data);
	data = data + crc.toString(16).padStart(2,"0");

	// Append message start and end bytes
	data = "7e" + data + "7e"; 
console.log("hexstring: " +data) // for testing only
	// Change HEX string to ASCII characters	
	let asciiString="";
	for (let i=0; i<data.length/2; i++) {
		asciiString = asciiString + String.fromCharCode(parseInt(data.substr(i*2,2),16))
	}
	//console.log(message) // For testing only

	transmit(asciiString)() // Returns a function that needs to be executed right away
}



function transmit(asciiString) {
	return 	function() {
		DE.write(1, function() { // Switch RS485 module to transmit
			RE.write(1, function() {

				port.write(asciiString, 'ascii', function(err) {
					console.log("port.write sending:"+asciiString)
				  if (err) {
				    return console.log('Error on write: ', err.message)
				  }

				  // Switch RS485 module back to receive
				  DE.write(0)
				  RE.write(0)
				})
			})
		})
	}
}

function checksum(hexstring) {
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
    const byte = parseInt(hexstring.substr(i*2,2),16)
    crc = TABLE[(crc ^ byte) & 0xff] & 0xff;
  }
  crc^=2

  return crc.toString(16);
}


/*
const SerialPort = require('serialport')
const port = new SerialPort('/dev/ttyAMA0', {
  baudRate: 115200
})



// Open errors will be emitted as an error event
port.on('error', function(err) {
  console.log('General error: ', err.message) // ??? Will this ever happen since I left AutoOpen to default???
})

// Switches the port into "flowing mode"
port.on('data', function (data) {
  console.log(data); // data.toString() to get ASCII character OR data.hexSlice() to get straight hexadecimal
})


console.log("Ready!");
//sendData("test");

// HEX to decimal and ASCII
//https://www.rapidtables.com/convert/number/ascii-to-hex.html


	let translation="";

	let message = data.hexSlice();

	for (key in data) {
		translation+=key+"\n"
	}
	console.log(translation);
*/