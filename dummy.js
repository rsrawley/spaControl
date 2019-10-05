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


	console.log("Data: " + message.hex)

// For testing only:
let ignore = ["10bf06","10bf07","febf00","ffaf13"]
if (message.type in ignore) {
//	console.log("Data: " + message.hex)
}

})

setTimeout(function() {
	// set temp to 97
	//06 10 bf 20 61 c9
	//sendData('7e0610bf2061c97e')
	//sendData(Buffer.from(['7e','06','10','bf','20','61','c9','7e'], 'hex')) // 97 F
	//sendData(Buffer.from('7e0610bf2060ce7e', 'hex')) // 96 F
},2000)

function sendData(data) {
	console.log("Sending: " + data);
	let message=data;
/*	for (let i=0; i<data.length/2; i++) {
		message=message + String.fromCharCode(parseInt(data.substr(i*2,2),16))
		console.log(data.substr(i*2,2))
	}
	console.log(message)
*/
	port.write(message, function(err) {
	  if (err) {
	    return console.log('Error on write: ', err.message)
	  }
	})
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